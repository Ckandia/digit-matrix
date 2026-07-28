import React, { useState, useEffect } from 'react';
import { useStore } from '@/hooks/useStore';
import { useBulkTrader } from './useBulkTrader';
import DigitDisplay from './digit-display';
import { MARKET_MAPPING, STRATEGY_MAPPING, TradeExecutionMode } from './types';
import './bulk-trader.scss';

const BulkTrader = () => {
    const store = useStore();
    
    // Comprehensive token extraction for Deriv OAuth
    const getActiveAccountToken = (): string | null => {
        try {
            // 1. Direct MobX store check
            if (store?.client?.token) return store.client.token;

            // 2. Parse Deriv standard client.accounts
            const activeLoginId = 
                localStorage.getItem('active_loginid') || 
                sessionStorage.getItem('active_loginid') ||
                localStorage.getItem('client.active_loginid');

            const rawClientAccounts = 
                localStorage.getItem('client.accounts') || 
                sessionStorage.getItem('client.accounts');

            if (rawClientAccounts) {
                const parsed = JSON.parse(rawClientAccounts);
                if (activeLoginId && parsed[activeLoginId]?.token) {
                    return parsed[activeLoginId].token;
                }
                const firstKey = Object.keys(parsed)[0];
                if (firstKey && parsed[firstKey]?.token) {
                    return parsed[firstKey].token;
                }
            }

            // 3. Fallback: Check 'config.account_list' or 'accounts'
            const rawAccounts = localStorage.getItem('config.account_list') || localStorage.getItem('accounts');
            if (rawAccounts) {
                const parsedList = JSON.parse(rawAccounts);
                if (Array.isArray(parsedList) && parsedList.length > 0) {
                    const matched = parsedList.find((acc: any) => acc.account === activeLoginId);
                    return matched?.token || parsedList[0]?.token || null;
                }
            }
        } catch (e) {
            console.error('Error resolving Deriv token:', e);
        }

        return null;
    };

    const [token, setToken] = useState<string | null>(getActiveAccountToken());

    useEffect(() => {
        const interval = setInterval(() => {
            const currentToken = getActiveAccountToken();
            if (currentToken && currentToken !== token) {
                setToken(currentToken);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [token, store]);

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

    return (
        <div className="bulk-trader-wrapper">
            <div className="top-grid">
                {/* Left Controls */}
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

                {/* Right Visualizer */}
                <div className="visualizer-card">
                    <DigitDisplay ticks={tickSequence} />
                </div>
            </div>

            {/* Bottom Action Pad */}
            <div className="action-pad-card">
                <button className="btn-action-even" onClick={() => triggerBatch('Even')}>
                    <span className="icon">⧈</span>
                    Bulk Even
                </button>
                <button className="btn-action-ai" onClick={() => triggerBatch()}>
                    Bulk AI Entry
                </button>
                <button className="btn-action-odd" onClick={() => triggerBatch('Odd')}>
                    <span className="icon">▲</span>
                    Bulk Odd
                </button>
            </div>

            {/* Execution Control Footer */}
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
