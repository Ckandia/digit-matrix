import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useBulkTrader } from './useBulkTrader';
import DigitDisplay from './digit-display';
import { DEFAULT_DURATION_CONSTRAINT, DURATION_CONSTRAINTS, MARKET_MAPPING, STRATEGY_MAPPING, STRATEGY_PAIR_MAPPING, TickData, TradeExecutionMode } from './types';
import { computeSignal, TradeSignal } from './signal';
import { logTradeToBackend, sendTickToBackend } from './api';
import './bulk-trader.scss';

type ActionButton = 'Left' | 'AI' | 'Right';
const SIGNAL_CYCLE_SECONDS = 20;
const ENTER_NOW_DISPLAY_MS = 3000;
const MIN_TICKS_FOR_SIGNAL = 20;

const BulkTrader = () => {
    const [market, setMarket] = useState<string>('Vol 10 (1s)');
    const [strategy, setStrategy] = useState<string>('Even');
    const [stake, setStake] = useState<number>(0.5);
    const [duration, setDuration] = useState<number>(1);
    const [bulkCount, setBulkCount] = useState<number>(10);
    const [prediction, setPrediction] = useState<number>(1);
    const [executionMode, setExecutionMode] = useState<TradeExecutionMode>('FAST');

    const [runningButton, setRunningButton] = useState<ActionButton | null>(null);
    const [lastError, setLastError] = useState<string | null>(null);
    const [tradesFired, setTradesFired] = useState<number>(0);
    const [autoFlipEnabled, setAutoFlipEnabled] = useState<boolean>(false);
    const [stopWinEnabled, setStopWinEnabled] = useState<boolean>(false);
    const [maxStake, setMaxStake] = useState<number>(5);
    const [lockedPrediction, setLockedPrediction] = useState<number | null>(null);

    const { isConnected, isAuthorized, accountInfo, tickSequence, subscribeTicks, executeBulkTrades } = useBulkTrader();

    const directionRef = useRef<string>('');
    const cumulativeProfitRef = useRef<number>(0);
    const cancelRunRef = useRef<() => void>(() => {});
    const completionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const predictionRef = useRef<number>(prediction);
    const runPredictionRef = useRef<number>(prediction);
    const runStakeRef = useRef<number>(stake);
    const runLoginIdRef = useRef<string | undefined>(undefined);

    const [signal, setSignal] = useState<TradeSignal | null>(null);
    const [signalCountdown, setSignalCountdown] = useState<number>(SIGNAL_CYCLE_SECONDS);
    const [isEnterNow, setIsEnterNow] = useState<boolean>(false);
    const tickSequenceRef = useRef<TickData[]>([]);
    const enterNowRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const signalRef = useRef<TradeSignal | null>(null);

    useEffect(() => {
        if (isConnected && MARKET_MAPPING[market]) {
            subscribeTicks(MARKET_MAPPING[market]);
        }
    }, [isConnected, market, subscribeTicks]);

    useEffect(() => {
        tickSequenceRef.current = tickSequence;
    }, [tickSequence]);

    useEffect(() => {
        if (tickSequence.length === 0) return;
        const latest = tickSequence[tickSequence.length - 1];
        if (latest && latest.quote && latest.symbol) {
            sendTickToBackend(latest.symbol, latest.quote);
        }
    }, [tickSequence]);

    useEffect(() => {
        predictionRef.current = prediction;
    }, [prediction]);

    const applySignal = useCallback((newSignal: TradeSignal | null) => {
        setSignal(newSignal);
        signalRef.current = newSignal;
        if (newSignal?.digit !== undefined) {
            setPrediction(newSignal.digit);
        }
    }, []);

    useEffect(() => {
        setSignal(null);
        signalRef.current = null;
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
                return;
            }
            setSignalCountdown((prev) => {
                if (prev <= 1) {
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
    const durationConstraint = DURATION_CONSTRAINTS[strategy] ?? DEFAULT_DURATION_CONSTRAINT;

    useEffect(() => {
        setDuration((prev) => Math.min(Math.max(prev, durationConstraint.min), durationConstraint.max));
    }, [durationConstraint.min, durationConstraint.max]);

    const digitDisplayMode: 'even_odd' | 'digit' = ['Even', 'Odd'].includes(strategy) ? 'even_odd' : 'digit';

    const pair = useMemo(
        () => STRATEGY_PAIR_MAPPING[strategy] ?? {
            left: { label: strategy, contract_type: STRATEGY_MAPPING[strategy] },
            right: { label: strategy, contract_type: STRATEGY_MAPPING[strategy] },
        },
        [strategy]
    );

    const canTrade = isConnected && isAuthorized;

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
        cancelRunRef.current();
        if (completionTimeoutRef.current) {
            clearTimeout(completionTimeoutRef.current);
            completionTimeoutRef.current = null;
        }

        let initialType: string;
        if (button === 'Left') {
            initialType = pair.left.contract_type;
        } else if (button === 'Right') {
            initialType = pair.right.contract_type;
        } else {
            // AI Mode: dynamically pick direction based on signal side, defaulting to Left side
            const activeSide = signalRef.current?.side;
            initialType = activeSide === 'right' ? pair.right.contract_type : pair.left.contract_type;
        }

        directionRef.current = initialType;
        runPredictionRef.current = predictionRef.current;
        runStakeRef.current = stake;
        runLoginIdRef.current = accountInfo?.loginid;
        setLockedPrediction(requiresPrediction ? predictionRef.current : null);
        cumulativeProfitRef.current = 0;
        setLastError(null);
        setTradesFired(0);

        const getDynamicParams = () => ({
            contract_type: directionRef.current,
            prediction: requiresPrediction ? runPredictionRef.current : undefined,
            amount: runStakeRef.current,
        });

        const cancel = executeBulkTrades(
            executionMode,
            bulkCount,
            {
                symbol: MARKET_MAPPING[market],
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
                logTradeToBackend({
                    loginid: accountInfo?.loginid,
                    market: MARKET_MAPPING[market],
                    strategy: strategy,
                    contract_type: settled.contract_type,
                    stake: runStakeRef.current,
                    prediction: requiresPrediction ? runPredictionRef.current : undefined,
                    profit: settled.profit,
                    result: settled.won ? 'win' : 'loss',
                });

                if (stopWinEnabled) {
                    cumulativeProfitRef.current += settled.profit;
                    if (cumulativeProfitRef.current > 0) {
                        stopLoop();
                        return;
                    }
                }

                if (autoFlipEnabled) {
                    if (settled.won) {
                        runStakeRef.current = stake;
                    } else {
                        directionRef.current =
                            directionRef.current === pair.left.contract_type
                                ? pair.right.contract_type
                                : pair.left.contract_type;
                        runStakeRef.current = Math.min(runStakeRef.current * 2, maxStake);
                    }
                }
            },
            autoFlipEnabled || stopWinEnabled,
            () => {
                setRunningButton(null);
                setLockedPrediction(null);
                if (completionTimeoutRef.current) {
                    clearTimeout(completionTimeoutRef.current);
                    completionTimeoutRef.current = null;
                }
            }
        );

        cancelRunRef.current = cancel;

        const delayPerTrade = executionMode === 'FAST' ? 50 : 300;
        const sequentialSafetyMs = bulkCount * 15000;
        const burstSafetyMs = bulkCount * delayPerTrade + 2000;
        const safetyMs = (autoFlipEnabled || stopWinEnabled) ? sequentialSafetyMs : burstSafetyMs;
        completionTimeoutRef.current = setTimeout(() => {
            setRunningButton(null);
            setLockedPrediction(null);
            completionTimeoutRef.current = null;
        }, safetyMs);

        setRunningButton(button);
    }, [executionMode, bulkCount, market, stake, duration, requiresPrediction, executeBulkTrades, stopWinEnabled, autoFlipEnabled, maxStake, pair, strategy, stopLoop, accountInfo]);

    const handleToggle = (button: ActionButton) => {
        if (!canTrade) return;
        if (runningButton === button) {
            stopLoop();
        } else {
            startLoop(button);
        }
    };

    useEffect(() => {
        return () => {
            cancelRunRef.current();
            if (completionTimeoutRef.current) clearTimeout(completionTimeoutRef.current);
        };
    }, []);

    useEffect(() => {
        if (!runningButton) return;
        if (!canTrade || accountInfo?.loginid !== runLoginIdRef.current) {
            stopLoop();
        }
    }, [canTrade, runningButton, accountInfo?.loginid, stopLoop]);

    const formDisabled = !!runningButton;

    return (
        <div className="bulk-trader-wrapper">
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
                                disabled={formDisabled}
                                onChange={(e) => setAutoFlipEnabled(e.target.checked)}
                            />
                            <span>
                                Auto Flip
                                <small>Switch to {pair.right.label}/{pair.left.label} and double the stake to recover a loss</small>
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
                                <small className="field-hint">Caps how high the recovery stake can climb after repeated losses</small>
                            </div>
                        </div>
                    )}
                </div>

                <div className="visualizer-card">
                    <DigitDisplay ticks={tickSequence} mode={digitDisplayMode} />
                </div>
            </div>

            <div className="action-pad-card">
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
            </div>

            <div className="footer-control-bar">
                <div className="status-pill">
                    {runningButton ? (
                        <span>
                            Running <strong>
                                {runningButton === 'Left' ? pair.left.label : runningButton === 'Right' ? pair.right.label : `AI (${strategy})`}
                                {lockedPrediction !== null ? ` · Digit ${lockedPrediction}` : ''}
                            </strong> · {tradesFired}/{bulkCount} trade{bulkCount === 1 ? '' : 's'} fired
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
