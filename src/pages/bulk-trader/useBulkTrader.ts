import { useState, useEffect, useRef, useCallback } from 'react';
import { TickData, TradeExecutionMode } from './types';

export const useBulkTrader = (token: string | null) => {
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [tickSequence, setTickSequence] = useState<TickData[]>([]);
    const wsRef = useRef<WebSocket | null>(null);
    const activeSymbolRef = useRef<string>('1HZ10V');

    useEffect(() => {
        // Deriv App ID 1089 or standard default
        const app_id = localStorage.getItem('config.app_id') || '1089';
        const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${app_id}`);
        wsRef.current = ws;

        ws.onopen = () => {
            setIsConnected(true);
            // 1. Authorize session if token exists
            if (token) {
                ws.send(JSON.stringify({ authorize: token }));
            }
            // 2. Immediately subscribe to ticks (public stream works even before auth response)
            ws.send(JSON.stringify({
                ticks: activeSymbolRef.current,
                subscribe: 1
            }));
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                // Handle Tick Stream Data
                if (data.msg_type === 'tick' && data.tick) {
                    const priceStr = data.tick.quote.toString();
                    const lastDigit = parseInt(priceStr.slice(-1), 10);
                    const isEven = lastDigit % 2 === 0;

                    const newTick: TickData = {
                        epoch: data.tick.epoch,
                        quote: data.tick.quote,
                        digit: lastDigit,
                        type: isEven ? 'E' : 'O',
                    };

                    setTickSequence((prev) => [...prev.slice(-49), newTick]);
                }
            } catch (err) {
                console.error('Error parsing WebSocket message:', err);
            }
        };

        ws.onerror = (err) => {
            console.error('WebSocket error:', err);
            setIsConnected(false);
        };

        ws.onclose = () => {
            setIsConnected(false);
        };

        return () => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        };
    }, [token]);

    // Resubscribe when market changes
    const subscribeTicks = useCallback((symbol: string) => {
        if (!symbol || symbol === activeSymbolRef.current) return;
        activeSymbolRef.current = symbol;

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            // Forget previous ticks stream then subscribe to new symbol
            wsRef.current.send(JSON.stringify({ forget_all: 'ticks' }));
            wsRef.current.send(JSON.stringify({
                ticks: symbol,
                subscribe: 1
            }));
            setTickSequence([]);
        }
    }, []);

    // Execute Bulk Trades Batch
    const executeBulkTrades = useCallback((
        mode: TradeExecutionMode, 
        count: number, 
        tradeParams: any
    ) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            console.error('WebSocket connection is not active.');
            return;
        }

        const delay = mode === 'FAST' ? 50 : 300;

        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({
                        buy: 1,
                        price: tradeParams.amount,
                        parameters: {
                            amount: tradeParams.amount,
                            basis: 'stake',
                            contract_type: tradeParams.contract_type,
                            currency: 'USD',
                            duration: tradeParams.duration,
                            duration_unit: 't',
                            symbol: tradeParams.symbol,
                            ...(tradeParams.prediction !== undefined ? { barrier: String(tradeParams.prediction) } : {})
                        }
                    }));
                }
            }, i * delay);
        }
    }, []);

    return {
        isConnected,
        tickSequence,
        subscribeTicks,
        executeBulkTrades
    };
};
