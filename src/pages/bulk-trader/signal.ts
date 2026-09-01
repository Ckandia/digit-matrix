// signal.ts

export interface ManualTradeConfig {
  contractType: 'DIGITEVEN' | 'DIGITODD' | 'DIGITDIFF' | 'DIGITMATCH' | 'CALL' | 'PUT' | 'ONETOUCH';
  duration: number;        // e.g., 1, 2, 5 (ticks)
  targetDigit?: number;    // set manually in UI for Matches/Differs
  stake: number;
}

export interface TickItem {
  quote: number;
  digit: number;
}

/**
 * Validates manual UI settings against strict tick filters before placing a trade.
 */
export const shouldExecuteTrade = (
  config: ManualTradeConfig,
  ticks: TickItem[]
): { allowed: boolean; reason?: string } => {
  if (ticks.length < 15) {
    return { allowed: false, reason: 'Insufficient tick data (accumulating...)' };
  }

  const lastIndex = ticks.length - 1;
  const currentTick = ticks[lastIndex];
  const prevTick = ticks[lastIndex - 1];

  // RULE 1: EVEN / ODD STABILITY FILTER
  if (config.contractType === 'DIGITEVEN' || config.contractType === 'DIGITODD') {
    // Block Edge Digits (0 and 9 trigger immediate mean-reversion traps)
    if (currentTick.digit === 0 || currentTick.digit === 9) {
      return { allowed: false, reason: `Blocked: Triggered on edge digit (${currentTick.digit})` };
    }

    // Require last 3 ticks to be uniform (streak rule)
    const last3Digits = ticks.slice(-3).map(t => t.digit);
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
    // Ensure chosen target digit hasn't appeared in the last 10 ticks
    const recentDigits = ticks.slice(-10).map(t => t.digit);
    if (recentDigits.includes(config.targetDigit)) {
      return { allowed: false, reason: `Target digit ${config.targetDigit} appeared recently` };
    }
  }

  // RULE 3: RISE / FALL (CALL / PUT) SPREAD FILTER
  if (config.contractType === 'CALL' || config.contractType === 'PUT') {
    const priceDiff = Math.abs(currentTick.quote - prevTick.quote);
    if (priceDiff === 0) {
      return { allowed: false, reason: 'Blocked: Market flatlined (0 pip movement)' };
    }
  }

  return { allowed: true };
};
