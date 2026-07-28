import React, { useState, useEffect } from 'react';
import { useStore } from '@/hooks/useStore';
import { useBulkTrader } from './useBulkTrader';
import DigitDisplay from './digit-display';
import { MARKET_MAPPING, STRATEGY_MAPPING, TradeExecutionMode } from './types';
import './bulk-trader.scss';

const BulkTrader = () => {
    const store = useStore();
    
    const getOAuthToken = (): string | null => {
        if (store?.client) {
            const { client } = store;
            if (client.token) return client.token;
            if (client.loginid && client.accounts?.[client.loginid]?.token) {
                return client.accounts[client.loginid].token;
            }
            if (typeof client.getToken === 'function') {
                const t = client.getToken();
                if (t) return t;
            }
        }

        try {
            const activeLoginId = 
                localStorage.getItem('active_loginid') || 
                localStorage.getItem('active_account') ||
                localStorage.getItem('client.active_loginid');

            const rawAccounts = 
                localStorage.getItem('client.accounts') || 
                localStorage.getItem('config.account_list') || 
                '{}';
            
            const accounts = JSON.parse(rawAccounts);

            if (activeLoginId && accounts[activeLoginId]?.token) {
                return accounts[activeLoginId].token;
            }

            const keys = Object.keys(accounts);
            if (keys.length > 0 && accounts[keys[0]]?.token) {
                return accounts[keys[0]].token;
            }
        } catch (e) {
            console.error('Error parsing OAuth token:', e);
        }

        return null;
    };

    const [token, setToken] = useState<string | null>(getOAuthToken());

    useEffect(() => {
        const detectedToken = getOAuthToken();
        if (detectedToken && detectedToken !== token) {
            setToken(detectedToken);
        }
    }, [store, store?.client?.loginid]);

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
                            <label>Market</label>
                            <select value={market} onChange={(e) => setMarket(e.target.value)}>
                                {Object.keys(MARKET_MAPPING).map((m) => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Strategy</label>
                            <select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
                                {Object.keys(STRATEGY_MAPPING).map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>Stake (USD)</label>
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
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>Duration (ticks)</label>
                            <input 
                                type="number" 
                                min="1" 
                                max="10" 
                                value={duration} 
                                onChange={(e) => setDuration(Number(e.target.value))} 
                            />
                        </div>
                        <div className="form-group">
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
                </div>

                {/* Right Visualizer */}
                <div className="visualizer-card">
                    <DigitDisplay ticks={tickSequence} />
                </div>
            </div>

            {/* Action Pad */}
            <div className="action-pad-card">
                <button className="btn-action-even" onClick={() => triggerBatch('Even')}>
                    <span>⧈</span>
                    Bulk Even
                </button>
                <button className="btn-action-ai" onClick={() => triggerBatch()}>
                    Bulk AI Entry
                </button>
                <button className="btn-action-odd" onClick={() => triggerBatch('Odd')}>
                    <span>▲</span>
                    Bulk Odd
                </button>
            </div>

            {/* Footer */}
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
