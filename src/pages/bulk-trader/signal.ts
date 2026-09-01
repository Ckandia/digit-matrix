import { STRATEGY_PAIR_MAPPING, TickData } from './types';

export interface TradeSignal {
    side: 'left' | 'right';
    label: string;
    digit?: number;
    // Plain descriptive stats — NOT a probability, confidence score, or backtested
    // win rate. See the big comment below for why those aren't offered here.
    sampleSize: number;
    splitLabel: string;
    noTrade: boolean;
}

// Lightweight heuristic signal generator.
//
// IMPORTANT, READ BEFORE CHANGING THIS FILE: for digit-based contracts (Even/Odd,
// Matches/Differs, Over/Under) on Deriv's synthetic indices, each tick's last digit
// is independently and uniformly distributed — the previous 10, 100, or 1000 digits
// carry no information about the next one. This file deliberately does NOT compute
// a "confidence %" or a "historical backtest win rate." Both are statistically
// meaningless here: testing enough window sizes/combinations against past data will
// always turn up something that "worked" some percentage of the time purely by
// chance (overfitting), and presenting that as a predictive confidence score would
// be actively misleading for a tool people trade real money on. If asked to add
// that kind of feature back, don't — explain why instead (see conversation history).
//
// What this DOES provide, honestly:
// - A side/digit recommendation based on which option looks under-represented in
//   the recent window — a consistent, structured entry cue, not a proven edge.
// - sampleSize + splitLabel: plain descriptive counts (e.g. "11/20 Even (55%)"),
//   so the user can see exactly what the recommendation is based on rather than
//   trusting a black-box score.
// - noTrade: true when there isn't enough data yet, or the recent split is close
//   enough to a coin flip that highlighting either side would be arbitrary. The
//   55% threshold below is just a display cutoff for "this doesn't look lopsided
//   enough to bother highlighting" — not a statistically validated confidence level.
//
// Labels always come from STRATEGY_PAIR_MAPPING (the same source the action buttons
// use) rather than being hardcoded per branch — this is what keeps Only Ups/Only
// Downs and Rise Equals/Fall Equals showing their own correct names instead of
// always showing "Rise"/"Fall".
const NO_TRADE_LEAD_THRESHOLD = 0.55;

