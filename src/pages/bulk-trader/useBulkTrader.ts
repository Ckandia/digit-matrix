import { useState, useEffect, useRef, useCallback } from 'react';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { TickData, TradeExecutionMode } from './types';

export const useBulkTrader = () => {
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
    const [tickSequence, setTickSequence] = useState<TickData[]>([]);
    
    const activeSymbolRef = useRef<string>('1HZ10V');
    const subscriptionIdRef = useRef<string | null>(null);

    useEffect(() => {
        // Monitor connection status from shared API instance
        const checkStatus = () => {
            const hasConnection = !!api_base.api && api_base.api.connection?.readyState === WebSocket.OPEN;
            setIsConnected(hasConnection);
            setIsAuthorized(!!api_base.token);
        };

        checkStatus();
        const interval = setInterval(checkStatus, 1000);

        // Listen for incoming ticks on the shared stream
        const subscription = api_base.api?.onMessage().subscribe(({ data }: any) => {
            if (data?.msg_type === 'tick' && data.tick) {
                // Ensure tick matches active symbol
                if (data.tick.symbol === activeSymbolRef.current) {
                    if (data.subscription?.id) {
                        subscriptionIdRef.current = data.subscription.id;
                    }

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
            }
        });

        return () => {
            clearInterval(interval);
            subscription?.unsubscribe();
        };
    }, []);

    // Subscribe to tick stream without disrupting other tabs
    const subscribeTicks = useCallback(async (symbol: string) => {
        if (!symbol || !api_base.api) return;
        
        // Forget previous bulk-trader subscription if active
        if (subscriptionIdRef.current) {
            try {
                await api_base.api.send({ forget: subscriptionIdRef.current });
            } catch (err) {
                console.warn('Failed to forget old tick stream ID:', err);
            }
            subscriptionIdRef.current = null;
        }

        activeSymbolRef.current = symbol;
        setTickSequence([]);

        // Request specific tick stream
        try {
            await api_base.api.send({
                ticks: symbol,
                subscribe: 1
            });
        } catch (err) {
            console.error('Error subscribing to ticks on shared socket:', err);
        }
    }, []);

    // Execute bulk trade batch via shared socket
    const executeBulkTrades = useCallback((
        mode: TradeExecutionMode, 
        count: number, 
        tradeParams: any
    ) => {
        if (!api_base.api) {
            console.error('Shared API instance not ready.');
            return;
        }

        const delay = mode === 'FAST' ? 50 : 300;

        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                api_base.api.send({
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
                }).catch((err: any) => {
                    console.error(`Bulk trade execution error (Trade #${i + 1}):`, err);
                });
            }, i * delay);
        }
    }, []);

    return {
        isConnected,
        isAuthorized,
        tickSequence,
        subscribeTicks,
        executeBulkTrades
    };
};
