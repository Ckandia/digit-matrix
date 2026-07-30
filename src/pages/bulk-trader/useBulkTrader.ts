import { useState, useEffect, useRef, useCallback } from 'react';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { TickData, TradeExecutionMode, AccountInfo, BulkExecutionResult } from './types';

export const useBulkTrader = () => {
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
    const [accountInfo, setAccountInfo] = useState<AccountInfo>({});
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

            if (api_base.account_info) {
                setAccountInfo({
                    loginid: api_base.account_info.loginid || localStorage.getItem('active_loginid') || undefined,
                    balance: api_base.account_info.balance,
                    currency: api_base.account_info.currency || 'USD',
                    is_authorized: hasConnection && hasToken,
                });
            }
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

    const executeBulkTrades = useCallback(async (
        mode: TradeExecutionMode, 
        count: number, 
        tradeParams: any
    ): Promise<BulkExecutionResult> => {
        const result: BulkExecutionResult = {
            successCount: 0,
            failureCount: 0,
            totalProcessed: 0,
            errors: [],
        };

        if (!api_base.api) {
            result.errors.push('API connection not available.');
            return result;
        }

        const delay = mode === 'FAST' ? 50 : 300;

        for (let i = 0; i < count; i++) {
            await new Promise<void>((resolve) => {
                setTimeout(async () => {
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
                            },
                        };

                        if (tradeParams.prediction !== undefined) {
                            req.parameters.barrier = String(tradeParams.prediction);
                        }

                        console.log(`[BulkTrader] Firing trade #${i + 1}`, req);
                        const response = await api_base.api.send(req);
                        console.log(`[BulkTrader] Trade #${i + 1} response:`, response);

                        if (response?.error) {
                            result.failureCount++;
                            result.errors.push(response.error.message || `Trade ${i + 1} failed`);
                        } else {
                            result.successCount++;
                        }
                    } catch (err: any) {
                        console.error(`[BulkTrader] Trade #${i + 1} failed:`, err);
                        result.failureCount++;
                        result.errors.push(err?.message || `Trade ${i + 1} execution error`);
                    }
                    result.totalProcessed++;
                    resolve();
                }, i * delay);
            });
        }

        return result;
    }, []);

    return {
        isConnected,
        isAuthorized,
        accountInfo,
        tickSequence,
        subscribeTicks,
        executeBulkTrades
    };
};
