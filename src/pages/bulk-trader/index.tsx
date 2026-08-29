import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useBulkTrader } from './useBulkTrader';
import DigitDisplay from './digit-display';
import { DEFAULT_DURATION_CONSTRAINT, DURATION_CONSTRAINTS, MARKET_MAPPING, STRATEGY_MAPPING, STRATEGY_PAIR_MAPPING, TickData, TradeExecutionMode } from './types';
import { computeSignal, TradeSignal } from './signal';
import { fetchAnalysis, fetchRecentTicks, logTradeToBackend, sendTickToBackend } from './api';
import './bulk-trader.scss';

type ActionButton = 'Left' | 'AI' | 'Right' | 'Both';
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
    const [bothSidesEnabled, setBothSidesEnabled] = useState<boolean>(false);
    const [maxStake, setMaxStake] = useState<number>(5);
    const [adaptiveStakeEnabled, setAdaptiveStakeEnabled] = useState<boolean>(false);
    const [riskPercent, setRiskPercent] = useState<number>(5);
    const [lockedPrediction, setLockedPrediction] = useState<number | null>(null);

    // Backend unified data
    const [backendAnalysis, setBackendAnalysis] = useState<any>(null);
    const [backendStatus, setBackendStatus] = useState<string>('Waiting for backend data...');

    const { isConnected, isAuthorized, accountInfo, tickSequence, subscribeTicks, executeBulkTrades } = useBulkTrader();

    const directionRef = useRef<string>('');
    const cumulativeProfitRef = useRef<number>(0);
    const cancelFnsRef = useRef<Array<() => void>>([]);
    const completionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const predictionRef = useRef<number>(prediction);
    const runPredictionRef = useRef<number>(prediction);
    const runStakeRef = useRef<number>(stake);
    const runStartBalanceRef = useRef<number | undefined>(undefined);
    const peakProfitRef = useRef<number>(0);
    const runLoginIdRef = useRef<string | undefined>(undefined);

    const [signal, setSignal] = useState<TradeSignal | null>(null);
    const [signalCountdown, setSignalCountdown] = useState<number>(SIGNAL_CYCLE_SECONDS);
    const [isEnterNow, setIsEnterNow] = useState<boolean>(false);
    const tickSequenceRef = useRef<TickData[]>([]);
    const enterNowRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Backend tick cache for signal computation (ref so it doesn't reset timers)
    const backendTicksRef = useRef<any[]>([]);

    useEffect(() => {
        if (isConnected && MARKET_MAPPING[market]) {
            subscribeTicks(MARKET_MAPPING[market]);
        }
    }, [isConnected, market, subscribeTicks]);

    // Send every local tick to backend so database grows
    useEffect(() => {
        if (tickSequence.length === 0) return;
        const latest = tickSequence[tickSequence.length - 1];
        if (latest && latest.quote && latest.symbol) {
            sendTickToBackend(latest.symbol, latest.quote);
        }
    }, [tickSequence]);

    // Pull last 20 ticks from backend every 2 seconds (signal source of truth)
    useEffect(() => {
        const symbol = MARKET_MAPPING[market];
        if (!symbol) return;

        const load = async () => {
            const ticks = await fetchRecentTicks(symbol, 20);
            if (ticks) {
                backendTicksRef.current = ticks;
            }
        };

        load();
        const interval = setInterval(load, 2000);
        return () => clearInterval(interval);
    }, [market]);

    // Pull 1000-tick analysis every 5 seconds
    useEffect(() => {
        const symbol = MARKET_MAPPING[market];
        if (!symbol) return;

        const load = async () => {
            const data = await fetchAnalysis(symbol);
            if (data) {
                setBackendAnalysis(data);
                setBackendStatus(`${data.lookback} ticks loaded`);
            } else {
                setBackendStatus('Collecting...');
            }
        };

        load();
        const interval = setInterval(load, 5000);
        return () => clearInterval(interval);
    }, [market]);

    useEffect(() => {
        tickSequenceRef.current = tickSequence;
    }, [tickSequence]);

    useEffect(() => {
        predictionRef.current = prediction;
    }, [prediction]);

    const applySignal = useCallback((newSignal: TradeSignal | null) => {
        setSignal(newSignal);
        if (newSignal?.digit !== undefined) {
            setPrediction(newSignal.digit);
        }
    }, []);

    // SIGNAL: uses backend ticks (same data as analysis)
    useEffect(() => {
        setSignal(null);
        setSignalCountdown(SIGNAL_CYCLE_SECONDS);
        setIsEnterNow(false);

        let hasSignal = false;
        const tryComputeInitial = () => {
            if (backendTicksRef.current.length >= MIN_TICKS_FOR_SIGNAL) {
                const tickData = backendTicksRef.current.map((t: any) => ({
                    quote: t.quote,
                    digit: t.digit,
                    symbol: MARKET_MAPPING[market],
                    epoch: Date.now() / 1000
                }));
                applySignal(computeSignal(strategy, tickData, predictionRef.current, duration));
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
                    if (backendTicksRef.current.length >= MIN_TICKS_FOR_SIGNAL) {
                        const tickData = backendTicksRef.current.map((t: any) => ({
                            quote: t.quote,
                            digit: t.digit,
                            symbol: MARKET_MAPPING[market],
                            epoch: Date.now() / 1000
                        }));
                        applySignal(computeSignal(strategy, tickData, predictionRef.current, duration));
                    }
                    setIsEnterNow(true);

                    if (enterNowRefreshRef.current) clearInterval(enterNowRefreshRef.current);
                    enterNowRefreshRef.current = setInterval(() => {
                        if (backendTicksRef.current.length >= MIN_TICKS_FOR_SIGNAL) {
                            const tickData = backendTicksRef.current.map((t: any) => ({
                                quote: t.quote,
                                digit: t.digit,
                                symbol: MARKET_MAPPING[market],
                                epoch: Date.now() / 1000
                            }));
                            applySignal(computeSignal(strategy, tickData, predictionRef.current, duration));
                        }
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
        cancelFnsRef.current.forEach((fn) => fn());
        cancelFnsRef.current = [];
        if (completionTimeoutRef.current) {
            clearTimeout(completionTimeoutRef.current);
            completionTimeoutRef.current = null;
        }

        runPredictionRef.current = predictionRef.current;
        runStakeRef.current = stake;
        runLoginIdRef.current = accountInfo?.loginid;
        runStartBalanceRef.current = accountInfo?.balance;
        peakProfitRef.current = 0;
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
            cumulativeProfitRef.current += settled.profit;
            peakProfitRef.current = Math.max(peakProfitRef.current, cumulativeProfitRef.current);

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

            if (stopWinEnabled && cumulativeProfitRef.current > 0) {
                stopLoop();
                return;
            }

            if (autoFlipEnabled) {
                if (cumulativeProfitRef.current < 0) {
                    directionRef.current =
                        directionRef.current === pair.left.contract_type
                            ? pair.right.contract_type
                            : pair.left.contract_type;

                    const effectiveCap = adaptiveStakeEnabled
                        ? (runStartBalanceRef.current ?? maxStake) * (riskPercent / 100) + Math.max(0, peakProfitRef.current)
                        : maxStake;
                    const balanceCeiling = accountInfo?.balance ?? Infinity;

                    runStakeRef.current = Math.min(runStakeRef.current * 2, effectiveCap, balanceCeiling);
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
            directionRef.current = pair.left.contract_type;
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

            const getDynamicParams = () => ({
                contract_type: directionRef.current,
                prediction: requiresPrediction ? runPredictionRef.current : undefined,
                amount: runStakeRef.current,
            });

            const cancel = executeBulkTrades(
                executionMode,
                bulkCount,
                { symbol: MARKET_MAPPING[market], duration },
                getDynamicParams,
                onTradeResult,
                onContractSettled,
                sequential,
                onOneBatchComplete
            );
            cancelFnsRef.current = [cancel];
        }

        const delayPerTrade = executionMode === 'FAST' ? 50 : 300;
        const sequentialSafetyMs = bulkCount * 15000;
        const burstSafetyMs = bulkCount * delayPerTrade + 2000;
        const safetyMs = sequential ? sequentialSafetyMs : burstSafetyMs;
        completionTimeoutRef.current = setTimeout(() => {
            setRunningButton(null);
            setLockedPrediction(null);
            completionTimeoutRef.current = null;
        }, safetyMs);

        setRunningButton(button);
    }, [executionMode, bulkCount, market, stake, duration, requiresPrediction, executeBulkTrades, stopWinEnabled, autoFlipEnabled, maxStake, adaptiveStakeEnabled, riskPercent, pair, strategy, stopLoop, accountInfo]);

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
            cancelFnsRef.current.forEach((fn) => fn());
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

            {/* 1000-Tick Backend Analysis */}
            {backendAnalysis ? (
                <div className="signal-card" style={{ borderColor: '#a855f7' }}>
                    <div className="signal-info">
                        <span className="signal-label">1000-TICK BACKEND ANALYSIS</span>
                        <span className="signal-value" style={{ color: '#a855f7' }}>
                            Hot: {backendAnalysis.hot_digit} ({backendAnalysis.hot_pct}%) · Cold: {backendAnalysis.cold_digit} ({backendAnalysis.cold_pct}%)
                        </span>
                        <span className="signal-split">
                            Even {backendAnalysis.even_odd.even_pct}% · Odd {100 - backendAnalysis.even_odd.even_pct}% · 
                            Max Streak: {backendAnalysis.max_streak?.digit}×{backendAnalysis.max_streak?.length}
                        </span>
                        <span className="signal-split" style={{ fontSize: '10px', marginTop: '4px' }}>
                            Last 20: {backendAnalysis.last_20_digits?.join(' ')}
                        </span>
                    </div>
                </div>
            ) : (
                <div className="signal-card" style={{ borderColor: '#64748b' }}>
                    <div className="signal-info">
                        <span className="signal-label">BACKEND STATUS</span>
                        <span className="signal-value" style={{ color: '#94a3b8' }}>
                            {backendStatus}
                        </span>
                    </div>
                </div>
            )}

            {/* Signal — now powered by backend ticks */}
            {signal ? (
                <div className={`signal-card ${isEnterNow && !signal.noTrade ? 'enter-now' : ''} ${signal.noTrade ? 'no-trade' : ''}`}>
                    <div className="signal-info">
                        <span className="signal-label">SIGNAL (BACKEND 20-TICK)</span>
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
                        <span className="signal-value">Waiting for backend ticks...</span>
                    </div>
                    <div className="signal-countdown">
                        <span>Backend collecting {MIN_TICKS_FOR_SIGNAL} ticks</span>
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
                        </div
