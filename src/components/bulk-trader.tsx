import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { localize } from '@deriv-com/translations';
import Text from '@/components/shared_ui/text';
import './bulk-trader.scss';

const MARKETS = [
    'Vol 10', 'Vol 10 (1s)', 'Vol 15 (1s)', 'Vol 25', 'Vol 25 (1s)',
    'Vol 30 (1s)', 'Vol 50', 'Vol 50 (1s)', 'Vol 75', 'Vol 75 (1s)',
    'Vol 90 (1s)', 'Vol 100', 'Vol 100 (1s)', 'Jump 10', 'Jump 25', 'Jump 50'
];

const STRATEGIES = [
    'Even', 'Odd', 'Matches', 'Differs', 'Over', 'Under',
    'Rise', 'Fall', 'Only Ups', 'Only Downs', 'Rise Equals', 'Fall Equals'
];

const BulkTrader = observer(() => {
    const [selectedMarket, setSelectedMarket] = useState('Vol 10 (1s)');
    const [selectedStrategy, setSelectedStrategy] = useState('Even');
    const [stake, setStake] = useState<number | string>('0.5');
    const [duration, setDuration] = useState<number | string>('1');
    const [prediction, setPrediction] = useState<number | string>('1');
    const [numBulkTrades, setNumBulkTrades] = useState<number | string>('10');
    
    // Target fields matching your requirements
    const [targetX, setTargetX] = useState<number | string>('');
    const [targetY, setTargetY] = useState<number | string>('');

    // Strict control state
    const [stopWhenInProfit, setStopWhenInProfit] = useState<boolean>(false);

    // Dropdown visibility toggles
    const [isMarketOpen, setIsMarketOpen] = useState(false);
    const [isStrategyOpen, setIsStrategyOpen] = useState(false);

    return (
        <div className='bulk-trader-container digit-matrix-container'>
            {/* Top Navigation Bar */}
            <div className='bulk-trader-top-nav'>
                <div className='brand-title'>
                    <Text size='sm' weight='bold' color='prominent'>DIGIT MATRIX PRO</Text>
                    <span className='powered-sub'>POWERED BY DERIV</span>
                </div>
            </div>

            {/* Main Interactive Grid */}
            <div className='bulk-trader-grid'>
                {/* Left Panel: Inputs & Configuration */}
                <div className='config-panel'>
                    {/* Market Dropdown Selector */}
                    <div className='input-field-group'>
                        <label><Text size='xs' color='general'>Market</Text></label>
                        <div className='custom-select-wrapper' onClick={() => setIsMarketOpen(!isMarketOpen)}>
                            <div className='selected-display'>{selectedMarket}</div>
                            {isMarketOpen && (
                                <ul className='dropdown-list'>
                                    {MARKETS.map((m) => (
                                        <li key={m} onClick={() => { setSelectedMarket(m); setIsMarketOpen(false); }}>
                                            {m}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>

                    {/* Strategy Dropdown Selector */}
                    <div className='input-field-group'>
                        <label><Text size='xs' color='general'>Strategy</Text></label>
                        <div className='custom-select-wrapper' onClick={() => setIsStrategyOpen(!isStrategyOpen)}>
                            <div className='selected-display'>{selectedStrategy}</div>
                            {isStrategyOpen && (
                                <ul className='dropdown-list'>
                                    {STRATEGIES.map((s) => (
                                        <li key={s} onClick={() => { setSelectedStrategy(s); setIsStrategyOpen(false); }}>
                                            {s}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>

                    {/* Stake (USD) */}
                    <div className='input-field-group'>
                        <label><Text size='xs' color='general'>Stake (USD)</Text></label>
                        <input 
                            type='number' 
                            value={stake} 
                            onChange={(e) => setStake(e.target.value)} 
                        />
                    </div>

                    {/* Duration (ticks) */}
                    <div className='input-field-group'>
                        <label><Text size='xs' color='general'>Duration (ticks)</Text></label>
                        <input 
                            type='number' 
                            value={duration} 
                            onChange={(e) => setDuration(e.target.value)} 
                        />
                    </div>

                    {/* Prediction */}
                    <div className='input-field-group'>
                        <label><Text size='xs' color='general'>Prediction</Text></label>
                        <input 
                            type='number' 
                            value={prediction} 
                            onChange={(e) => setPrediction(e.target.value)} 
                        />
                    </div>

                    {/* No. of bulk trades */}
                    <div className='input-field-group'>
                        <label><Text size='xs' color='general'>No. of bulk trades</Text></label>
                        <input 
                            type='number' 
                            value={numBulkTrades} 
                            onChange={(e) => setNumBulkTrades(e.target.value)} 
                        />
                    </div>

                    {/* Target X / Target Y Inputs */}
                    <div className='target-row'>
                        <div className='input-field-group half'>
                            <label><Text size='xs' color='general'>target x</Text></label>
                            <input 
                                type='number' 
                                value={targetX} 
                                onChange={(e) => setTargetX(e.target.value)} 
                                placeholder='0' 
                            />
                        </div>
                        <div className='input-field-group half'>
                            <label><Text size='xs' color='general'>target y</Text></label>
                            <input 
                                type='number' 
                                value={targetY} 
                                onChange={(e) => setTargetY(e.target.value)} 
                                placeholder='0' 
                            />
                        </div>
                    </div>

                    {/* Stop when in profit mechanism */}
                    <div className='input-field-group checkbox-group'>
                        <label className='checkbox-label'>
                            <input 
                                type='checkbox' 
                                checked={stopWhenInProfit}
                                onChange={(e) => setStopWhenInProfit(e.target.checked)}
                            />
                            <Text size='xs'>
                                {localize('Stop when in profit (prevents extra runs when the current run is in profit)')}
                            </Text>
                        </label>
                    </div>
                </div>

                {/* Right Panel: Digit Matrix Display & Execution Triggers */}
                <div className='visual-display-panel'>
                    {/* Digit Statistics Bar (0-9 with percentages) */}
                    <div className='digit-stats-bar'>
                        {[
                            { digit: 0, pct: '9.60%' },
                            { digit: 1, pct: '8.70%', active: true },
                            { digit: 2, pct: '10.30%', highlight: true },
                            { digit: 3, pct: '8.90%' },
                            { digit: 4, pct: '10.40%' },
                            { digit: 5, pct: '9.70%' },
                            { digit: 6, pct: '10.40%' },
                            { digit: 7, pct: '11.50%', green: true },
                            { digit: 8, pct: '9.40%' },
                            { digit: 9, pct: '10.90%' }
                        ].map((item) => (
                            <div key={item.digit} className={`digit-node ${item.active ? 'active' : ''} ${item.highlight ? 'highlight' : ''} ${item.green ? 'green' : ''}`}>
                                <span className='digit-num'>{item.digit}</span>
                                <span className='digit-pct'>{item.pct}</span>
                            </div>
                        ))}
                    </div>

                    {/* Tick Stream Matrix Rows (E / O indicators) */}
                    <div className='matrix-stream-box'>
                        <div className='matrix-row'>
                            {['E','O','E','O','E','E','E','E','O','E'].map((val, idx) => (
                                <span key={idx} className={`matrix-badge ${val === 'E' ? 'even' : 'odd'}`}>{val}</span>
                            ))}
                        </div>
                        <div className='matrix-row'>
                            {['E','O','E','O','E','E','E','O','E','O'].map((val, idx) => (
                                <span key={idx} className={`matrix-badge ${val === 'E' ? 'even' : 'odd'}`}>{val}</span>
                            ))}
                        </div>
                        <div className='matrix-row'>
                            {['O','O','E','O','E','E','E','O','E','E'].map((val, idx) => (
                                <span key={idx} className={`matrix-badge ${val === 'E' ? 'even' : 'odd'}`}>{val}</span>
                            ))}
                        </div>
                    </div>

                    {/* Action Execution Buttons */}
                    <div className='execution-actions-row'>
                        <button className='bulk-btn bulk-even'>
                            <span>Bulk Even</span>
                        </button>
                        <button className='bulk-btn bulk-ai-entry'>
                            <span>Bulk AI Entry</span>
                        </button>
                        <button className='bulk-btn bulk-odd'>
                            <span>Bulk Odd</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Bottom Status Panel */}
            <div className='bulk-bottom-status'>
                <button className='run-action-btn'>
                    <span>▶ Run</span>
                </button>
                <div className='status-text-display'>
                    <Text size='s' color='general'>Bot is not running</Text>
                </div>
            </div>
        </div>
    );
});

export default BulkTrader;
