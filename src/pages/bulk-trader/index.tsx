import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useBulkTrader } from './useBulkTrader';
import DigitDisplay from './digit-display';
import { MARKET_MAPPING, STRATEGY_MAPPING, STRATEGY_PAIR_MAPPING, TickData, TradeExecutionMode } from './types';
import { computeSignal, TradeSignal } from './signal';
import './bulk-trader.scss';

type ActionButton = 'Left' | 'AI' | 'Right';
const SIGNAL_CYCLE_SECONDS = 20;
const ENTER_NOW_DISPLAY_MS = 3000;

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

    const { isConnected, isAuthorized, accountInfo, tickSequence, subscribeTicks, executeBulkTrades } = useBulkTrader();

    const loopIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // Which contract_type the running loop is currently firing. Starts at whichever
    // side/strategy was chosen; Auto Flip switches it to the opposite side after a loss.
    const directionRef = useRef<string>('');
    // Running total profit for the current session — checked by Stop Win.
    const cumulativeProfitRef = useRef<number>(0);

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

    // Signal cycle: lock in a signal, count down, flash "ENTER NOW" at zero, then
    // compute a fresh signal for the next cycle. Restarts whenever the strategy,
    // market, or prediction (used as the Over/Under threshold) changes.
    useEffect(() => {
        setSignal(computeSignal(strategy, tickSequenceRef.current, prediction));
        setSignalCountdown(SIGNAL_CYCLE_SECONDS);
        setIsEnterNow(false);

        const interval = setInterval(() => {
            setSignalCountdown((prev) => {
                if (prev <= 1) {
                    setIsEnterNow(true);
                    setTimeout(() => {
                        setSignal(computeSignal(strategy, tickSequenceRef.current, prediction));
                        setIsEnterNow(false);
                    }, ENTER_NOW_DISPLAY_MS);
                    return SIGNAL_CYCLE_SECONDS;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [strategy, market, prediction]);

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

    const stopLoop = useCallback(() => {
        if (loopIntervalRef.current) {
            clearInterval(loopIntervalRef.current);
            loopIntervalRef.current = null;
        }
        setRunningButton(null);
    }, []);

    const triggerBatch = useCallback((contractType: string) => {
        executeBulkTrades(
            executionMode,
            bulkCount,
            {
                symbol: MARKET_MAPPING[market],
                contract_type: contractType,
                amount: stake,
                duration,
                prediction: requiresPrediction ? prediction : undefined,
            },
            (result) => {
                if (result.success) {
                    setTradesFired((prev) => prev + 1);
                } else if (result.error) {
                    setLastError(result.error);
                }
            },
            (settled) => {
                // Stop Win: accumulate profit across the whole run; the moment we're
                // net positive, stop immediately — matches "close all trades when in
                // profit" rather than waiting for a fixed target.
                if (stopWinEnabled) {
                    cumulativeProfitRef.current += settled.profit;
                    if (cumulativeProfitRef.current > 0) {
                        stopLoop();
                        return;
                    }
                }

                // Auto Flip: switch to the opposite side of the current strategy pair
                // after any loss (Even -> Odd, Over -> Under, Match -> Differ, etc).
                // Reads/writes directionRef so the next scheduled batch picks it up —
                // in-flight trades from the batch already fired are unaffected.
                if (autoFlipEnabled && !settled.won) {
                    directionRef.current =
                        directionRef.current === pair.left.contract_type
                            ? pair.right.contract_type
                            : pair.left.contract_type;
                }
            }
        );
    }, [executionMode, bulkCount, market, stake, duration, requiresPrediction, prediction, executeBulkTrades, stopWinEnabled, autoFlipEnabled, pair, stopLoop]);

    const startLoop = useCallback((button: ActionButton) => {
        // Only one button can be actively firing trades at a time — starting a
        // new one stops whichever was previously running.
        if (loopIntervalRef.current) {
            clearInterval(loopIntervalRef.current);
            loopIntervalRef.current = null;
        }

        const initialType =
            button === 'Left' ? pair.left.contract_type :
            button === 'Right' ? pair.right.contract_type :
            STRATEGY_MAPPING[strategy];

        directionRef.current = initialType;
        cumulativeProfitRef.current = 0;
        setLastError(null);
        setTradesFired(0);

        const fire = () => triggerBatch(directionRef.current);
        fire();

        const delayPerTrade = executionMode === 'FAST' ? 50 : 300;
        const cycleMs = bulkCount * delayPerTrade + 750; // let the current batch fully finish before repeating

        loopIntervalRef.current = setInterval(fire, cycleMs);

        setRunningButton(button);
    }, [triggerBatch, executionMode, bulkCount, pair, strategy]);

    // Press once to start, press the same button again to stop.
    const handleToggle = (button: ActionButton) => {
        if (!canTrade) return;
        if (runningButton === button) {
            stopLoop();
        } else {
            startLoop(button);
        }
    };

    // Clean up the running loop on unmount so it doesn't keep firing trades
    // after the user navigates away from the tab.
    useEffect(() => {
        return () => {
            if (loopIntervalRef.current) clearInterval(loopIntervalRef.current);
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
            {signal && (
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
                        <button
                            type="button"
                            className="signal-apply-btn"
                            disabled={formDisabled}
                            onClick={() => setPrediction(signal.digit as number)}
                        >
                            Use Digit {signal.digit}
                        </button>
                    )}
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
                            </strong> · {tradesFired} trade{tradesFired === 1 ? '' : 's'} fired
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
