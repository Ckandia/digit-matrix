// src/pages/bulk-trader/signal.ts

export interface ManualTradeConfig {
  contractType: 'DIGITEVEN' | 'DIGITODD' | 'DIGITDIFF' | 'DIGITMATCH' | 'CALL' | 'PUT' | 'ONETOUCH';
  duration: number;
  targetDigit?: number;
  stake: number;
}

export interface TickItem {
  quote: number;
  digit: number;
}

/**
 * Required by index.tsx for signal evaluation and countdown timers
 */
export const computeSignal = (
  strategy: string,
  ticks: number[] | TickItem[],
  prediction?: number,
  duration: number = 1
): { signal: string; confidence: number } => {
  if (!ticks || ticks.length === 0) {
    return { signal: 'NEUTRAL', confidence: 0 };
  }

  const digits = ticks.map(t => (typeof t === 'number' ? t : t.digit));
  const lastDigit = digits[digits.length - 1];

  switch (strategy.toUpperCase()) {
    case 'EVEN':
    case 'DIGITEVEN':
      return { signal: 'DIGITEVEN', confidence: 80 };

    case 'ODD':
    case 'DIGITODD':
      return { signal: 'DIGITODD', confidence: 80 };

    case 'MATCHES':
    case 'DIGITMATCH':
      return { signal: 'DIGITMATCH', confidence: 75 };

    case 'DIFFERS':
    case 'DIGITDIFF':
      return { signal: 'DIGITDIFF', confidence: 90 };

    default:
      return { signal: lastDigit % 2 === 0 ? 'DIGITEVEN' : 'DIGITODD', confidence: 70 };
  }
};

/**
 * Strict Entry Validator for execution
 */
export const shouldExecuteTrade = (
  config: ManualTradeConfig,
  ticks: TickItem[]
): { allowed: boolean; reason?: string } => {
  if (ticks.length < 15) {
    return { allowed: false, reason: 'Insufficient tick data' };
  }

  const lastIndex = ticks.length - 1;
  const currentTick = ticks[lastIndex];
  const prevTick = ticks[lastIndex - 1];

  if (config.contractType === 'DIGITEVEN' || config.contractType === 'DIGITODD') {
    if (currentTick.digit === 0 || currentTick.digit === 9) {
      return { allowed: false, reason: `Edge digit (${currentTick.digit}) blocked` };
    }

    const last3Digits = ticks.slice(-3).map(t => t.digit);
    if (config.contractType === 'DIGITEVEN') {
      const allOdd = last3Digits.every(d => d % 2 !== 0);
      if (!allOdd) return { allowed: false, reason: 'Waiting for 3 consecutive ODD ticks' };
    } else {
      const allEven = last3Digits.every(d => d % 2 === 0);
      if (!allEven) return { allowed: false, reason: 'Waiting for 3 consecutive EVEN ticks' };
    }
  }

  if (config.contractType === 'DIGITDIFF' && config.targetDigit !== undefined) {
    const recentDigits = ticks.slice(-10).map(t => t.digit);
    if (recentDigits.includes(config.targetDigit)) {
      return { allowed: false, reason: `Target digit ${config.targetDigit} appeared recently` };
    }
  }

  if (config.contractType === 'CALL' || config.contractType === 'PUT') {
    const priceDiff = Math.abs(currentTick.quote - prevTick.quote);
    if (priceDiff === 0) {
      return { allowed: false, reason: 'Market flatlined' };
    }
  }

  return { allowed: true };
};
