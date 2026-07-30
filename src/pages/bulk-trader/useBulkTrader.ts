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
    const isAuthorizedRef = useRef<boolean>(false);

    useEffect(() => {
        let subscription: any;
        let bindInterval: ReturnType<typeof setInterval> | null = null;
        let authAttempted = false;

        const handleMessage = ({ data }: any) => {
            if (!data) return;

            if (data.msg_type === 'tick' && data.tick) {
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

            if (data.msg_type === 'authorize') {
                if (!data.error) {
                    isAuthorizedRef.current = true;
                    setIsAuthorized(true);
                    if (data.authorize) {
                        setAccountInfo({
                            loginid: data.authorize.loginid,
                            balance: data.authorize.balance,
                            currency: data.authorize.currency,
                            is_authorized: true,
                        });
                    }
                } else {
                    isAuthorizedRef.current = false;
                    setIsAuthorized(false);
                }
            }
        };

        const initSocketAndAuth = async () => {
            const activeApi = api_base.api;
            if (!activeApi) return;

            const wsReady = activeApi.connection?.readyState === WebSocket.OPEN;
            setIsConnected(wsReady);

            if (wsReady && !authAttempted) {
                authAttempted = true;
                try {
                    const activeLoginid = localStorage.getItem('active_loginid');
                    let token = api_base.token;

                    if (!token && activeLoginid) {
                        const clientAccountsStr = localStorage.getItem('client.accounts');
                        if (clientAccountsStr) {
                            const accounts = JSON.parse(clientAccountsStr);
                            token = accounts[activeLoginid]?.token;
                        }
                    }

                    if (token) {
                        await activeApi.send({ authorize: token });
                    }
                } catch (err) {
                    console.error('BulkTrader authorization error:', err);
                }
            }
        };

        const tryBindAndAuth = () => {
            const activeApi = api_base.api;
            if (!activeApi) return false;

            subscription = activeApi.onMessage().subscribe(handleMessage);
            initSocketAndAuth();
            return true;
        };

        if (!tryBindAndAuth()) {
            bindInterval = setInterval(() => {
                if (tryBindAndAuth() && bindInterval) {
                    clearInterval(bindInterval);
                    bindInterval = null;
                }
            }, 300);
        }

        const statusInterval = setInterval(() => {
            const activeApi = api_base.api;
            const wsReady = !!activeApi && activeApi.connection?.readyState === WebSocket.OPEN;
            setIsConnected(wsReady);
            if (wsReady && !isAuthorizedRef.current && !authAttempted) {
                initSocketAndAuth();
            }
        }, 1000);

        return () => {
            clearInterval(statusInterval);
            if (bindInterval) clearInterval(bindInterval);
            subscription?.unsubscribe();
        };
    }, []);

    const subscribeTicks = useCallback(async (symbol: string) => {
        const activeApi = api_base.api;
        if (!symbol || !activeApi) return;

        if (subscriptionIdRef.current) {
            try {
                await activeApi.send({ forget: subscriptionIdRef.current });
            } catch (err) {
                // Ignore cleanup error if already forgotten
            }
            subscriptionIdRef.current = null;
        }

        activeSymbolRef.current = symbol;
        setTickSequence([]);

        try {
            await activeApi.send({
                ticks: symbol,
                subscribe: 1
            });
        } catch (err) {
            console.error('Error subscribing to ticks on main shared socket:', err);
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

        const activeApi = api_base.api;
        if (!activeApi) {
            result.errors.push('Main API connection not available.');
            return result;
        }

        if (!isAuthorizedRef.current) {
            result.errors.push('Not authorized on the main account — cannot place trades.');
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
                                currency: accountInfo.currency || 'USD',
                                duration: tradeParams.duration,
                                duration_unit: 't',
                                symbol: tradeParams.symbol,
                            },
                        };

                        if (tradeParams.prediction !== undefined) {
                            req.parameters.barrier = String(tradeParams.prediction);
                        }

                        const response = await activeApi.send(req);

                        if (response?.error) {
                            result.failureCount++;
                            result.errors.push(response.error.message || `Trade ${i + 1} failed`);
                        } else {
                            result.successCount++;
                        }
                    } catch (err: any) {
                        result.failureCount++;
                        result.errors.push(err?.message || `Trade ${i + 1} execution error`);
                    }
                    result.totalProcessed++;
                    resolve();
                }, i * delay);
            });
        }

        return result;
    }, [accountInfo]);

    return {
        isConnected,
        isAuthorized,
        accountInfo,
        tickSequence,
        subscribeTicks,
        executeBulkTrades
    };
};
