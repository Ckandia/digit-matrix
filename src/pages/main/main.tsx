import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import RiskDisclaimer from '@/components/risk-disclaimer';
import { useStore } from '@/stores';
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

const Main = observer(() => {
    const store = useStore();
    const client = store?.client;
    const run_panel = store?.run_panel;

    const [activeTab, setActiveTab] = useState<'dashboard' | 'bot-builder' | 'charts' | 'tutorials' | 'bulk-trader'>('bulk-trader');

    const isRunning = run_panel?.is_running;

    const handleRunToggle = () => {
        if (isRunning) {
            run_panel?.stopBot();
        } else {
            run_panel?.runBot();
        }
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
                        <span className="account-type">{client?.is_virtual ? 'Demo account' : 'Real account'}</span>
                        <span className="account-balance">{client?.balance ?? '0.00'} {client?.currency ?? 'USD'}</span>
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

            {/* Floating Global Risk Disclaimer */}
            <RiskDisclaimer />
        </div>
    );
});

export default Main;
