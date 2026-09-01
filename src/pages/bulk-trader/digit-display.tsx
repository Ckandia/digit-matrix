import React from 'react';
import { TickData } from './types';

interface DigitDisplayProps {
    ticks: TickData[];
    mode?: 'even_odd' | 'digit';
}

const DigitDisplay: React.FC<DigitDisplayProps> = ({ ticks, mode = 'even_odd' }) => {
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

            {/* Sequence Grid — shows E/O for Even/Odd strategies, actual digit values (0-9) for Matches/Differs/Over/Under */}
            <div className="sequence-grid-wrapper">
                <div className="grid-container">
                    {recentTicks.map((tick, index) => (
                        <span 
                            key={`${tick.epoch}-${index}`} 
                            className={
                                mode === 'even_odd'
                                    ? `seq-cell ${tick.type === 'E' ? 'E' : 'O'}`
                                    : `seq-cell seq-digit seq-digit-${tick.digit}`
                            }
                        >
                            {mode === 'even_odd' ? tick.type : tick.digit}
                        </span>
                    ))}
                </div>
            </div>
        </>
    );
};

export default DigitDisplay;
