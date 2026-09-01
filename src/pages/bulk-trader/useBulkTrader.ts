import { useState, useEffect, useRef, useCallback } from 'react';
import { TickData, TradeExecutionMode, TradeResult } from './types';

export interface AccountInfo {
    loginid: string;
    balance: number;
    currency: string;
}

export const useBulkTrader = () => {
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
    const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
    const [tickSequence, setTickSequence] = useState<TickData[]>([]);

    const wsRef = useRef<WebSocket | null>(null);
    const tickSequenceRef = useRef<TickData[]>([]);
    const subscribedSymbolRef = useRef<string | null>(null);

    const safeSetTicks = useCallback((ticks: TickData[]) => {
        const validTicks = Array.isArray(ticks) ? ticks : [];
        tickSequenceRef.current = validTicks;
        setTickSequence(validTicks);
    }, []);

    // 1. Initialize and maintain persistent WebSocket connection
    useEffect(() => {
        const app_id = 1089; // Default Deriv App ID
        const wsUrl = `wss://ws.derivws.com/websockets/v3?app_id=${app_id}`;

        if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
            return;
        }

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setIsConnected(true);
            
            // Check for existing token or session storage if present
            const token = localStorage.getItem('config.account1') || localStorage.getItem('token');
            if (token) {
                try {
                    const parsed = JSON.parse(token);
                    const authToken = parsed.token || token;
                    ws.send(JSON.stringify({ authorize: authToken }));
                } catch {
                    ws.send(JSON.stringify({ authorize: token }));
                }
            }
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.msg_type === 'authorize') {
                    if (data.authorize) {
                        setIsAuthorized(true);
                        setAccountInfo({
                            loginid: data.authorize.loginid,
                            balance: Number(data.authorize.balance || 0),
                            currency: data.authorize.currency || 'USD',
                        });
                    } else {
                        setIsAuthorized(false);
                    }
                }

                if (data.msg_type === 'history') {
                    const historyPrices = data.history?.prices || [];
                    const historyTimes = data.history?.times || [];
                    
                    const formattedTicks: TickData[] = historyPrices.map((price: number, idx: number) => ({
                        quote: price,
                        epoch: historyTimes[idx] || Date.now(),
                        symbol: data.echo_req?.ticks_history || '',
                    }));

                    safeSetTicks(formattedTicks);
                } else if (data.msg_type === 'tick') {
                    const newTick: TickData = {
                        quote: data.tick?.quote,
                        epoch: data.tick?.epoch,
                        symbol: data.tick?.symbol,
                    };

                    if (newTick.quote !== undefined) {
                        const currentTicks = tickSequenceRef.current || [];
                        const updated = [...currentTicks.slice(-49), newTick];
                        safeSetTicks(updated);
                    }
                }
            } catch (err) {
                console.error('[DerivAPI] Parse Error:', err);
            }
        };

        ws.onerror = (error) => {
            console.error('[DerivAPI] WebSocket Error:', error);
        };

        ws.onclose = () => {
            setIsConnected(false);
            setIsAuthorized(false);
            wsRef.current = null;
        };

        return () => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [safeSetTicks]);

    // 2. Safe symbol subscription
    const subscribeTicks = useCallback((symbol: string) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        if (subscribedSymbolRef.current === symbol) return;

        // Forget previous tick stream if subscribed
        if (subscribedSymbolRef.current) {
            wsRef.current.send(JSON.stringify({ forget_all: 'ticks' }));
        }

        subscribedSymbolRef.current = symbol;
        safeSetTicks([]);

        wsRef.current.send(
            JSON.stringify({
                ticks_history: symbol,
                adjust_start_time: 1,
                count: 50,
                end: 'latest',
                style: 'ticks',
                subscribe: 1,
            })
        );
    }, [safeSetTicks]);

    // 3. Trade execution handler
    const executeBulkTrades = useCallback(
        (
            mode: TradeExecutionMode,
            count: number,
            params: { symbol: string; duration: number },
            getDynamicParams: () => { contract_type: string; prediction?: number; amount: number },
            onTradeComplete: (result: { success: boolean; error?: string }) => void,
            onTradeSettled: (settled: TradeResult) => void,
            isSequential: boolean,
            onAllFinished: () => void
        ) => {
            let isCancelled = false;

            const executeSingle = async () => {
                if (isCancelled || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

                const dynamic = getDynamicParams();
                const proposalReq = {
                    proposal: 1,
                    amount: dynamic.amount,
                    basis: 'stake',
                    currency: accountInfo?.currency || 'USD',
                    symbol: params.symbol,
                    duration: params.duration,
                    duration_unit: 't',
                    contract_type: dynamic.contract_type,
                    barrier: dynamic.prediction !== undefined ? `${dynamic.prediction}` : undefined,
                };

                wsRef.current.send(JSON.stringify(proposalReq));
                onTradeComplete({ success: true });
            };

            if (isSequential) {
                executeSingle();
            } else {
                for (let i = 0; i < count; i++) {
                    executeSingle();
                }
            }

            return () => {
                isCancelled = true;
                onAllFinished();
            };
        },
        [accountInfo?.currency]
    );

    return {
        isConnected,
        isAuthorized,
        accountInfo,
        tickSequence: tickSequence || [],
        subscribeTicks,
        executeBulkTrades,
    };
};
