import React from 'react';
import { TickData } from './types';

interface DigitDisplayProps {
  ticks: TickData[];
  mode?: 'even_odd' | 'digit';
}

const DigitDisplay: React.FC<DigitDisplayProps> = ({ ticks, mode = 'even_odd' }) => {
  // FIX: Guard .slice() — fallback to empty array if ticks is undefined/null
  const safeTicks = Array.isArray(ticks) ? ticks : [];
  const recentTicks = safeTicks.slice(-50);
  
  const counts = new Array(10).fill(0);
  recentTicks.forEach(t => {
    // FIX: Guard individual tick object before accessing .digit
    if (t && typeof t.digit === 'number' && t.digit >= 0 && t.digit <= 9) {
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
          const lastTick = recentTicks[recentTicks.length - 1];
          const isLatest = lastTick && typeof lastTick.digit === 'number' && lastTick.digit === digit;

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

      {/* Sequence Grid */}
      <div className="sequence-grid-wrapper">
        <div className="grid-container">
          {/* FIX: Guard .map() with safe array */}
          {(recentTicks || []).map((tick, index) => {
            if (!tick) return null;
            return (
              <span 
                key={`${tick.epoch ?? index}-${index}`} 
                className={
                  mode === 'even_odd'
                    ? `seq-cell ${tick.type === 'E' ? 'E' : 'O'}`
                    : `seq-cell seq-digit seq-digit-${tick.digit}`
                }
              >
                {mode === 'even_odd' ? tick.type : tick.digit}
              </span>
            );
          })}
        </div>
      </div>
    </>
  );
};

export default DigitDisplay;
