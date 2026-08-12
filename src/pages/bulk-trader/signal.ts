import { TickData } from './types';

export interface TradeSignal {
    side: 'left' | 'right';
    label: string;
    digit?: number;
}

// Lightweight heuristic signal generator. IMPORTANT: for digit-based contracts
// (Even/Odd, Matches/Differs, Over/Under) on Deriv's synthetic indices, each tick's
// last digit is independently and uniformly distributed — past digit frequency has
// no proven predictive power over the next tick. This computes a "which side looks
// under-represented in the recent window" heuristic to give a consistent, structured
// entry cue — a discipline tool, not a genuine statistical edge. Rise/Fall-style
// contracts use short-term price direction instead, since there's no digit concept.
export const computeSignal = (
    strategy: string,
    ticks: TickData[],
    prediction: number,
    windowSize = 20
): TradeSignal | null => {
    const recent = ticks.slice(-windowSize);
    if (recent.length === 0) return null;

    if (strategy === 'Even' || strategy === 'Odd') {
        const evenCount = recent.filter((t) => t.type === 'E').length;
        const oddCount = recent.length - evenCount;
        return evenCount <= oddCount
            ? { side: 'left', label: 'Even' }
            : { side: 'right', label: 'Odd' };
    }

    if (strategy === 'Matches' || strategy === 'Differs') {
        const counts = new Array(10).fill(0);
        recent.forEach((t) => {
            counts[t.digit] += 1;
        });

        if (strategy === 'Matches') {
            // Least-represented digit recently — the "due" digit to match.
            const minCount = Math.min(...counts);
            const digit = counts.indexOf(minCount);
            return { side: 'left', label: 'Match', digit };
        }

        // Most-represented digit recently — bet against it repeating.
        const maxCount = Math.max(...counts);
        const digit = counts.indexOf(maxCount);
        return { side: 'right', label: 'Differ', digit };
    }

    if (strategy === 'Over' || strategy === 'Under') {
        const overCount = recent.filter((t) => t.digit > prediction).length;
        const underCount = recent.filter((t) => t.digit < prediction).length;
        return overCount <= underCount
            ? { side: 'left', label: 'Over' }
            : { side: 'right', label: 'Under' };
    }

    // Rise/Fall, Only Ups/Only Downs, Rise Equals/Fall Equals — no digit concept,
    // use short-term price direction over the window instead.
    if (recent.length >= 2) {
        const first = recent[0].quote;
        const last = recent[recent.length - 1].quote;
        return last >= first
            ? { side: 'left', label: 'Rise' }
            : { side: 'right', label: 'Fall' };
    }

    return null;
};
