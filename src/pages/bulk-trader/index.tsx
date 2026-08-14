import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useBulkTrader } from './useBulkTrader';
import DigitDisplay from './digit-display';
import { MARKET_MAPPING, STRATEGY_MAPPING, STRATEGY_PAIR_MAPPING, TickData, TradeExecutionMode } from './types';
import { computeSignal, TradeSignal } from './signal';
import './bulk-trader.scss';

type ActionButton = 'Left' | 'AI' | 'Right';
const SIGNAL_CYCLE_SECONDS = 20;
const ENTER_NOW_DISPLAY_MS = 3000;
// Wait for at least this many ticks before showing a first signal, so the very
// first reading isn't based on just 1-2 ticks of noise.
const MIN_TICKS_FOR_SIGNAL = 20;

const BulkTrader = () => {
    const [market, setMarket] = useState<string>('Vol 10 (1s)');
    const [strategy, setStrategy] = useState<string>('Even');
    const [stake, setStake] = useState<number>(0.5);
    const [duration, setDuration] = useState<number>(1);
    const [bulkCount, setBulkCount] = useState<number>(10);
    const [prediction, setPrediction] = useState<number>(1);
    const [executionMode, setExecutionMode] = useState<TradeExecutionMode>('FAST');

    // Which of the three action buttons (if any) is currently running.
    const [runningButton, setRunningButton] = useState<ActionButton | null>(null);
    const [lastError, setLastError] = useState<string | null>(null);
    const [tradesFired, setTradesFired] = useState<number>(0);
    const [autoFlipEnabled, setAutoFlipEnabled] = useState<boolean>(false);
    const [stopWinEnabled, setStopWinEnabled] = useState<boolean>(false);
    // Digit actually locked in for the currently-running batch — shown in the status
    // pill so it can't drift out of sync with the live Prediction field in the
    // background (see runPredictionRef).
    const [lockedPrediction, setLockedPrediction] = useState<number | null>(null);

    const { isConnected, isAuthorized, accountInfo, tickSequence, subscribeTicks, executeBulkTrades } = useBulkTrader();

    // Which contract_type the running batch is currently firing. Starts at whichever
    // side/strategy was chosen; Auto Flip switches it to the opposite side after a
    // loss. Read fresh before each individual trade (see useBulkTrader), so a flip
    // takes effect on the very next trade, not just on the next separate run.
    const directionRef = useRef<string>('');
    // Running total profit for the current session — checked by Stop Win.
    const cumulativeProfitRef = useRef<number>(0);
    // Cancels any not-yet-fired trades in the current batch — used by manual Stop
    // and by Stop Win (which needs to halt remaining trades immediately).
    const cancelRunRef = useRef<() => void>(() => {});
    // Auto-clears the "running" UI state once the fixed-size batch has finished
    // firing all its trades (bulkCount total, not repeating forever).
    const completionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Lets the signal cycle read the current Prediction value fresh without
    // restarting on every change (see the signal effect below).
    const predictionRef = useRef<number>(prediction);
    // Snapshot of the digit for the CURRENT run only — captured once when a button
    // is pressed and held fixed for every trade in that batch. This is deliberately
    // separate from predictionRef/the live signal: all bulkCount trades in one run
    // should target the same digit (e.g. "10 trades at digit 8" means all 10 use
    // barrier 8), even if the signal ticks over to a different digit mid-run. Only
    // the side (Match/Differ, Over/Under, etc.) is allowed to change mid-run, via
    // Auto Flip — the digit itself never should.
    const runPredictionRef = useRef<number>(prediction);

    // Signal indicator: recommends a side (or digit) and cycles on a countdown so
    // the user has a consistent, structured moment to act rather than reacting to
    // every tick. tickSequenceRef lets the interval read the latest ticks without
    // needing to restart every time a new tick arrives.
    const [signal, setSignal] = useState<TradeSignal | null>(null);
    const [signalCountdown, setSignalCountdown] = useState<number>(SIGNAL_CYCLE_SECONDS);
    const [isEnterNow, setIsEnterNow] = useState<boolean>(false);
    const tickSequenceRef = useRef<TickData[]>([]);

    useEffect(() => {
        if (isConnected && MARKET_MAPPING[market]) {
            subscribeTicks(MARKET_MAPPING[market]);
        }
    }, [isConnected, market, subscribeTicks]);

    useEffect(() => {
        tickSequenceRef.current = tickSequence;
    }, [tickSequence]);

    useEffect(() => {
        predictionRef.current = prediction;
    }, [prediction]);

    // Applies a new signal and, for digit-based strategies, auto-fills Prediction
    // with the recommended digit — digit markets move fast enough that requiring a
    // manual "apply" click risked missing the entry window.
    const applySignal = useCallback((newSignal: TradeSignal | null) => {
        setSignal(newSignal);
        if (newSignal?.digit !== undefined) {
            setPrediction(newSignal.digit);
        }
    }, []);

    // Signal cycle: wait for enough tick data, lock in a signal, count down, flash
    // "ENTER NOW" at zero, then compute a fresh signal for the next cycle. Restarts
    // when strategy or market changes. Deliberately does NOT depend on `prediction`
    // (reads it via predictionRef instead) — since applySignal can itself update
    // prediction, depending on it here would restart this effect every cycle.
    useEffect(() => {
        setSignal(null);
        setSignalCountdown(SIGNAL_CYCLE_SECONDS);
        setIsEnterNow(false);

        let hasSignal = false;
        const tryComputeInitial = () => {
            if (tickSequenceRef.current.length >= MIN_TICKS_FOR_SIGNAL) {
                applySignal(computeSignal(strategy, tickSequenceRef.current, predictionRef.current));
                return true;
            }
            return false;
        };
        hasSignal = tryComputeInitial();

        const interval = setInterval(() => {
            if (!hasSignal) {
                hasSignal = tryComputeInitial();
                return; // still gathering data — don't start counting down yet
            }
            setSignalCountdown((prev) => {
                if (prev <= 1) {
                    setIsEnterNow(true);
                    setTimeout(() => {
                        applySignal(computeSignal(strategy, tickSequenceRef.current, predictionRef.current));
                        setIsEnterNow(false);
                    }, ENTER_NOW_DISPLAY_MS);
                    return SIGNAL_CYCLE_SECONDS;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [strategy, market, applySignal]);

    const requiresPrediction = ['Matches', 'Differs', 'Over', 'Under'].includes(strategy);

    // Even/Odd only cares about parity, so E/O is the clearer view. Every other
    // strategy (Matches, Differs, Over/Under, and the non-digit ones) is about the
    // specific digit, so show the real 0-9 value instead — matches how the digit
    // heatmap above it already breaks things down per-digit.
    const digitDisplayMode: 'even_odd' | 'digit' = ['Even', 'Odd'].includes(strategy) ? 'even_odd' : 'digit';

    // The two main action buttons take their label + contract_type from whichever
    // strategy is selected in the dropdown — e.g. "Over" shows "Bulk Over" / "Bulk
    // Under" instead of always showing "Bulk Even" / "Bulk Odd". Also gives Auto
    // Flip the "opposite side" to switch to after a loss.
    const pair = useMemo(
        () => STRATEGY_PAIR_MAPPING[strategy] ?? {
            left: { label: strategy, contract_type: STRATEGY_MAPPING[strategy] },
            right: { label: strategy, contract_type: STRATEGY_MAPPING[strategy] },
        },
        [strategy]
    );

    // Trading is only enabled once the shared Deriv connection is both open AND
    // authorized against the logged-in account (not just socket-open).
    const canTrade = isConnected && isAuthorized;

    // Stops the current run: cancels any not-yet-fired trades in the batch, clears
    // the auto-completion timer, and resets the UI to idle. Used for manual Stop,
    // Stop Win, and cleanup on unmount/disconnect.
    const stopLoop = useCallback(() => {
        cancelRunRef.current();
        cancelRunRef.current = () => {};
        if (completionTimeoutRef.current) {
            clearTimeout(completionTimeoutRef.current);
            completionTimeoutRef.current = null;
        }
        setRunningButton(null);
        setLockedPrediction(null);
    }, []);

    const startLoop = useCallback((button: ActionButton) => {
        // Only one button can be actively firing trades at a time — starting a
        // new one cancels whichever was previously running.
        cancelRunRef.current();
        if (completionTimeoutRef.current) {
            clearTimeout(completionTimeoutRef.current);
            completionTimeoutRef.current = null;
        }

        const initialType =
            button === 'Left' ? pair.left.contract_type :
            button === 'Right' ? pair.right.contract_type :
            STRATEGY_MAPPING[strategy];

        directionRef.current = initialType;
        runPredictionRef.current = predictionRef.current; // lock the digit for this whole run
        setLockedPrediction(requiresPrediction ? predictionRef.current : null);
        cumulativeProfitRef.current = 0;
        setLastError(null);
        setTradesFired(0);

        // getDynamicParams is called fresh by useBulkTrader immediately before each
        // individual trade fires. contract_type reads directionRef (which Auto Flip
        // can change trade-to-trade), but prediction reads the fixed run-start
        // snapshot — the digit stays the same for every trade in this batch.
        const getDynamicParams = () => ({
            contract_type: directionRef.current,
            prediction: requiresPrediction ? runPredictionRef.current : undefined,
        });

        const cancel = executeBulkTrades(
            executionMode,
            bulkCount, // TOTAL trades for this run — fires exactly this many, then stops.
            {
                symbol: MARKET_MAPPING[market],
                amount: stake,
                duration,
            },
            getDynamicParams,
            (result) => {
                if (result.success) {
                    setTradesFired((prev) => prev + 1);
                } else if (result.error) {
                    setLastError(result.error);
                }
            },
            (settled) => {
                // Stop Win: accumulate profit across the run; the moment we're net
                // positive, cancel any remaining not-yet-fired trades immediately —
                // matches "no more trades once the session is in profit" rather than
                // letting the rest of the batch fire first.
                if (stopWinEnabled) {
                    cumulativeProfitRef.current += settled.profit;
                    if (cumulativeProfitRef.current > 0) {
                        stopLoop();
                        return;
                    }
                }

                // Auto Flip: switch to the opposite side of the current strategy pair
                // after any loss (Even -> Odd, Over -> Under, Match -> Differ, etc).
                // Writes directionRef, which getDynamicParams reads fresh on the very
                // next trade in this same batch.
                if (autoFlipEnabled && !settled.won) {
                    directionRef.current =
                        directionRef.current === pair.left.contract_type
                            ? pair.right.contract_type
                            : pair.left.contract_type;
                }
            }
        );

        cancelRunRef.current = cancel;

        // Auto-return to idle once all bulkCount trades have been fired (not
        // necessarily settled yet — settlement continues updating Transactions/
        // Summary/Journal in the background regardless of this UI state).
        const delayPerTrade = executionMode === 'FAST' ? 50 : 300;
        const totalFireDurationMs = bulkCount * delayPerTrade + 500;
        completionTimeoutRef.current = setTimeout(() => {
            setRunningButton(null);
            setLockedPrediction(null);
            completionTimeoutRef.current = null;
        }, totalFireDurationMs);

        setRunningButton(button);
    }, [executionMode, bulkCount, market, stake, duration, requiresPrediction, executeBulkTrades, stopWinEnabled, autoFlipEnabled, pair, strategy, stopLoop]);

    // Press once to start, press the same button again to stop early.
    const handleToggle = (button: ActionButton) => {
        if (!canTrade) return;
        if (runningButton === button) {
            stopLoop();
        } else {
            startLoop(button);
        }
    };

    // Clean up the running batch on unmount so it doesn't keep firing trades
    // after the user navigates away from the tab.
    useEffect(() => {
        return () => {
            cancelRunRef.current();
            if (completionTimeoutRef.current) clearTimeout(completionTimeoutRef.current);
        };
    }, []);

    // Auto-stop if the connection to the account drops while a loop is running.
    useEffect(() => {
        if (!canTrade && runningButton) {
            stopLoop();
        }
    }, [canTrade, runningButton, stopLoop]);

    const formDisabled = !!runningButton;

    return (
        <div className="bulk-trader-wrapper">
            {/* Account Connection Status */}
            <div className={`connection-banner ${canTrade ? 'connected' : 'disconnected'}`}>
                <span className="dot" />
                {canTrade ? (
                    <span>
                        Connected — <strong>{accountInfo?.loginid || 'account'}</strong>
                        {accountInfo?.currency && accountInfo?.balance !== undefined && (
                            <> · {accountInfo.balance} {accountInfo.currency}</>
                        )}
                    </span>
                ) : isConnected ? (
                    <span>Connected to Deriv, but not logged in to an account. Please log in to trade.</span>
                ) : (
                    <span>Not connected to Deriv. Please log in to trade.</span>
                )}
            </div>

            {/* Signal Indicator — recommends a side/digit and cycles on a countdown */}
            {signal ? (
                <div className={`signal-card ${isEnterNow ? 'enter-now' : ''}`}>
                    <div className="signal-info">
                        <span className="signal-label">SIGNAL</span>
                        <span className="signal-value">
                            {signal.digit !== undefined ? `${signal.label} · Digit ${signal.digit}` : signal.label}
                        </span>
                    </div>
                    <div className="signal-countdown">
                        {isEnterNow ? (
                            <span className="enter-now-text">ENTER NOW</span>
                        ) : (
                            <span>Next signal in {signalCountdown}s</span>
                        )}
                    </div>
                    {signal.digit !== undefined && (
                        <span className="signal-auto-applied">Prediction auto-set to {signal.digit}</span>
                    )}
                </div>
            ) : (
                <div className="signal-card analyzing">
                    <div className="signal-info">
                        <span className="signal-label">SIGNAL</span>
                        <span className="signal-value">Analyzing market…</span>
                    </div>
                    <div className="signal-countdown">
                        <span>Gathering {MIN_TICKS_FOR_SIGNAL} ticks before first signal</span>
                    </div>
                </div>
            )}

            <div className="top-grid">
                {/* Controls Card */}
                <div className="control-card">
                    <div className="form-row">
                        <div className="form-group">
                            <label>MARKET</label>
                            <select value={market} disabled={formDisabled} onChange={(e) => setMarket(e.target.value)}>
                                {Object.keys(MARKET_MAPPING).map((m) => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>STRATEGY</label>
                            <select value={strategy} disabled={formDisabled} onChange={(e) => setStrategy(e.target.value)}>
                                {Object.keys(STRATEGY_MAPPING).map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>STAKE (USD)</label>
                            <input 
                                type="number" 
                                step="0.1" 
                                min="0.35" 
                                value={stake} 
                                disabled={formDisabled}
                                onChange={(e) => setStake(Number(e.target.value))} 
                            />
                        </div>
                        {requiresPrediction && (
                            <div className="form-group">
                                <label>PREDICTION</label>
                                <input 
                                    type="number" 
                                    min="0" 
                                    max="9" 
                                    value={prediction} 
                                    disabled={formDisabled}
                                    onChange={(e) => setPrediction(Number(e.target.value))} 
                                />
                            </div>
                        )}
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>DURATION (TICKS)</label>
                            <input 
                                type="number" 
                                min="1" 
                                max="10" 
                                value={duration} 
                                disabled={formDisabled}
                                onChange={(e) => setDuration(Number(e.target.value))} 
                            />
                        </div>
                        <div className="form-group">
                            <label>NO. OF BULK TRADES</label>
                            <input 
                                type="number" 
                                min="1" 
                                max="50" 
                                value={bulkCount} 
                                disabled={formDisabled}
                                onChange={(e) => setBulkCount(Number(e.target.value))} 
                            />
                        </div>
                    </div>

                    <div className="form-row checkbox-row">
                        <label className="checkbox-field">
                            <input
                                type="checkbox"
                                checked={autoFlipEnabled}
                                disabled={formDisabled}
                                onChange={(e) => setAutoFlipEnabled(e.target.checked)}
                            />
                            <span>
                                Auto Flip
                                <small>Switch between {pair.left.label} and {pair.right.label} after a loss</small>
                            </span>
                        </label>
                        <label className="checkbox-field">
                            <input
                                type="checkbox"
                                checked={stopWinEnabled}
                                disabled={formDisabled}
                                onChange={(e) => setStopWinEnabled(e.target.checked)}
                            />
                            <span>
                                Stop Win
                                <small>Auto-stop once the session is in profit</small>
                            </span>
                        </label>
                    </div>
                </div>

                {/* Digit Visualizer Display */}
                <div className="visualizer-card">
                    <DigitDisplay ticks={tickSequence} mode={digitDisplayMode} />
                </div>
            </div>

            {/* Bulk Action Controls — press once to start, press again to stop */}
            <div className="action-pad-card">
                <button 
                    className={`btn-action-left ${runningButton === 'Left' ? 'running' : ''} ${!runningButton && signal?.side === 'left' ? 'signal-match' : ''}`}
                    onClick={() => handleToggle('Left')}
                    disabled={!canTrade || (formDisabled && runningButton !== 'Left')}
                >
                    <span className="icon">{runningButton === 'Left' ? '■' : '⧈'}</span>
                    {runningButton === 'Left' ? 'Stop' : `Bulk ${pair.left.label}`}
                </button>
                <button 
                    className={`btn-action-ai ${runningButton === 'AI' ? 'running' : ''}`}
                    onClick={() => handleToggle('AI')}
                    disabled={!canTrade || (formDisabled && runningButton !== 'AI')}
                >
                    {runningButton === 'AI' ? 'Stop' : `AI: ${strategy}`}
                </button>
                <button 
                    className={`btn-action-right ${runningButton === 'Right' ? 'running' : ''} ${!runningButton && signal?.side === 'right' ? 'signal-match' : ''}`}
                    onClick={() => handleToggle('Right')}
                    disabled={!canTrade || (formDisabled && runningButton !== 'Right')}
                >
                    <span className="icon">{runningButton === 'Right' ? '■' : '▲'}</span>
                    {runningButton === 'Right' ? 'Stop' : `Bulk ${pair.right.label}`}
                </button>
            </div>

            {/* Execution Status Footer */}
            <div className="footer-control-bar">
                <div className="status-pill">
                    {runningButton ? (
                        <span>
                            Running <strong>
                                {runningButton === 'Left' ? pair.left.label : runningButton === 'Right' ? pair.right.label : `AI (${strategy})`}
                                {lockedPrediction !== null ? ` · Digit ${lockedPrediction}` : ''}
                            </strong> · {tradesFired}/{bulkCount} trade{bulkCount === 1 ? '' : 's'} fired
                        </span>
                    ) : (
                        <span>Idle</span>
                    )}
                </div>
                {lastError && <div className="error-pill">{lastError}</div>}
                <div className="execution-pill">
                    <span>Execution <strong>{executionMode}</strong></span>
                    <label className="switch">
                        <input 
                            type="checkbox" 
                            checked={executionMode === 'FAST'}
                            disabled={formDisabled}
                            onChange={(e) => setExecutionMode(e.target.checked ? 'FAST' : 'SLOW')}
                        />
                        <span className="slider"></span>
                    </label>
                </div>
            </div>
        </div>
    );
};

export default BulkTrader;
