import React from 'react';
import { TickData } from './types';

interface DigitDisplayProps {
    ticks: TickData[];
}

const DigitDisplay: React.FC<DigitDisplayProps> = ({ ticks }) => {
    const recentTicks = ticks.slice(-50);
    
    const counts = new Array(10).fill(0);
    recentTicks.forEach(t => {
        if (t.digit >= 0 && t.digit <= 9) {
            counts[t.digit]++;
        }
    });

    const total = recentTicks.length || 1;

    return (
        <div className="digit-display-wrapper">
            <div className="digit-heatmap-bar">
                {counts.map((count, digit) => {
                    const percentage = ((count / total) * 100).toFixed(2);
                    const isLatest = recentTicks.length > 0 && recentTicks[recentTicks.length - 1].digit === digit;

                    return (
                        <div 
                            key={digit} 
                            className={`digit-stat-circle digit-${digit} ${isLatest ? 'active-latest' : ''}`}
                        >
                            <span className="digit-number">{digit}</span>
                            <span className="digit-percentage">{percentage}%</span>
                        </div>
                    );
                })}
            </div>

            <div className="sequence-grid-container">
                {recentTicks.map((tick, index) => (
                    <div 
                        key={`${tick.epoch}-${index}`} 
                        className={`sequence-cell ${tick.type === 'E' ? 'even-cell' : 'odd-cell'}`}
                    >
                        {tick.type}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default DigitDisplay;
