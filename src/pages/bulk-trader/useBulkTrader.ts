import { useState, useEffect, useRef, useCallback } from 'react';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { TickData, TradeExecutionMode } from './types';

export interface TradeResult {
    index: number;
    status: 'pending' | 'success' | 'error';
    message: string;
}

export const useBulkTrader = () => {
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
    const [tickSequence, setTickSequence] = useState<TickData[]>([]);
    
    const activeSymbolRef = useRef<string>('1HZ10V');
    const subscriptionIdRef = useRef<string | null>(null);

    useEffect(() => {
        const checkStatus = () => {
            const hasConnection = !!api_base.api && api_base.api.connection?.readyState === WebSocket.OPEN;
            
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
                // Ignore cleanup error if stream was already closed
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
        tradeParams: any,
        onResult?: (result: TradeResult) => void
    ) => {
        if (!api_base.api) {
            onResult?.({ index: -1, status: 'error', message: 'No API connection available.' });
            return;
        }

        const delay = mode === 'FAST' ? 50 : 300;

        for (let i = 0; i < count; i++) {
            setTimeout(async () => {
                onResult?.({ index: i, status: 'pending', message: 'Sending...' });

                try {
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

                    const response = await api_base.api.send(req);

                    if (response?.error) {
                        onResult?.({
                            index: i,
                            status: 'error',
                            message: response.error.message || 'Trade rejected by Deriv.',
                        });
                    } else {
                        onResult?.({
                            index: i,
                            status: 'success',
                            message: `Contract ${response?.buy?.contract_id ?? ''} bought`,
                        });
                    }
                } catch (err: any) {
                    onResult?.({
                        index: i,
                        status: 'error',
                        message: err?.message || 'Request failed.',
                    });
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
