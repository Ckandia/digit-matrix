import React from 'react';
import { TickData } from './types';

interface DigitDisplayProps {
    ticks?: TickData[];
    mode: 'even_odd' | 'digit';
}

const DigitDisplay: React.FC<DigitDisplayProps> = ({ ticks = [], mode }) => {
    // Defensive check ensuring ticks is never undefined
    const safeTicks = Array.isArray(ticks) ? ticks : [];

    if (safeTicks.length === 0) {
        return <div className="digit-display-empty">Waiting for tick data…</div>;
    }

    const recentTicks = safeTicks.slice(-10);

    return (
        <div className="digit-display-container">
            <div className="ticks-list">
                {recentTicks.map((tick, index) => {
                    const quoteStr = tick?.quote?.toString() || '0';
                    const lastDigit = parseInt(quoteStr.slice(-1), 10);
                    const isEven = lastDigit % 2 === 0;

                    return (
                        <div key={tick.epoch || index} className={`tick-pill ${isEven ? 'even' : 'odd'}`}>
                            {mode === 'even_odd' ? (
                                <span>{isEven ? 'E' : 'O'}</span>
                            ) : (
                                <span>{isNaN(lastDigit) ? '-' : lastDigit}</span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default DigitDisplay;
