import React, { useState, useEffect } from 'react';
import { useStore } from '@/hooks/useStore';
import { useBulkTrader } from './useBulkTrader';
import DigitDisplay from './digit-display';
import { MARKET_MAPPING, STRATEGY_MAPPING, TradeExecutionMode } from './types';

const BulkTrader = () => {
    const store = useStore();
    
    const storeToken = store?.client?.getToken?.() || store?.client?.token;
    const localAccounts = JSON.parse(localStorage.getItem('client.accounts') || '{}');
    const activeLoginId = localStorage.getItem('active_loginid');
    const fallbackToken = activeLoginId ? localAccounts[activeLoginId]?.token : null;

    const [token, setToken] = useState<string | null>(storeToken || fallbackToken || null);
    
    const [market, setMarket] = useState<string>('Vol 10 (1s)');
    const [strategy, setStrategy] = useState<string>('Even');
    const [stake, setStake] = useState<number>(0.5);
    const [duration, setDuration] = useState<number>(1);
    const [bulkCount, setBulkCount] = useState<number>(10);
    const [prediction, setPrediction] = useState<number>(1);
    const [executionMode, setExecutionMode] = useState<TradeExecutionMode>('FAST');
    const [isRunning, setIsRunning] = useState<boolean>(false);

    const { isConnected, tickSequence, subscribeTicks, executeBulkTrades } = useBulkTrader(token);

    useEffect(() => {
        if (isConnected && MARKET_MAPPING[market]) {
            subscribeTicks(MARKET_MAPPING[market]);
        }
    }, [isConnected, market, subscribeTicks]);

    const requiresPrediction = ['Matches', 'Differs', 'Over', 'Under'].includes(strategy);

    const triggerBatch = (typeOverride?: 'Even' | 'Odd') => {
        let selectedContract = STRATEGY_MAPPING[strategy];
        if (typeOverride === 'Even') selectedContract = 'DIGITEVEN';
        if (typeOverride === 'Odd') selectedContract = 'DIGITODD';

        executeBulkTrades(executionMode, bulkCount, {
            symbol: MARKET_MAPPING[market],
            contract_type: selectedContract,
            amount: stake,
            duration,
            prediction: requiresPrediction ? prediction : undefined,
        });
    };

    if (!token) {
        return (
            <div className="bulk-trader-auth-fallback">
                <p>No active session found. Please enter an API token to continue:</p>
                <input 
                    type="text" 
                    placeholder="Enter Deriv API Token" 
                    onChange={(e) => setToken(e.target.value.trim())} 
                />
            </div>
        );
    }

    return (
        <div className="bulk-trader-container">
            <div className="bulk-trader-controls">
                <div className="form-field">
                    <label>Market</label>
                    <select value={market} onChange={(e) => setMarket(e.target.value)}>
                        {Object.keys(MARKET_MAPPING).map((m) => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                </div>

                <div className="form-field">
                    <label>Strategy</label>
                    <select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
                        {Object.keys(STRATEGY_MAPPING).map((s) => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>

                <div className="form-field">
                    <label>Stake (USD)</label>
                    <input 
                        type="number" 
                        step="0.1" 
                        min="0.35" 
                        value={stake} 
                        onChange={(e) => setStake(Number(e.target.value))} 
                    />
                </div>

                <div className="form-field">
                    <label>Duration (ticks)</label>
                    <input 
                        type="number" 
                        min="1" 
                        max="10" 
                        value={duration} 
                        onChange={(e) => setDuration(Number(e.target.value))} 
                    />
                </div>

                {requiresPrediction && (
                    <div className="form-field">
                        <label>Prediction</label>
                        <input 
                            type="number" 
                            min="0" 
                            max="9" 
                            value={prediction} 
                            onChange={(e) => setPrediction(Number(e.target.value))} 
                        />
                    </div>
                )}

                <div className="form-field">
                    <label>No. of bulk trades</label>
                    <input 
                        type="number" 
                        min="1" 
                        max="50" 
                        value={bulkCount} 
                        onChange={(e) => setBulkCount(Number(e.target.value))} 
                    />
                </div>
            </div>

            <div className="bulk-trader-visualizer">
                <DigitDisplay ticks={tickSequence} />
            </div>

            <div className="bulk-trader-action-bar">
                <div className="action-buttons-group">
                    <button className="btn-action btn-even" onClick={() => triggerBatch('Even')}>
                        Bulk Even
                    </button>
                    <button className="btn-action btn-ai" onClick={() => triggerBatch()}>
                        Bulk AI Entry
                    </button>
                    <button className="btn-action btn-odd" onClick={() => triggerBatch('Odd')}>
                        Bulk Odd
                    </button>
                </div>

                <div className="execution-toggle-wrapper">
                    <button 
                        className={`run-toggle-btn ${isRunning ? 'running' : ''}`}
                        onClick={() => setIsRunning(!isRunning)}
                    >
                        {isRunning ? 'Stop' : 'Run'}
                    </button>
                    <div className="mode-switch">
                        <span>Execution <strong>{executionMode}</strong></span>
                        <label className="switch">
                            <input 
                                type="checkbox" 
                                checked={executionMode === 'FAST'} 
                                onChange={(e) => setExecutionMode(e.target.checked ? 'FAST' : 'SLOW')} 
                            />
                            <span className="slider round"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BulkTrader;
