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
 * Required by index.tsx for UI analysis & countdown timers
 */
export const computeSignal = (
  strategy: string,
  ticks: number[] | TickItem[] | undefined | null,
  prediction?: number,
  duration: number = 1
): { signal: string; confidence: number } => {
  const safeTicks = Array.isArray(ticks) ? ticks : [];
  if (safeTicks.length === 0) {
    return { signal: 'NEUTRAL', confidence: 0 };
  }

  const digits = safeTicks.map(t => (typeof t === 'number' ? t : t?.digit ?? 0));
  const lastDigit = digits[digits.length - 1] ?? 0;

  switch ((strategy || '').toUpperCase()) {
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
 * Strict Entry Validator for Trade Execution with defensive undefined/null checks
 */
export const shouldExecuteTrade = (
  config: ManualTradeConfig,
  ticks: TickItem[] | undefined | null
): { allowed: boolean; reason?: string } => {
  const safeTicks = Array.isArray(ticks) ? ticks : [];

  if (safeTicks.length < 15) {
    return { allowed: false, reason: 'Waiting for tick data...' };
  }

  const lastIndex = safeTicks.length - 1;
  const currentTick = safeTicks[lastIndex];
  const prevTick = safeTicks[lastIndex - 1];

  if (!currentTick || !prevTick) {
    return { allowed: false, reason: 'Invalid tick frame' };
  }

  // RULE 1: EVEN / ODD STABILITY FILTER (Skip edge digits 0 and 9)
  if (config.contractType === 'DIGITEVEN' || config.contractType === 'DIGITODD') {
    if (currentTick.digit === 0 || currentTick.digit === 9) {
      return { allowed: false, reason: `Edge digit (${currentTick.digit}) blocked` };
    }

    const last3Digits = (safeTicks || []).slice(-3).map(t => t?.digit ?? 0);
    if (config.contractType === 'DIGITEVEN') {
      const allOdd = last3Digits.every(d => d % 2 !== 0);
      if (!allOdd) return { allowed: false, reason: 'Waiting for 3 consecutive ODD ticks' };
    } else {
      const allEven = last3Digits.every(d => d % 2 === 0);
      if (!allEven) return { allowed: false, reason: 'Waiting for 3 consecutive EVEN ticks' };
    }
  }

  // RULE 2: DIFFERS / MATCHES COLD DIGIT FILTER
  if (config.contractType === 'DIGITDIFF' && config.targetDigit !== undefined) {
    const recentDigits = (safeTicks || []).slice(-10).map(t => t?.digit ?? 0);
    if (recentDigits.includes(config.targetDigit)) {
      return { allowed: false, reason: `Target digit ${config.targetDigit} appeared recently` };
    }
  }

  // RULE 3: RISE / FALL ZERO-SPREAD FILTER
  if (config.contractType === 'CALL' || config.contractType === 'PUT') {
    const priceDiff = Math.abs(currentTick.quote - prevTick.quote);
    if (priceDiff === 0) {
      return { allowed: false, reason: 'Market flatlined' };
    }
  }

  return { allowed: true };
};
