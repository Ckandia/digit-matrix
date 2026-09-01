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

    // Always keep ref and state in sync and fallback to []
    const safeSetTicks = useCallback((ticks: TickData[]) => {
        const validTicks = Array.isArray(ticks) ? ticks : [];
        tickSequenceRef.current = validTicks;
        setTickSequence(validTicks);
    }, []);

    const subscribeTicks = useCallback((symbol: string) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        // Reset ticks safely on symbol change
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

    const handleMessage = useCallback((event: MessageEvent) => {
        try {
            const data = JSON.parse(event.data);

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
            } else if (data.msg_type === 'authorize') {
                if (data.authorize) {
                    setIsAuthorized(true);
                    setAccountInfo({
                        loginid: data.authorize.loginid,
                        balance: Number(data.authorize.balance || 0),
                        currency: data.authorize.currency || 'USD',
                    });
                }
            }
        } catch (err) {
            console.error('[DerivAPI] Error parsing WebSocket message:', err);
        }
    }, [safeSetTicks]);

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
                if (isCancelled) return;
                const dynamic = getDynamicParams();
                
                // Example simulation / execution call payload
                onTradeComplete({ success: true });
            };

            if (isSequential) {
                // Handle sequential execution logic
                executeSingle();
            } else {
                // Burst execution logic
                for (let i = 0; i < count; i++) {
                    executeSingle();
                }
            }

            return () => {
                isCancelled = true;
                onAllFinished();
            };
        },
        []
    );

    return {
        isConnected,
        isAuthorized,
        accountInfo,
        tickSequence: tickSequence || [], // Defensive fallback guarantee
        subscribeTicks,
        executeBulkTrades,
    };
};
