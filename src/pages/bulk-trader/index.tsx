import React, { useState, useEffect } from 'react';
import { useStore } from '@/hooks/useStore';
import { useBulkTrader } from './useBulkTrader';
import DigitDisplay from './digit-display';
import { MARKET_MAPPING, STRATEGY_MAPPING, TradeExecutionMode } from './types';

const BulkTrader = () => {
    const store = useStore();
    
    // Auto-detect token across active session storage formats
    const getActiveToken = () => {
        if (store?.client?.getToken?.()) return store.client.getToken();
        if (store?.client?.token) return store.client.token;

        try {
            const activeLoginId = localStorage.getItem('active_loginid') || localStorage.getItem('active_account');
            const rawAccounts = localStorage.getItem('client.accounts') || localStorage.getItem('account_list') || '{}';
            const localAccounts = JSON.parse(rawAccounts);

            if (activeLoginId && localAccounts[activeLoginId]?.token) {
                return localAccounts[activeLoginId].token;
            }
            if (Array.isArray(localAccounts) && localAccounts.length > 0) {
                return localAccounts[0]?.token || null;
            }
        } catch (e) {
            console.error('Error reading session tokens', e);
        }
        return null;
    };

    const [token, setToken] = useState<string | null>(getActiveToken());
    
    useEffect(() => {
        const detected = getActiveToken();
        if (detected && detected !== token) {
            setToken(detected);
        }
    }, [store]);

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

    // Fallback UI if no token is found
    if (!token) {
        return (
            <div style={{ padding: '32px', color: '#ffffff', maxWidth: '500px' }}>
                <h3 style={{ marginBottom: '12px', fontSize: '18px', color: '#ffffff' }}>Active Session Required</h3>
                <p style={{ marginBottom: '16px', color: '#94a3b8', fontSize: '14px' }}>
                    Could not automatically detect your active login token. Enter your Deriv API token below:
                </p>
                <input 
                    type="text" 
                    placeholder="Enter Deriv API Token" 
                    onChange={(e) => setToken(e.target.value.trim())} 
                    style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '6px',
                        border: '1px solid #334155',
                        backgroundColor: '#1e293b',
                        color: '#ffffff',
                        fontSize: '14px'
                    }}
                />
            </div>
        );
    }

    // Main Dashboard Controls
    return (
        <div style={{ padding: '24px', color: '#ffffff', minHeight: '80vh' }}>
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', 
                gap: '16px', 
                marginBottom: '24px', 
                backgroundColor: '#1e293b', 
                padding: '20px', 
                borderRadius: '8px',
                border: '1px solid #334155'
            }}>
                <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>Market</label>
                    <select 
                        value={market} 
                        onChange={(e) => setMarket(e.target.value)} 
                        style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', color: '#ffffff', border: '1px solid #475569', borderRadius: '6px' }}
                    >
                        {Object.keys(MARKET_MAPPING).map((m) => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>Strategy</label>
                    <select 
                        value={strategy} 
                        onChange={(e) => setStrategy(e.target.value)} 
                        style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', color: '#ffffff', border: '1px solid #475569', borderRadius: '6px' }}
                    >
                        {Object.keys(STRATEGY_MAPPING).map((s) => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>Stake (USD)</label>
                    <input 
                        type="number" 
                        step="0.1" 
                        min="0.35" 
                        value={stake} 
                        onChange={(e) => setStake(Number(e.target.value))} 
                        style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', color: '#ffffff', border: '1px solid #475569', borderRadius: '6px' }}
                    />
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>Duration (ticks)</label>
                    <input 
                        type="number" 
                        min="1" 
                        max="10" 
                        value={duration} 
                        onChange={(e) => setDuration(Number(e.target.value))} 
                        style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', color: '#ffffff', border: '1px solid #475569', borderRadius: '6px' }}
                    />
                </div>

                {requiresPrediction && (
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>Prediction</label>
                        <input 
                            type="number" 
                            min="0" 
                            max="9" 
                            value={prediction} 
                            onChange={(e) => setPrediction(Number(e.target.value))} 
                            style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', color: '#ffffff', border: '1px solid #475569', borderRadius: '6px' }}
                        />
                    </div>
                )}

                <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>No. of bulk trades</label>
                    <input 
                        type="number" 
                        min="1" 
                        max="50" 
                        value={bulkCount} 
                        onChange={(e) => setBulkCount(Number(e.target.value))} 
                        style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', color: '#ffffff', border: '1px solid #475569', borderRadius: '6px' }}
                    />
                </div>
            </div>

            <div style={{ marginBottom: '24px', backgroundColor: '#1e293b', padding: '20px', borderRadius: '8px', border: '1px solid #334155' }}>
                <DigitDisplay ticks={tickSequence} />
            </div>

            <div style={{ 
                display: 'flex', 
                justify: 'space-between', 
                alignItems: 'center', 
                backgroundColor: '#1e293b', 
                padding: '20px', 
                borderRadius: '8px', 
                border: '1px solid #334155',
                flexWrap: 'wrap', 
                gap: '16px' 
            }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button 
                        onClick={() => triggerBatch('Even')} 
                        style={{ padding: '10px 20px', backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                        Bulk Even
                    </button>
                    <button 
                        onClick={() => triggerBatch()} 
                        style={{ padding: '10px 20px', backgroundColor: '#8b5cf6', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                        Bulk AI Entry
                    </button>
                    <button 
                        onClick={() => triggerBatch('Odd')} 
                        style={{ padding: '10px 20px', backgroundColor: '#d97706', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                        Bulk Odd
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button 
                        onClick={() => setIsRunning(!isRunning)}
                        style={{ padding: '10px 24px', backgroundColor: isRunning ? '#ef4444' : '#10b981', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                        {isRunning ? 'Stop' : 'Run'}
                    </button>
                    <div style={{ fontSize: '14px', color: '#cbd5e1' }}>
                        Execution: <strong style={{ color: '#ffffff' }}>{executionMode}</strong>
                        <button 
                            onClick={() => setExecutionMode(executionMode === 'FAST' ? 'SLOW' : 'FAST')}
                            style={{ marginLeft: '10px', padding: '6px 10px', fontSize: '12px', backgroundColor: '#334155', color: '#ffffff', border: '1px solid #475569', borderRadius: '4px', cursor: 'pointer' }}
                        >
                            Toggle
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BulkTrader;