export const computeSignal = (
    strategy: string,
    ticks: TickData[],
    prediction: number,
    duration: number,
    windowSize = 20
): TradeSignal | null => {
    const recent = ticks.slice(-windowSize);
    if (recent.length === 0) return null;

    const pair = STRATEGY_PAIR_MAPPING[strategy];
    if (!pair) return null;

    const sampleSize = recent.length;
    const insufficientData = sampleSize < windowSize;

    const buildResult = (
        side: 'left' | 'right',
        label: string,
        leaderCount: number,
        digit?: number
    ): TradeSignal => {
        const leaderShare = leaderCount / sampleSize;
        const otherLabel = side === 'left' ? pair.right.label : pair.left.label;
        const otherCount = sampleSize - leaderCount;
        const pct = Math.round(leaderShare * 100);
        return {
            side,
            label,
            digit,
            sampleSize,
            splitLabel: `${leaderCount}/${sampleSize} ${label} vs ${otherCount}/${sampleSize} ${otherLabel} (${pct}%) · settles after ${duration} tick${duration === 1 ? '' : 's'}`,
            noTrade: insufficientData || leaderShare < NO_TRADE_LEAD_THRESHOLD,
        };
    };

    if (strategy === 'Even' || strategy === 'Odd') {
        const evenCount = recent.filter((t) => t.type === 'E').length;
        const oddCount = sampleSize - evenCount;
        return evenCount >= oddCount
            ? buildResult('left', pair.left.label, evenCount)
            : buildResult('right', pair.right.label, oddCount);
    }

    if (strategy === 'Matches' || strategy === 'Differs') {
        const counts = new Array(10).fill(0);
        recent.forEach((t) => {
            counts[t.digit] += 1;
        });
        const durationNote = `settles after ${duration} tick${duration === 1 ? '' : 's'}`;

        if (strategy === 'Matches') {
            // Least-represented digit recently — the "due" digit to match. Framed
            // as descriptive (how rare has this digit been), not predictive.
            const minCount = Math.min(...counts);
            const digit = counts.indexOf(minCount);
            const pct = Math.round((minCount / sampleSize) * 100);
            return {
                side: 'left',
                label: pair.left.label,
                digit,
                sampleSize,
                splitLabel: `Digit ${digit} appeared ${minCount}/${sampleSize} times (${pct}%) recently · ${durationNote}`,
                noTrade: insufficientData,
            };
        }

        // Most-represented digit recently — bet against it repeating.
        const maxCount = Math.max(...counts);
        const digit = counts.indexOf(maxCount);
        const pct = Math.round((maxCount / sampleSize) * 100);
        return {
            side: 'right',
            label: pair.right.label,
            digit,
            sampleSize,
            splitLabel: `Digit ${digit} appeared ${maxCount}/${sampleSize} times (${pct}%) recently · ${durationNote}`,
            noTrade: insufficientData,
        };
    }

    if (strategy === 'Over' || strategy === 'Under') {
        const overCount = recent.filter((t) => t.digit > prediction).length;
        const underCount = recent.filter((t) => t.digit < prediction).length;
        return overCount >= underCount
            ? buildResult('left', pair.left.label, overCount, undefined)
            : buildResult('right', pair.right.label, underCount, undefined);
    }

    // Rise/Fall, Only Ups/Only Downs, Rise Equals/Fall Equals — these settle on
    // price movement over exactly `duration` ticks, so the check uses that exact
    // window (not the generic 20-tick analysis window used above), and needs
    // duration+1 price points to measure `duration` steps of movement.
    if (['Rise', 'Fall', 'Only Ups', 'Only Downs', 'Rise Equals', 'Fall Equals'].includes(strategy)) {
        const priceWindow = ticks.slice(-(duration + 1));
        if (priceWindow.length < duration + 1) {
            return {
                side: 'left',
                label: pair.left.label,
                sampleSize: priceWindow.length,
                splitLabel: `Waiting for ${duration + 1} ticks of price data to check a ${duration}-tick move`,
                noTrade: true,
            };
        }

        const isRunContract = strategy === 'Only Ups' || strategy === 'Only Downs';

        if (isRunContract) {
            // RUNHIGH/RUNLOW (Only Ups/Only Downs) only win if EVERY consecutive
            // tick moves the same direction for the whole duration — a single
            // reversal anywhere in the window fails the contract. So the signal
            // only counts as valid ("barrier met") if the last `duration` ticks
            // already showed that exact clean run; otherwise it's a genuine
            // no-trade, not a guess.
            let allUp = true;
            let allDown = true;
            for (let i = 1; i < priceWindow.length; i++) {
                if (priceWindow[i].quote <= priceWindow[i - 1].quote) allUp = false;
                if (priceWindow[i].quote >= priceWindow[i - 1].quote) allDown = false;
            }
            const side: 'left' | 'right' = allUp ? 'left' : 'right';
            const label = side === 'left' ? pair.left.label : pair.right.label;
            return {
                side,
                label,
                sampleSize: priceWindow.length,
                splitLabel: allUp
                    ? `Last ${duration} ticks all moved up — a clean run, matching what ${pair.left.label} needs`
                    : allDown
                        ? `Last ${duration} ticks all moved down — a clean run, matching what ${pair.right.label} needs`
                        : `Last ${duration} ticks were mixed — no clean run in either direction, barrier not met`,
                noTrade: !allUp && !allDown,
            };
        }

        // Rise/Fall, Rise Equals/Fall Equals — just need net movement over the
        // duration window, not a clean tick-by-tick run.
        const first = priceWindow[0].quote;
        const last = priceWindow[priceWindow.length - 1].quote;
        const changed = first !== last;
        const side: 'left' | 'right' = last >= first ? 'left' : 'right';
        const label = side === 'left' ? pair.left.label : pair.right.label;
        return {
            side,
            label,
            sampleSize: priceWindow.length,
            splitLabel: changed
                ? `Price moved ${side === 'left' ? 'up' : 'down'} over the last ${duration} tick${duration === 1 ? '' : 's'}`
                : `Price was flat over the last ${duration} tick${duration === 1 ? '' : 's'} — no clear direction`,
            noTrade: !changed,
        };
    }

    return null;
};
