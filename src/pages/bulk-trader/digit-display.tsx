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
        <>
            {/* Top Heatmap Circles */}
            <div className="digit-heatmap-container">
                {counts.map((count, digit) => {
                    const percentage = ((count / total) * 100).toFixed(2);
                    const isLatest = recentTicks.length > 0 && recentTicks[recentTicks.length - 1].digit === digit;

                    return (
                        <div 
                            key={digit} 
                            className={`digit-circle digit-${digit} ${isLatest ? 'active-latest' : ''}`}
                        >
                            <span className="num">{digit}</span>
                            <span className="pct">{percentage}%</span>
                        </div>
                    );
                })}
            </div>

            {/* Sequence Grid (E and O) */}
            <div className="sequence-grid-wrapper">
                <div className="grid-container">
                    {recentTicks.map((tick, index) => (
                        <span 
                            key={`${tick.epoch}-${index}`} 
                            className={`seq-cell ${tick.type === 'E' ? 'E' : 'O'}`}
                        >
                            {tick.type}
                        </span>
                    ))}
                </div>
            </div>
        </>
    );
};

export default DigitDisplay;
