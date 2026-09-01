// useBulkTrader.ts
import { useRef, useCallback } from 'react';
import { shouldExecuteTrade, ManualTradeConfig, TickItem } from './signal';

export const useBulkTrader = (ws: WebSocket | null, isTradingActive: boolean) => {
  const ticksRef = useRef<TickItem[]>([]);
  const isExecutingRef = useRef<boolean>(false);

  // Called directly on every incoming WebSocket message
  const handleIncomingTick = useCallback((tickData: { quote: number; symbol: string }, config: ManualTradeConfig) => {
    if (!isTradingActive || !ws || ws.readyState !== WebSocket.OPEN) return;

    // 1. Parse Last Digit
    const quoteStr = tickData.quote.toString();
    const lastDigit = parseInt(quoteStr.slice(-1), 10);
    const newTick: TickItem = { quote: tickData.quote, digit: lastDigit };

    // 2. Append to internal tick array
    ticksRef.current = [...ticksRef.current.slice(-49), newTick];

    // Prevent duplicate simultaneous trades
    if (isExecutingRef.current) return;

    // 3. Check Manual Config against Strict Rules
    const validation = shouldExecuteTrade(config, ticksRef.current);

    if (validation.allowed) {
      isExecutingRef.current = true;

      // 4. Send Instant Purchase Payload directly over WebSocket
      const proposalReq = {
        buy: 1,
        price: config.stake,
        parameters: {
          amount: config.stake,
          basis: 'stake',
          contract_type: config.contractType,
          currency: 'USD',
          duration: config.duration,
          duration_unit: 't',
          symbol: tickData.symbol,
          ...(config.targetDigit !== undefined && { barrier: config.targetDigit.toString() })
        }
      };

      ws.send(JSON.stringify(proposalReq));

      // Reset execution lock after 1.5 seconds to prevent spamming
      setTimeout(() => {
        isExecutingRef.current = false;
      }, 1500);
    }
  }, [ws, isTradingActive]);

  return { handleIncomingTick };
};
