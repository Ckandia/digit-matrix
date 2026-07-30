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
            const activeApi = api_base.api;
            const hasConnection = !!activeApi && activeApi.connection?.readyState === WebSocket.OPEN;

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

        const delay = mode === 'FAST' ? 50 : 300;

        for (let i = 0; i < count; i++) {
            await new Promise<void>((resolve) => {
                setTimeout(async () => {
                    try {
                        // Step 1: Request a proposal (price quote) for this exact contract
                        const proposalReq: any = {
                            proposal: 1,
                            amount: tradeParams.amount,
                            basis: 'stake',
                            contract_type: tradeParams.contract_type,
                            currency: accountInfo.currency || 'USD',
                            duration: tradeParams.duration,
                            duration_unit: 't',
                            symbol: tradeParams.symbol,
                        };

                        if (tradeParams.prediction !== undefined) {
                            proposalReq.barrier = String(tradeParams.prediction);
                        }

                        console.log(`[BulkTrader] Requesting proposal #${i + 1}`, proposalReq);
                        const proposalResponse = await activeApi.send(proposalReq);
                        console.log(`[BulkTrader] Proposal #${i + 1} response:`, proposalResponse);

                        if (proposalResponse?.error) {
                            result.failureCount++;
                            result.errors.push(proposalResponse.error.message || `Proposal ${i + 1} failed`);
                            result.totalProcessed++;
                            resolve();
                            return;
                        }

                        const proposalId = proposalResponse?.proposal?.id;
                        const askPrice = proposalResponse?.proposal?.ask_price;

                        if (!proposalId) {
                            result.failureCount++;
                            result.errors.push(`Proposal ${i + 1} returned no id`);
                            result.totalProcessed++;
                            resolve();
                            return;
                        }

                        // Step 2: Buy using the proposal id
                        const buyReq: any = {
                            buy: proposalId,
                            price: askPrice ?? tradeParams.amount,
                        };

                        if (accountInfo.loginid) {
                            buyReq.passthrough = { loginid: accountInfo.loginid };
                        }

                        console.log(`[BulkTrader] Firing buy #${i + 1}`, buyReq);
                        const buyResponse = await activeApi.send(buyReq);
                        console.log(`[BulkTrader] Buy #${i + 1} response:`, buyResponse);

                        if (buyResponse?.error) {
                            result.failureCount++;
                            result.errors.push(buyResponse.error.message || `Trade ${i + 1} failed`);
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
