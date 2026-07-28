import React, { useState, useEffect } from 'react';
import { useStore } from '@/hooks/useStore';
import { useBulkTrader } from './useBulkTrader';
import DigitDisplay from './digit-display';
import { MARKET_MAPPING, STRATEGY_MAPPING, TradeExecutionMode } from './types';
import './bulk-trader.scss';

const BulkTrader = () => {
    const store = useStore();
    
    // Deep session search across all Deriv OAuth storage mechanisms
    const getActiveAccountToken = (): string | null => {
        try {
            // 1. Direct MobX store check
            if (store?.client?.token) return store.client.token;
            if (typeof store?.client?.getToken === 'function') {
                const t = store.client.getToken();
                if (t) return t;
            }

            // 2. Active login ID lookup
            const activeLoginId = 
                localStorage.getItem('active_loginid') || 
                sessionStorage.getItem('active_loginid') ||
                localStorage.getItem('client.active_loginid');

            // 3. Search client.accounts in localStorage / sessionStorage
            const rawAccounts = 
                localStorage.getItem('client.accounts') || 
                sessionStorage.getItem('client.accounts') ||
                localStorage.getItem('config.account_list') || 
                '{}';
            
            const accounts = JSON.parse(rawAccounts);

            if (activeLoginId && accounts[activeLoginId]?.token) {
                return accounts[activeLoginId].token;
            }

            // Fallback: grab token from the first active account in list
            const accountKeys = Object.keys(accounts);
            if (accountKeys.length > 0 && accounts[accountKeys[0]]?.token) {
                return accounts[accountKeys[0]].token;
            }

            // 4. Search tokenList format
            const rawTokenList = localStorage.getItem('tokenList') || sessionStorage.getItem('tokenList');
            if (rawTokenList) {
                const tokenList = JSON.parse(rawTokenList);
                if (Array.isArray(tokenList) && tokenList.length > 0) {
                    const match = tokenList.find((item: any) => item.account === activeLoginId);
                    return match?.token || tokenList[0]?.token || null;
                }
            }
        } catch (e) {
            console.error('Error retrieving session token:', e);
        }

        return null;
    };

    const [token, setToken] = useState<string | null>(getActiveAccountToken());

    useEffect(() => {
        const checkToken = () => {
            const detectedToken = getActiveAccountToken();
            if (detectedToken && detectedToken !== token) {
                setToken(detectedToken);
            }
        };

        checkToken();
        const interval = setInterval(checkToken, 1000);
        return () => clearInterval(interval);
    }, [store, token]);

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
                {/* Left Form Controls */}
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

            {/* Execution Footer */}
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
