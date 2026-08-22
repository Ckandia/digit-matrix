import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useBulkTrader } from './useBulkTrader';
import DigitDisplay from './digit-display';
import { DEFAULT_DURATION_CONSTRAINT, DURATION_CONSTRAINTS, MARKET_MAPPING, STRATEGY_MAPPING, STRATEGY_PAIR_MAPPING, TickData, TradeExecutionMode } from './types';
import { computeSignal, TradeSignal } from './signal';
import './bulk-trader.scss';

type ActionButton = 'Left' | 'AI' | 'Right' | 'Both';
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
    // Fires trades on BOTH sides of the current pair at once each round (e.g. Even
    // AND Odd, Rise AND Fall). Mutually exclusive with Auto Flip — there's no
    // "opposite side" to flip to when both are already being traded every round.
    const [bothSidesEnabled, setBothSidesEnabled] = useState<boolean>(false);
    // Cap on how high Auto Flip's loss-recovery stake can climb — required whenever
    // Auto Flip is on, to bound the risk of a losing streak (see runStakeRef below).
    const [maxStake, setMaxStake] = useState<number>(5);
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
    // Cancels any not-yet-fired trades in the current batch(es) — used by manual
    // Stop and by Stop Win (which needs to halt remaining trades immediately). An
    // array because Both Sides mode runs two parallel batches at once.
    const cancelFnsRef = useRef<Array<() => void>>([]);
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
    // Current stake for the running batch. Starts at the base Stake field each run;
    // when Auto Flip is on, a loss doubles it (classic martingale recovery — a win
    // after N losses at doubling stakes recovers the prior losses plus the original
    // target), capped at maxStake so a losing streak can't compound indefinitely. A
    // win resets it back to the base stake. Read fresh per-trade (see useBulkTrader),
    // same mechanism as directionRef/runPredictionRef.
    const runStakeRef = useRef<number>(stake);
    // Which account (loginid) this run started on — if the user switches accounts
    // mid-run (demo<->real, or between two real accounts), the run is stopped
    // immediately rather than continuing to fire trades under a different account.
    const runLoginIdRef = useRef<string | undefined>(undefined);

    // Signal indicator: recommends a side (or digit) and cycles on a countdown so
    // the user has a consistent, structured moment to act rather than reacting to
    // every tick. tickSequenceRef lets the interval read the latest ticks without
    // needing to restart every time a new tick arrives.
    const [signal, setSignal] = useState<TradeSignal | null>(null);
    const [signalCountdown, setSignalCountdown] = useState<number>(SIGNAL_CYCLE_SECONDS);
    const [isEnterNow, setIsEnterNow] = useState<boolean>(false);
    const tickSequenceRef = useRef<TickData[]>([]);
    // Keeps the signal refreshing every 500ms during the "ENTER NOW" flash — see
    // the timing fix below for why.
    const enterNowRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    // when strategy, market, or duration changes (duration changes what window the
    // price-direction contracts are checked over — see signal.ts). Deliberately does
    // NOT depend on `prediction` (reads it via predictionRef instead) — since
    // applySignal can itself update prediction, depending on it here would restart
    // this effect every cycle.
    //
    // TIMING FIX: the signal shown during "ENTER NOW" is now recomputed at the exact
    // moment the flash starts, not 20 seconds earlier. Previously the signal was
    // locked in at the start of the countdown and held frozen for the full 20s while
    // fresh ticks kept arriving in the background — so by the time "ENTER NOW"
    // appeared, the recommendation could already be based on up to 20 stale ticks
    // (a lot, on a 1-second-tick market). That's what caused entries to feel early or
    // late. It's also refreshed every 500ms for the duration of the flash itself, so
    // whenever within that window you actually click, it's based on very recent data
    // rather than a single snapshot from the instant the flash began.
    useEffect(() => {
        setSignal(null);
        setSignalCountdown(SIGNAL_CYCLE_SECONDS);
        setIsEnterNow(false);

        let hasSignal = false;
        const tryComputeInitial = () => {
            if (tickSequenceRef.current.length >= MIN_TICKS_FOR_SIGNAL) {
                applySignal(computeSignal(strategy, tickSequenceRef.current, predictionRef.current, duration));
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
                    // Compute fresh RIGHT NOW, at the moment the flash begins — this is
                    // the data the user will actually act on.
                    applySignal(computeSignal(strategy, tickSequenceRef.current, predictionRef.current, duration));
                    setIsEnterNow(true);

                    if (enterNowRefreshRef.current) clearInterval(enterNowRefreshRef.current);
                    enterNowRefreshRef.current = setInterval(() => {
                        applySignal(computeSignal(strategy, tickSequenceRef.current, predictionRef.current, duration));
                    }, 500);

                    setTimeout(() => {
                        if (enterNowRefreshRef.current) {
                            clearInterval(enterNowRefreshRef.current);
                            enterNowRefreshRef.current = null;
                        }
                        setIsEnterNow(false);
                    }, ENTER_NOW_DISPLAY_MS);

                    return SIGNAL_CYCLE_SECONDS;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            clearInterval(interval);
            if (enterNowRefreshRef.current) {
                clearInterval(enterNowRefreshRef.current);
                enterNowRefreshRef.current = null;
            }
        };
    }, [strategy, market, duration, applySignal]);

    const requiresPrediction = ['Matches', 'Differs', 'Over', 'Under'].includes(strategy);

    // A few contract types require a different tick-duration range than the default
    // 1-10 — e.g. Only Ups/Only Downs (RUNHIGH/RUNLOW) require 2-5 ticks specifically
    // on Deriv's platform. Trading outside the range gets silently rejected, so the
    // input's min/max follow this, and the value is clamped into range on switch.
    const durationConstraint = DURATION_CONSTRAINTS[strategy] ?? DEFAULT_DURATION_CONSTRAINT;

    useEffect(() => {
        setDuration((prev) => Math.min(Math.max(prev, durationConstraint.min), durationConstraint.max));
    }, [durationConstraint.min, durationConstraint.max]);

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

    // Stops the current run: cancels any not-yet-fired trades in the batch(es),
    // clears the auto-completion timer, and resets the UI to idle. Used for manual
    // Stop, Stop Win, and cleanup on unmount/disconnect.
    const stopLoop = useCallback(() => {
        cancelFnsRef.current.forEach((fn) => fn());
        cancelFnsRef.current = [];
        if (completionTimeoutRef.current) {
            clearTimeout(completionTimeoutRef.current);
            completionTimeoutRef.current = null;
        }
        setRunningButton(null);
        setLockedPrediction(null);
    }, []);

    const startLoop = useCallback((button: ActionButton) => {
        // Only one run can be active at a time — starting a new one cancels
        // whichever batch(es) were previously running.
        cancelFnsRef.current.forEach((fn) => fn());
        cancelFnsRef.current = [];
        if (completionTimeoutRef.current) {
            clearTimeout(completionTimeoutRef.current);
            completionTimeoutRef.current = null;
        }

        runPredictionRef.current = predictionRef.current; // lock the digit for this whole run
        runStakeRef.current = stake; // reset to base stake at the start of every run
        runLoginIdRef.current = accountInfo?.loginid; // remember which account this run is for
        setLockedPrediction(requiresPrediction ? predictionRef.current : null);
        cumulativeProfitRef.current = 0;
        setLastError(null);
        setTradesFired(0);

        const sequential = autoFlipEnabled || stopWinEnabled;

        const onTradeResult = (result: { index: number; success: boolean; error?: string }) => {
            if (result.success) {
                setTradesFired((prev) => prev + 1);
            } else if (result.error) {
                setLastError(result.error);
            }
        };

        const onContractSettled = (settled: { contract_type: string; profit: number; won: boolean }) => {
            // Always track cumulative session P&L — both Stop Win and Auto Flip now
            // key off the OVERALL running total, not just the single most recent
            // trade's result.
            cumulativeProfitRef.current += settled.profit;

            // Stop Win: the moment the session is net positive, cancel any remaining
            // not-yet-fired trades immediately — "no more trades once in profit"
            // rather than letting the rest of the batch fire first.
            if (stopWinEnabled && cumulativeProfitRef.current > 0) {
                stopLoop();
                return;
            }

            // Auto Flip now triggers off the OVERALL session P&L, not "did the last
            // single trade lose" — e.g. if you're up overall, a single loss won't
            // flip anything; it only flips while the session as a whole is behind.
            if (autoFlipEnabled) {
                if (cumulativeProfitRef.current < 0) {
                    directionRef.current =
                        directionRef.current === pair.left.contract_type
                            ? pair.right.contract_type
                            : pair.left.contract_type;
                    runStakeRef.current = Math.min(runStakeRef.current * 2, maxStake);
                } else {
                    runStakeRef.current = stake;
                }
            }
        };

        const totalBatches = button === 'Both' ? 2 : 1;
        let batchesRemaining = totalBatches;
        const onOneBatchComplete = () => {
            batchesRemaining -= 1;
            if (batchesRemaining <= 0) {
                setRunningButton(null);
                setLockedPrediction(null);
                if (completionTimeoutRef.current) {
                    clearTimeout(completionTimeoutRef.current);
                    completionTimeoutRef.current = null;
                }
            }
        };

        if (button === 'Both') {
            // Buys both sides of the pair every round (e.g. Even AND Odd at once).
            // Auto Flip is disabled in this mode (mutually exclusive in the UI —
            // there's no "opposite side" to flip to when both are already being
            // traded), so each side just fires at the fixed base stake/contract_type.
            directionRef.current = pair.left.contract_type; // reference only, not used for flipping here
            const cancelLeft = executeBulkTrades(
                executionMode,
                bulkCount,
                { symbol: MARKET_MAPPING[market], duration },
                () => ({
                    contract_type: pair.left.contract_type,
                    prediction: requiresPrediction ? runPredictionRef.current : undefined,
                    amount: stake,
                }),
                onTradeResult,
                onContractSettled,
                sequential,
                onOneBatchComplete
            );
            const cancelRight = executeBulkTrades(
                executionMode,
                bulkCount,
                { symbol: MARKET_MAPPING[market], duration },
                () => ({
                    contract_type: pair.right.contract_type,
                    prediction: requiresPrediction ? runPredictionRef.current : undefined,
                    amount: stake,
                }),
                onTradeResult,
                onContractSettled,
                sequential,
                onOneBatchComplete
            );
            cancelFnsRef.current = [cancelLeft, cancelRight];
        } else {
            const initialType =
                button === 'Left' ? pair.left.contract_type :
                button === 'Right' ? pair.right.contract_type :
                STRATEGY_MAPPING[strategy];

            directionRef.current = initialType;

            // getDynamicParams is called fresh by useBulkTrader immediately before
            // each individual trade fires. contract_type and amount can change
            // trade-to-trade (Auto Flip / loss-recovery); prediction reads the fixed
            // run-start snapshot — the digit stays the same for every trade in this
            // batch.
            const getDynamicParams = () => ({
                contract_type: directionRef.current,
                prediction: requiresPrediction ? runPredictionRef.current : undefined,
                amount: runStakeRef.current,
            });

            const cancel = executeBulkTrades(
                executionMode,
                bulkCount, // TOTAL trades for this run — fires exactly this many, then stops.
                { symbol: MARKET_MAPPING[market], duration },
                getDynamicParams,
                onTradeResult,
                onContractSettled,
                sequential,
                onOneBatchComplete
            );
            cancelFnsRef.current = [cancel];
        }

        // Safety-net only: if something goes wrong (e.g. a proposal_open_contract
        // subscription never resolves after a network hiccup) and the batch-complete
        // callback above never fires, this guarantees the UI doesn't stay stuck on
        // "running" forever. Generous on purpose — sequential runs can legitimately
        // take a while (each trade waits for its own settlement). Both-side batches
        // run in parallel (not doubled end-to-end), so the timing math is the same
        // regardless of whether one or two batches are active.
        const delayPerTrade = executionMode === 'FAST' ? 50 : 300;
        const sequentialSafetyMs = bulkCount * 15000; // ~15s per trade, generous ceiling
        const burstSafetyMs = bulkCount * delayPerTrade + 2000;
        const safetyMs = sequential ? sequentialSafetyMs : burstSafetyMs;
        completionTimeoutRef.current = setTimeout(() => {
            setRunningButton(null);
            setLockedPrediction(null);
            completionTimeoutRef.current = null;
        }, safetyMs);

        setRunningButton(button);
    }, [executionMode, bulkCount, market, stake, duration, requiresPrediction, executeBulkTrades, stopWinEnabled, autoFlipEnabled, maxStake, pair, strategy, stopLoop, accountInfo]);

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
            cancelFnsRef.current.forEach((fn) => fn());
            if (completionTimeoutRef.current) clearTimeout(completionTimeoutRef.current);
        };
    }, []);

    // Auto-stop if the connection to the account drops, OR if the active account
    // changes, while a run is active — prevents a batch that was started for one
    // account from continuing to fire trades after the user switches accounts.
    useEffect(() => {
        if (!runningButton) return;
        if (!canTrade || accountInfo?.loginid !== runLoginIdRef.current) {
            stopLoop();
        }
    }, [canTrade, runningButton, accountInfo?.loginid, stopLoop]);

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

            {/* Signal Indicator — shows the recent split plainly; only highlights a
                side when it's meaningfully lopsided (not a confidence score, just a
                display threshold — see signal.ts for why no score is computed) */}
            {signal ? (
                <div className={`signal-card ${isEnterNow && !signal.noTrade ? 'enter-now' : ''} ${signal.noTrade ? 'no-trade' : ''}`}>
                    <div className="signal-info">
                        <span className="signal-label">SIGNAL</span>
                        <span className="signal-value">
                            {signal.noTrade
                                ? 'NO TRADE — too close to call'
                                : (signal.digit !== undefined ? `${signal.label} · Digit ${signal.digit}` : signal.label)}
                        </span>
                        <span className="signal-split">{signal.splitLabel}</span>
                    </div>
                    <div className="signal-countdown">
                        {isEnterNow && !signal.noTrade ? (
                            <span className="enter-now-text">ENTER NOW</span>
                        ) : (
                            <span>Next signal in {signalCountdown}s</span>
                        )}
                    </div>
                    {!signal.noTrade && signal.digit !== undefined && (
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
                                min={durationConstraint.min} 
                                max={durationConstraint.max} 
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
                                disabled={formDisabled || bothSidesEnabled}
                                onChange={(e) => {
                                    setAutoFlipEnabled(e.target.checked);
                                    if (e.target.checked) setBothSidesEnabled(false);
                                }}
                            />
                            <span>
                                Auto Flip
                                <small>Switch to {pair.right.label}/{pair.left.label} and double the stake while the overall session is in loss</small>
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

                    <div className="form-row checkbox-row">
                        <label className="checkbox-field">
                            <input
                                type="checkbox"
                                checked={bothSidesEnabled}
                                disabled={formDisabled || autoFlipEnabled}
                                onChange={(e) => {
                                    setBothSidesEnabled(e.target.checked);
                                    if (e.target.checked) setAutoFlipEnabled(false);
                                }}
                            />
                            <span>
                                Both Sides
                                <small>Buy {pair.left.label} and {pair.right.label} at the same time every round — with sub-100% payouts this guarantees a net loss over many rounds (house edge on both sides), not a hedge</small>
                            </span>
                        </label>
                    </div>

                    {autoFlipEnabled && (
                        <div className="form-row">
                            <div className="form-group">
                                <label>MAX STAKE (USD)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    min={stake}
                                    value={maxStake}
                                    disabled={formDisabled}
                                    onChange={(e) => setMaxStake(Number(e.target.value))}
                                />
                                <small className="field-hint">Caps how high the recovery stake can climb while the session is in loss</small>
                            </div>
                        </div>
                    )}
                </div>

                {/* Digit Visualizer Display */}
                <div className="visualizer-card">
                    <DigitDisplay ticks={tickSequence} mode={digitDisplayMode} />
                </div>
            </div>

            {/* Bulk Action Controls — press once to start, press again to stop */}
            <div className="action-pad-card">
                {bothSidesEnabled ? (
                    <button
                        className={`btn-action-both ${runningButton === 'Both' ? 'running' : ''}`}
                        onClick={() => handleToggle('Both')}
                        disabled={!canTrade || (formDisabled && runningButton !== 'Both')}
                    >
                        {runningButton === 'Both' ? 'Stop' : `Bulk ${pair.left.label} + ${pair.right.label}`}
                    </button>
                ) : (
                    <>
                        <button 
                            className={`btn-action-left ${runningButton === 'Left' ? 'running' : ''} ${!runningButton && signal?.side === 'left' && !signal?.noTrade ? 'signal-match' : ''}`}
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
                            className={`btn-action-right ${runningButton === 'Right' ? 'running' : ''} ${!runningButton && signal?.side === 'right' && !signal?.noTrade ? 'signal-match' : ''}`}
                            onClick={() => handleToggle('Right')}
                            disabled={!canTrade || (formDisabled && runningButton !== 'Right')}
                        >
                            <span className="icon">{runningButton === 'Right' ? '■' : '▲'}</span>
                            {runningButton === 'Right' ? 'Stop' : `Bulk ${pair.right.label}`}
                        </button>
                    </>
                )}
            </div>

            {/* Execution Status Footer */}
            <div className="footer-control-bar">
                <div className="status-pill">
                    {runningButton ? (
                        <span>
                            Running <strong>
                                {runningButton === 'Left' ? pair.left.label
                                    : runningButton === 'Right' ? pair.right.label
                                    : runningButton === 'Both' ? `${pair.left.label} + ${pair.right.label}`
                                    : `AI (${strategy})`}
                                {lockedPrediction !== null ? ` · Digit ${lockedPrediction}` : ''}
                            </strong> · {tradesFired}/{runningButton === 'Both' ? bulkCount * 2 : bulkCount} trade{bulkCount === 1 && runningButton !== 'Both' ? '' : 's'} fired
                            {(autoFlipEnabled || stopWinEnabled) && ' · sequential (waiting for each result)'}
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
