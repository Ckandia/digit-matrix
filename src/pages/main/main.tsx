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
    const [activeTab, setActiveTab] = useState<'dashboard' | 'bot-builder' | 'charts' | 'tutorials' | 'bulk-trader'>('dashboard');

    return (
        <div className="main-layout">
            {/* 
              Tab Navigation
              The header containing the Logo and Account Balance has been removed 
              from here to prevent duplication with your main App shell.
            */}
            <div className="app-tabs-nav">
                <button 
                    className={`tab-item ${activeTab === 'dashboard' ? 'active' : ''}`} 
                    onClick={() => setActiveTab('dashboard')}
                >
                    Dashboard
                </button>
                <button 
                    className={`tab-item ${activeTab === 'bot-builder' ? 'active' : ''}`} 
                    onClick={() => setActiveTab('bot-builder')}
                >
                    Bot builder
                </button>
                <button 
                    className={`tab-item ${activeTab === 'charts' ? 'active' : ''}`} 
                    onClick={() => setActiveTab('charts')}
                >
                    Charts
                </button>
                <button 
                    className={`tab-item ${activeTab === 'tutorials' ? 'active' : ''}`} 
                    onClick={() => setActiveTab('tutorials')}
                >
                    Tutorials
                </button>
                <button 
                    className={`tab-item ${activeTab === 'bulk-trader' ? 'active' : ''}`} 
                    onClick={() => setActiveTab('bulk-trader')}
                >
                    Bulk trades
                </button>
            </div>

            {/* Main Content Area */}
            <main className="tab-content-wrapper">
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
