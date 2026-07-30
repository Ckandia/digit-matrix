import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useBulkTrader } from './useBulkTrader';
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
    const [activeButton, setActiveButton] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string>('Ready');

    const { isConnected, tickSequence, subscribeTicks, executeBulkTrades } = useBulkTrader();
    const isRunningRef = useRef<boolean>(false);

    useEffect(() => {
        if (isConnected && MARKET_MAPPING[market]) {
            subscribeTicks(MARKET_MAPPING[market]);
        }
    }, [isConnected, market, subscribeTicks]);

    const requiresPrediction = ['Matches', 'Differs', 'Over', 'Under'].includes(strategy);
    const canTrade = isConnected;

    const stopRunning = useCallback(() => {
        isRunningRef.current = false;
        setActiveButton(null);
        setStatusMessage('Stopped');
    }, []);

    const triggerBatchLoop = useCallback(async (buttonKey: string, typeOverride?: 'Even' | 'Odd') => {
        if (isRunningRef.current) {
            stopRunning();
            return;
        }

        isRunningRef.current = true;
        setActiveButton(buttonKey);
        setStatusMessage(`Running ${buttonKey}...`);

        let selectedContract = STRATEGY_MAPPING[strategy];
        if (typeOverride === 'Even') selectedContract = 'DIGITEVEN';
        if (typeOverride === 'Odd') selectedContract = 'DIGITODD';

        const tradeParams = {
            symbol: MARKET_MAPPING[market],
            contract_type: selectedContract,
            amount: stake,
            duration,
            prediction: requiresPrediction ? prediction : undefined,
        };

        try {
            while (isRunningRef.current) {
                const res = await executeBulkTrades(executionMode, bulkCount, tradeParams);
                if (!isRunningRef.current) break;
                
                setStatusMessage(`Last batch: ${res.successCount} success, ${res.failureCount} failed`);
                
                await new Promise((r) => setTimeout(r, 1000));
            }
        } catch (err: any) {
            setStatusMessage(`Error: ${err?.message || 'Execution failed'}`);
        } finally {
            if (activeButton === buttonKey) {
                stopRunning();
            }
        }
    }, [strategy, market, stake, duration, requiresPrediction, prediction, executionMode, bulkCount, executeBulkTrades, stopRunning, activeButton]);

    return (
        <div className="bulk-trader-wrapper">
            <div className="top-grid">
                {/* Controls Card */}
                <div className="control-card">
                    <div className="form-row">
                        <div className="form-group">
                            <label>MARKET</label>
                            <select value={market} onChange={(e) => setMarket(e.target.value)} disabled={isRunningRef.current}>
                                {Object.keys(MARKET_MAPPING).map((m) => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>STRATEGY</label>
                            <select value={strategy} onChange={(e) => setStrategy(e.target.value)} disabled={isRunningRef.current}>
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
                                disabled={isRunningRef.current}
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
                                    disabled={isRunningRef.current}
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
                                disabled={isRunningRef.current}
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
                                disabled={isRunningRef.current}
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
                    className={`btn-action-even ${activeButton === 'Even' ? 'running' : ''}`} 
                    onClick={() => triggerBatchLoop('Even', 'Even')}
                    disabled={!canTrade || (activeButton !== null && activeButton !== 'Even')}
                >
                    <span className="icon">⧈</span>
                    {activeButton === 'Even' ? 'Stop Even' : 'Bulk Even'}
                </button>
                <button 
                    className={`btn-action-ai ${activeButton === 'AI' ? 'running' : ''}`} 
                    onClick={() => triggerBatchLoop('AI')}
                    disabled={!canTrade || (activeButton !== null && activeButton !== 'AI')}
                >
                    {activeButton === 'AI' ? 'Stop AI' : 'Bulk AI Entry'}
                </button>
                <button 
                    className={`btn-action-odd ${activeButton === 'Odd' ? 'running' : ''}`} 
                    onClick={() => triggerBatchLoop('Odd', 'Odd')}
                    disabled={!canTrade || (activeButton !== null && activeButton !== 'Odd')}
                >
                    <span className="icon">▲</span>
                    {activeButton === 'Odd' ? 'Stop Odd' : 'Bulk Odd'}
                </button>
            </div>

            {/* Execution Footer Bar */}
            <div className="footer-control-bar">
                <div className="status-pill">
                    <span>Status: <strong>{statusMessage}</strong></span>
                </div>
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
