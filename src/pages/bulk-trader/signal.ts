import { TickData } from './types';

export interface TradeSignal {
    label: string;
    digit?: number;
    splitLabel?: string;
    noTrade?: boolean;
    side?: 'left' | 'right';
}

export function computeSignal(
    strategy: string,
    ticks: TickData[] = [],
    currentPrediction: number,
    duration: number
): TradeSignal | null {
    // Array safety validation
    if (!Array.isArray(ticks) || ticks.length === 0) {
        return null;
    }

    const lastTick = ticks[ticks.length - 1];
    if (!lastTick || lastTick.quote === undefined) {
        return null;
    }

    const quoteStr = lastTick.quote.toString();
    const lastDigit = parseInt(quoteStr.slice(-1), 10);

    if (isNaN(lastDigit)) {
        return null;
    }

    if (strategy === 'Even' || strategy === 'Odd') {
        const isEven = lastDigit % 2 === 0;
        return {
            label: isEven ? 'EVEN' : 'ODD',
            side: isEven ? 'left' : 'right',
            splitLabel: `Last Digit: ${lastDigit}`,
            noTrade: false,
        };
    }

    if (['Matches', 'Differs', 'Over', 'Under'].includes(strategy)) {
        return {
            label: `${strategy.toUpperCase()} ${currentPrediction}`,
            digit: lastDigit,
            side: 'left',
            splitLabel: `Target: ${currentPrediction} | Latest: ${lastDigit}`,
            noTrade: false,
        };
    }

    return null;
}
