import { useState, useEffect, useRef, useCallback } from 'react';
import { TickData, TradeExecutionMode, TradePayload } from './types';

export const useBulkTrader = (token: string | null) => {
    const ws = useRef<WebSocket | null>(null);
    const activeSubId = useRef<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [tickSequence, setTickSequence] = useState<TickData[]>([]);
    
    // Persistent rolling buffer maintained across resets
    const MAX_BUFFER = 100;

    useEffect(() => {
        if (!token) return;

        const appId = process.env.NEXT_PUBLIC_DERIV_APP_ID || '1089';
        ws.current = new WebSocket(`wss://ws.binaryws.com/websockets/v3?app_id=${appId}`);

        ws.current.onopen = () => {
            ws.current?.send(JSON.stringify({ authorize: token }));
        };

        ws.current.onmessage = (msg) => {
            const data = JSON.parse(msg.data);

            if (data.error) {
                console.error('WebSocket Error:', data.error.message);
                return;
            }

            if (data.msg_type === 'authorize') {
                setIsConnected(true);
            }

            if (data.msg_type === 'tick' && data.tick) {
                if (data.subscription?.id) {
                    activeSubId.current = data.subscription.id;
                }
                const quote = data.tick.quote;
                const quoteStr = quote.toFixed(data.tick.pip_size || 2);
                const digit = parseInt(quoteStr.slice(-1), 10);
                const epoch = data.tick.epoch;

                setTickSequence(prev => {
                    const newTick: TickData = {
                        epoch,
                        quote,
                        digit,
                        type: digit % 2 === 0 ? 'E' : 'O',
                    };
                    const updated = [...prev, newTick];
                    return updated.length > MAX_BUFFER ? updated.slice(-MAX_BUFFER) : updated;
                });
            }

            if (data.msg_type === 'proposal') {
                const proposalId = data.proposal?.id;
                if (proposalId) {
                    ws.current?.send(JSON.stringify({ buy: proposalId, price: data.proposal.ask_price }));
                }
            }
        };

        return () => {
            if (activeSubId.current) {
                ws.current?.send(JSON.stringify({ forget: activeSubId.current }));
            }
            ws.current?.close();
        };
    }, [token]);

    const subscribeTicks = useCallback((symbol: string) => {
        if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
        
        if (activeSubId.current) {
            ws.current.send(JSON.stringify({ forget: activeSubId.current }));
            activeSubId.current = null;
        }

        ws.current.send(JSON.stringify({ ticks: symbol }));
    }, []);

    const executeBulkTrades = useCallback(
        (mode: TradeExecutionMode, count: number, payload: TradePayload) => {
            if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;

            const delay = mode === 'FAST' ? 100 : 1200;

            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    const req: Record<string, any> = {
                        proposal: 1,
                        amount: payload.amount,
                        basis: 'stake',
                        contract_type: payload.contract_type,
                        currency: 'USD',
                        duration: payload.duration,
                        duration_unit: 't',
                        symbol: payload.symbol,
                    };

                    if (payload.prediction !== undefined) {
                        req.barrier = payload.prediction.toString();
                    }

                    ws.current?.send(JSON.stringify(req));
                }, i * delay);
            }
        },
        []
    );

    return { isConnected, tickSequence, subscribeTicks, executeBulkTrades };
};
