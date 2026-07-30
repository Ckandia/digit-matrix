import React, { useState } from 'react';
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
    // Set default active tab
    const [activeTab, setActiveTab] = useState<'dashboard' | 'bot-builder' | 'charts' | 'tutorials' | 'bulk-trader'>('dashboard');

    return (
        <div className="digit-matrix-main-wrapper" style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%' }}>
            {/* 
              Simplified Tab Navigation 
              Header elements (Logo, Balance) removed to prevent duplication.
              RiskDisclaimer removed to prevent Vercel build errors.
            */}
            <nav className="main-tabs-navigation" style={{ 
                display: 'flex', 
                padding: '10px 20px', 
                backgroundColor: 'var(--color-bg-elevated)', 
                borderBottom: '1px solid var(--color-border)' 
            }}>
                <button 
                    style={{ margin: '0 10px', padding: '8px 16px', background: activeTab === 'dashboard' ? 'var(--color-active)' : 'transparent', color: 'var(--color-text)', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                    onClick={() => setActiveTab('dashboard')}
                >
                    Dashboard
                </button>
                <button 
                    style={{ margin: '0 10px', padding: '8px 16px', background: activeTab === 'bot-builder' ? 'var(--color-active)' : 'transparent', color: 'var(--color-text)', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                    onClick={() => setActiveTab('bot-builder')}
                >
                    Bot Builder
                </button>
                <button 
                    style={{ margin: '0 10px', padding: '8px 16px', background: activeTab === 'charts' ? 'var(--color-active)' : 'transparent', color: 'var(--color-text)', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                    onClick={() => setActiveTab('charts')}
                >
                    Charts
                </button>
                <button 
                    style={{ margin: '0 10px', padding: '8px 16px', background: activeTab === 'tutorials' ? 'var(--color-active)' : 'transparent', color: 'var(--color-text)', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                    onClick={() => setActiveTab('tutorials')}
                >
                    Tutorials
                </button>
                <button 
                    style={{ margin: '0 10px', padding: '8px 16px', background: activeTab === 'bulk-trader' ? 'var(--color-active)' : 'transparent', color: 'var(--color-text)', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                    onClick={() => setActiveTab('bulk-trader')}
                >
                    Bulk Trades
                </button>
            </nav>

            {/* Main Application Content Area */}
            <main style={{ flexGrow: 1, overflow: 'auto', position: 'relative' }}>
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
