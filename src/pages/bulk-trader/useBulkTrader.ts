import { useRef, useCallback } from 'react';
import { shouldExecuteTrade, ManualTradeConfig, TickItem } from './signal';

export const useBulkTrader = (ws: WebSocket | null, isTradingActive: boolean) => {
  const ticksRef = useRef<TickItem[]>([]);
  const isExecutingRef = useRef<boolean>(false);

  const handleIncomingTick = useCallback((tickData: { quote: number; symbol: string }, config: ManualTradeConfig) => {
    if (!isTradingActive || !ws || ws.readyState !== WebSocket.OPEN) return;

    // GUARD: ensure tickData and quote exist before parsing
    if (!tickData || typeof tickData.quote !== 'number') return;

    const quoteStr = tickData.quote.toString();
    const lastDigit = parseInt(quoteStr.slice(-1), 10);
    const newTick: TickItem = { quote: tickData.quote, digit: lastDigit };

    // FIX: guard .slice() — ensure ticksRef.current is always treated as array
    const currentTicks = Array.isArray(ticksRef.current) ? ticksRef.current : [];
    ticksRef.current = [...currentTicks.slice(-49), newTick];

    if (isExecutingRef.current) return;

    // FIX: pass guarded copy to signal engine
    const tickSnapshot = Array.isArray(ticksRef.current) ? ticksRef.current : [];
    const validation = shouldExecuteTrade(config, tickSnapshot);

    if (validation.allowed) {
      isExecutingRef.current = true;

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

      setTimeout(() => {
        isExecutingRef.current = false;
      }, 1500);
    }
  }, [ws, isTradingActive]);

  return { handleIncomingTick };
};
