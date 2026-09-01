interface TradeContext {
  contractType: 'EVEN_ODD' | 'DIFFERS' | 'RISE_FALL' | 'ONLY_UPS';
  duration: number; // in ticks
  ticks: Array<{ quote: number; digit: number }>;
}

export const isValidContractSetup = (ctx: TradeContext): boolean => {
  const { contractType, duration, ticks } = ctx;
  if (ticks.length < 15) return false;

  const currentDigit = ticks[ticks.length - 1].digit;
  const currentQuote = ticks[ticks.length - 1].quote;
  const prevQuote = ticks[ticks.length - 2].quote;

  switch (contractType) {
    case 'EVEN_ODD':
      // 1-Tick Filter: Skip Edge Digits 0 and 9
      if (duration === 1 && (currentDigit === 0 || currentDigit === 9)) {
        return false;
      }
      return true;

    case 'DIFFERS':
      // 1-Tick Filter: Verify selected digit hasn't appeared in last 10 ticks
      const recentDigits = ticks.slice(-10).map(t => t.digit);
      if (recentDigits.includes(currentDigit)) {
        return false;
      }
      return true;

    case 'RISE_FALL':
      // Filter out flat/zero-movement price ticks
      if (Math.abs(currentQuote - prevQuote) === 0) {
        return false;
      }
      return true;

    default:
      return true;
  }
};
