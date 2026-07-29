import React, { useState, useEffect } from 'react';
import { useBulkTrader, TradeResult } from './useBulkTrader';
import DigitDisplay from './digit-display';
import { MARKET_MAPPING, STRATEGY_MAPPING, TradeExecutionMode } from './types';
import './bulk-trader.scss';

const BulkTrader = () => {
    const [market, setMarket] = useState<string>('Vol 10 (1s)');
    const [strategy, setStrategy] = useState<string>('Even');
    const [stake, setStake] = useState<number>(0.5);
    const [duration, setDuration] = useState<number>(1);
    const [bulkCount, setBulkCount] = useState<number>(10);
    const [prediction, setPrediction] = useState<number>(1);
    const [executionMode, setExecutionMode] = useState<TradeExecutionMode>('FAST');
    const [isRunning, setIsRunning] = useState<boolean>(false);
    const [tradeLog, setTradeLog] = useState<TradeResult[]>([]);

    const { isConnected, isAuthorized, tickSequence, subscribeTicks, executeBulkTrades } = useBulkTrader();

    useEffect(() => {
        if (isConnected && MARKET_MAPPING[market]) {
            subscribeTicks(MARKET_MAPPING[market]);
        }
    }, [isConnected, market, subscribeTicks]);

    const requiresPrediction = ['Matches', 'Differs', 'Over', 'Under'].includes(strategy);
    const canTrade = isConnected;

    const handleTradeResult = (result: TradeResult) => {
        setTradeLog((prev) => {
            const next = [...prev];
            if (result.index >= 0) {
                next[result.index] = result;
            }
            return next;
        });
    };

    const triggerBatch = (typeOverride?: 'Even' | 'Odd') => {
        let selectedContract = STRATEGY_MAPPING[strategy];
        if (typeOverride === 'Even') selectedContract = 'DIGITEVEN';
        if (typeOverride === 'Odd') selectedContract = 'DIGITODD';

        setTradeLog([]);

        executeBulkTrades(
            executionMode,
            bulkCount,
            {
                symbol: MARKET_MAPPING[market],
                contract_type: selectedContract,
                amount: stake,
                duration,
                prediction: requiresPrediction ? prediction : undefined,
            },
            handleTradeResult
        );
    };

    return (
        <div className="bulk-trader-wrapper">
            <div className="top-grid">
                {/* Controls Card */}
                <div className="control-card">
                    <div className="form-row">
                        <div className="form-group">
                            <label>MARKET</label>
                            <select value={market} onChange={(e) => setMarket(e.target.value)}>
                                {Object.keys(MARKET_MAPPING).map((m) => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>STRATEGY</label>
                            <select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
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
                                onChange={(e) => setBulkCount(Number(e.target.value))} 
                            />
                        </div>
                    </div>
                </div>

                {/* Digit Visualizer Display */}
                <div className="visualizer-card">
                    <DigitDisplay ticks={tickSequence} />
                </div>
            </div>

            {/* Bulk Action Controls */}
            <div className="action-pad-card">
                <button 
                    className="btn-action-even" 
                    onClick={() => triggerBatch('Even')}
                    disabled={!canTrade}
                >
                    <span className="icon">⧈</span>
                    Bulk Even
                </button>
                <button 
                    className="btn-action-ai" 
                    onClick={() => triggerBatch()}
                    disabled={!canTrade}
                >
                    Bulk AI Entry
                </button>
                <button 
                    className="btn-action-odd" 
                    onClick={() => triggerBatch('Odd')}
                    disabled={!canTrade}
                >
                    <span className="icon">▲</span>
                    Bulk Odd
                </button>
            </div>

            {/* Live Feedback Strip */}
            {tradeLog.length > 0 && (
                <div className="trade-log-strip">
                    <span>
                        {tradeLog.filter(t => t?.status === 'success').length} succeeded ·{' '}
                        {tradeLog.filter(t => t?.status === 'error').length} failed ·{' '}
                        {tradeLog.filter(t => t?.status === 'pending').length} pending
                    </span>
                    {tradeLog.some(t => t?.status === 'error') && (
                        <span className="last-error">
                            {tradeLog.filter(t => t?.status === 'error').slice(-1)[0]?.message}
                        </span>
                    )}
                </div>
            )}

            {/* Execution Footer Bar */}
            <div className="footer-control-bar">
                <button 
                    className={`btn-run ${isRunning ? 'running' : ''}`}
                    onClick={() => setIsRunning(!isRunning)}
                >
                    {isRunning ? 'Stop' : '▶ Run'}
                </button>
                <div className="execution-pill">
                    <span>Execution <strong>{executionMode}</strong></span>
                    <label className="switch">
                        <input 
                            type="checkbox" 
                            checked={executionMode === 'FAST'}
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
