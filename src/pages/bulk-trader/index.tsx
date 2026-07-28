import React, { useState, useEffect } from 'react';
import { useStore } from '@/hooks/useStore';
import { useBulkTrader } from './useBulkTrader';
import DigitDisplay from './digit-display';
import { MARKET_MAPPING, STRATEGY_MAPPING, TradeExecutionMode } from './types';

const BulkTrader = () => {
    const store = useStore();
    
    // Auto-extract session token from OAuth state or Deriv client storage
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

            const rawTokenList = localStorage.getItem('tokenList');
            if (rawTokenList) {
                const tokenList = JSON.parse(rawTokenList);
                if (Array.isArray(tokenList) && tokenList.length > 0) {
                    const match = tokenList.find((item: any) => item.account === activeLoginId);
                    return match?.token || tokenList[0]?.token || null;
                }
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
        <div style={styles.container}>
            <div style={styles.topSection}>
                {/* Left Form Panel */}
                <div style={styles.formCard}>
                    <div style={styles.formRow}>
                        <div style={styles.fieldGroup}>
                            <label style={styles.label}>Market</label>
                            <select 
                                value={market} 
                                onChange={(e) => setMarket(e.target.value)} 
                                style={styles.select}
                            >
                                {Object.keys(MARKET_MAPPING).map((m) => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </select>
                        </div>
                        <div style={styles.fieldGroup}>
                            <label style={styles.label}>Strategy</label>
                            <select 
                                value={strategy} 
                                onChange={(e) => setStrategy(e.target.value)} 
                                style={styles.select}
                            >
                                {Object.keys(STRATEGY_MAPPING).map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div style={styles.formRow}>
                        <div style={styles.fieldGroup}>
                            <label style={styles.label}>Stake (USD)</label>
                            <input 
                                type="number" 
                                step="0.1" 
                                min="0.35" 
                                value={stake} 
                                onChange={(e) => setStake(Number(e.target.value))} 
                                style={styles.input}
                            />
                        </div>
                        {requiresPrediction && (
                            <div style={styles.fieldGroup}>
                                <label style={styles.label}>Prediction</label>
                                <input 
                                    type="number" 
                                    min="0" 
                                    max="9" 
                                    value={prediction} 
                                    onChange={(e) => setPrediction(Number(e.target.value))} 
                                    style={styles.input}
                                />
                            </div>
                        )}
                    </div>

                    <div style={styles.formRow}>
                        <div style={styles.fieldGroup}>
                            <label style={styles.label}>Duration (ticks)</label>
                            <input 
                                type="number" 
                                min="1" 
                                max="10" 
                                value={duration} 
                                onChange={(e) => setDuration(Number(e.target.value))} 
                                style={styles.input}
                            />
                        </div>
                        <div style={styles.fieldGroup}>
                            <label style={styles.label}>No. of bulk trades</label>
                            <input 
                                type="number" 
                                min="1" 
                                max="50" 
                                value={bulkCount} 
                                onChange={(e) => setBulkCount(Number(e.target.value))} 
                                style={styles.input}
                            />
                        </div>
                    </div>
                </div>

                {/* Right Visualizer Panel */}
                <div style={styles.visualizerCard}>
                    <DigitDisplay ticks={tickSequence} />
                </div>
            </div>

            {/* Bottom Action Bar */}
            <div style={styles.bottomBar}>
                <div style={styles.centerButtons}>
                    <button onClick={() => triggerBatch('Even')} style={styles.btnEven}>
                        <div style={styles.btnIcon}>⧈</div>
                        Bulk Even
                    </button>
                    <button onClick={() => triggerBatch()} style={styles.btnAi}>
                        <span style={styles.aiText}>Bulk AI Entry</span>
                    </button>
                    <button onClick={() => triggerBatch('Odd')} style={styles.btnOdd}>
                        <div style={styles.btnIcon}>▲</div>
                        Bulk Odd
                    </button>
                </div>
            </div>

            {/* Execution Control Footer */}
            <div style={styles.footerControl}>
                <button 
                    onClick={() => setIsRunning(!isRunning)}
                    style={{
                        ...styles.runBtn,
                        backgroundColor: isRunning ? '#ef4444' : '#00c853'
                    }}
                >
                    {isRunning ? 'Stop' : '▶ Run'}
                </button>
                <div style={styles.executionBadge}>
                    <span style={styles.execText}>Execution <strong>{executionMode}</strong></span>
                    <input 
                        type="checkbox" 
                        checked={executionMode === 'FAST'}
                        onChange={(e) => setExecutionMode(e.target.checked ? 'FAST' : 'SLOW')}
                        style={{ cursor: 'pointer', marginLeft: '10px' }}
                    />
                </div>
            </div>
        </div>
    );
};

const styles: Record<string, React.CSSProperties> = {
    container: {
        padding: '20px',
        backgroundColor: '#12121c',
        minHeight: '88vh',
        color: '#ffffff',
        fontFamily: 'sans-serif'
    },
    topSection: {
        display: 'grid',
        gridTemplateColumns: '1fr 1.3fr',
        gap: '20px',
        marginBottom: '20px'
    },
    formCard: {
        backgroundColor: '#1a1a28',
        borderRadius: '16px',
        padding: '20px',
        border: '1px solid #2a2a3d',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
    },
    formRow: {
        display: 'flex',
        gap: '16px'
    },
    fieldGroup: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '6px'
    },
    label: {
        fontSize: '12px',
        color: '#8a8aa0',
        fontWeight: 'bold'
    },
    select: {
        width: '100%',
        padding: '12px',
        backgroundColor: '#0d131d',
        color: '#ffffff',
        border: '1px solid #1e293b',
        borderRadius: '10px',
        outline: 'none'
    },
    input: {
        width: '100%',
        padding: '12px',
        backgroundColor: '#0d131d',
        color: '#ffffff',
        border: '1px solid #1e293b',
        borderRadius: '10px',
        outline: 'none'
    },
    visualizerCard: {
        backgroundColor: '#1a1a28',
        borderRadius: '16px',
        padding: '20px',
        border: '1px solid #2a2a3d'
    },
    bottomBar: {
        backgroundColor: '#1a1a28',
        borderRadius: '16px',
        padding: '20px',
        border: '1px solid #2a2a3d',
        display: 'flex',
        justify: 'center',
        marginBottom: '20px'
    },
    centerButtons: {
        display: 'flex',
        gap: '16px',
        alignItems: 'center'
    },
    btnEven: {
        width: '120px',
        height: '80px',
        backgroundColor: '#3b7a57',
        color: '#ffffff',
        border: 'none',
        borderRadius: '12px',
        fontWeight: 'bold',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justify: 'center',
        gap: '6px'
    },
    btnAi: {
        width: '80px',
        height: '80px',
        borderRadius: '50%',
        backgroundColor: '#38384a',
        border: '2px solid #5a5a72',
        color: '#ffffff',
        fontSize: '10px',
        fontWeight: 'bold',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justify: 'center',
        textAlign: 'center'
    },
    aiText: {
        maxWidth: '50px',
        lineHeight: '1.2'
    },
    btnOdd: {
        width: '120px',
        height: '80px',
        backgroundColor: '#8b3a42',
        color: '#ffffff',
        border: 'none',
        borderRadius: '12px',
        fontWeight: 'bold',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justify: 'center',
        gap: '6px'
    },
    btnIcon: {
        fontSize: '18px'
    },
    footerControl: {
        display: 'flex',
        alignItems: 'center',
        gap: '20px'
    },
    runBtn: {
        padding: '12px 30px',
        color: '#ffffff',
        border: 'none',
        borderRadius: '8px',
        fontWeight: 'bold',
        fontSize: '16px',
        cursor: 'pointer'
    },
    executionBadge: {
        display: 'flex',
        alignItems: 'center',
        backgroundColor: '#e6f4f1',
        color: '#1e293b',
        padding: '8px 16px',
        borderRadius: '8px',
        fontSize: '14px'
    },
    execText: {
        color: '#0f172a'
    }
};

export default BulkTrader;
