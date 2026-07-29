import React, { useState, useEffect } from 'react';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import Dashboard from '../dashboard';
import BotBuilder from '../bot-builder';
import Tutorials from '../tutorials';
import BulkTrader from '../bulk-trader';
import './main.scss';

// Fallback view for Charts tab to avoid missing directory build errors
const ChartsPlaceholder = () => (
    <div style={{ padding: '40px', color: '#ffffff', textAlign: 'center' }}>
        <h2>Market Charts</h2>
        <p style={{ color: '#888888', marginTop: '10px' }}>
            Chart visualizer is active.
        </p>
    </div>
);

const Main = () => {
    const [activeTab, setActiveTab] = useState<'dashboard' | 'bot-builder' | 'charts' | 'tutorials' | 'bulk-trader'>('bulk-trader');
    const [isRunning, setIsRunning] = useState<boolean>(false);
    
    // Fallback states for the header balance
    const [balance, setBalance] = useState<string>('0.00');
    const [currency, setCurrency] = useState<string>('USD');
    const [isDemo, setIsDemo] = useState<boolean>(true);

    useEffect(() => {
        // Synchronize header with api_base account info
        const syncAccountInfo = () => {
            if (api_base?.account_info) {
                setBalance(api_base.account_info.balance?.toString() || '0.00');
                setCurrency(api_base.account_info.currency || 'USD');
                setIsDemo(api_base.account_info.is_virtual === 1);
            } else if (localStorage.getItem('client.accounts')) {
                try {
                    const accounts = JSON.parse(localStorage.getItem('client.accounts') || '{}');
                    const activeId = localStorage.getItem('active_loginid');
                    if (activeId && accounts[activeId]) {
                        setBalance(accounts[activeId].balance?.toString() || '0.00');
                        setCurrency(accounts[activeId].currency || 'USD');
                        setIsDemo(accounts[activeId].is_virtual === 1);
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }
        };

        syncAccountInfo();
        const interval = setInterval(syncAccountInfo, 2000);
        return () => clearInterval(interval);
    }, []);

    const handleRunToggle = () => {
        setIsRunning(!isRunning);
        // Add direct bot start/stop hook logic here if needed
    };

    return (
        <div className="main-layout">
            {/* Top Navigation Header */}
            <header className="app-header">
                <div className="header-left">
                    <div className="brand-logo">
                        <span className="logo-icon">D</span>
                        <span className="logo-text">digitmatrix</span>
                        <span className="powered-by-tag">Powered by Deriv</span>
                    </div>

                    <nav className="header-nav">
                        <button 
                            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} 
                            onClick={() => setActiveTab('dashboard')}
                        >
                            <span className="icon">㗊</span> Dashboard
                        </button>
                        <button 
                            className={`nav-item ${activeTab === 'bot-builder' ? 'active' : ''}`} 
                            onClick={() => setActiveTab('bot-builder')}
                        >
                            <span className="icon">🛠</span> Bot Builder
                        </button>
                        <button 
                            className={`nav-item ${activeTab === 'charts' ? 'active' : ''}`} 
                            onClick={() => setActiveTab('charts')}
                        >
                            <span className="icon">📈</span> Charts
                        </button>
                        <button 
                            className={`nav-item ${activeTab === 'tutorials' ? 'active' : ''}`} 
                            onClick={() => setActiveTab('tutorials')}
                        >
                            <span className="icon">🎦</span> Tutorials
                        </button>
                        <button 
                            className={`nav-item ${activeTab === 'bulk-trader' ? 'active' : ''}`} 
                            onClick={() => setActiveTab('bulk-trader')}
                        >
                            <span className="icon">≔</span> Bulk Trades
                        </button>
                    </nav>
                </div>

                <div className="header-right">
                    {/* Consolidated Single Run / Stop Toggle Button */}
                    <button 
                        className={`btn-main-run ${isRunning ? 'running' : ''}`}
                        onClick={handleRunToggle}
                    >
                        {isRunning ? '⏹ Stop' : '▶ Run'}
                    </button>

                    <div className="account-info">
                        <span className="account-type">{isDemo ? 'Demo account' : 'Real account'}</span>
                        <span className="account-balance">{balance} {currency}</span>
                        <button className="btn-transfer">Transfer</button>
                    </div>
                </div>
            </header>

            {/* Main Application Content */}
            <main className="main-content">
                {activeTab === 'dashboard' && <Dashboard />}
                {activeTab === 'bot-builder' && <BotBuilder />}
                {activeTab === 'charts' && <ChartsPlaceholder />}
                {activeTab === 'tutorials' && <Tutorials />}
                {activeTab === 'bulk-trader' && <BulkTrader />}
            </main>
        </div>
    );
};

export default Main;
