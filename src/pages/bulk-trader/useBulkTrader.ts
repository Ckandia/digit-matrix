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
        const checkStatus = () => {
            const hasConnection = !!api_base.api && api_base.api.connection?.readyState === WebSocket.OPEN;
            
            // Check multiple places for authorized status
            const hasToken = !!(
                api_base.token || 
                api_base.account_info?.token || 
                localStorage.getItem('client.accounts') ||
                localStorage.getItem('active_loginid')
            );

            setIsConnected(hasConnection);
            setIsAuthorized(hasConnection && hasToken);
        };

        checkStatus();
        const interval = setInterval(checkStatus, 500);

        // Listen for incoming ticks
        const subscription = api_base.api?.onMessage().subscribe(({ data }: any) => {
            if (data?.msg_type === 'tick' && data.tick) {
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

    const subscribeTicks = useCallback(async (symbol: string) => {
        if (!symbol || !api_base.api) return;
        
        if (subscriptionIdRef.current) {
            try {
                await api_base.api.send({ forget: subscriptionIdRef.current });
            } catch (err) {
                // Ignore cleanup error if already forgotten
            }
            subscriptionIdRef.current = null;
        }

        activeSymbolRef.current = symbol;
        setTickSequence([]);

        try {
            await api_base.api.send({
                ticks: symbol,
                subscribe: 1
            });
        } catch (err) {
            console.error('Error subscribing to ticks on shared socket:', err);
        }
    }, []);

    const executeBulkTrades = useCallback((
        mode: TradeExecutionMode, 
        count: number, 
        tradeParams: any
    ) => {
        if (!api_base.api) {
            console.error('API connection not available.');
            return;
        }

        const delay = mode === 'FAST' ? 50 : 300;

        for (let i = 0; i < count; i++) {
            setTimeout(async () => {
                try {
                    // Deriv direct proposal + buy request payload
                    const req: any = {
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
                        }
                    };

                    if (tradeParams.prediction !== undefined) {
                        req.parameters.barrier = String(tradeParams.prediction);
                    }

                    console.log(`[BulkTrader] Firing trade #${i + 1}`, req);
                    const response = await api_base.api.send(req);
                    console.log(`[BulkTrader] Trade #${i + 1} response:`, response);
                } catch (err) {
                    console.error(`[BulkTrader] Trade #${i + 1} failed:`, err);
                }
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
