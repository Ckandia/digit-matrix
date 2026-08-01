import { useState, useEffect, useRef, useCallback } from 'react';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { TickData, TradeExecutionMode } from './types';

export interface BulkTraderAccountInfo {
    loginid?: string;
    currency?: string;
    balance?: number;
}

export const useBulkTrader = () => {
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
    const [accountInfo, setAccountInfo] = useState<BulkTraderAccountInfo | null>(null);
    const [tickSequence, setTickSequence] = useState<TickData[]>([]);
    
    const activeSymbolRef = useRef<string>('1HZ10V');
    const subscriptionIdRef = useRef<string | null>(null);

    useEffect(() => {
        const checkStatus = () => {
            const hasConnection = !!api_base.api && api_base.api.connection?.readyState === WebSocket.OPEN;

            // api_base.is_authorized is the single source of truth the rest of the app
            // (dashboard, bot-builder) relies on once the OAuth/token authorize call succeeds.
            const authorized = !!api_base.is_authorized;

            setIsConnected(hasConnection);
            setIsAuthorized(authorized);
            setAccountInfo(authorized ? (api_base.account_info as BulkTraderAccountInfo) : null);
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

                    // Each market has its own decimal precision (pip_size) — e.g. Vol 10
                    // quotes 3 decimals, Vol 100 quotes 2, Step Index quotes 1. Using
                    // quote.toString() directly is unreliable because JS drops trailing
                    // zeros (1.10000 -> "1.1"), silently corrupting the last digit.
                    // api_base.pip_sizes (populated from active_symbols) gives the real
                    // decimal count per symbol; toFixed() to that count is the correct way
                    // to reconstruct the digit exactly as Deriv's own digit contracts see it.
                    const pipSizes = (api_base as any).pip_sizes as Record<string, number> | undefined;
                    const knownDecimals = pipSizes?.[data.tick.symbol];
                    const decimalPlaces =
                        typeof knownDecimals === 'number'
                            ? knownDecimals
                            : (() => {
                                  // Fallback while active_symbols hasn't loaded yet — infer
                                  // from the raw quote's own string. Can undercount if
                                  // trailing zeros were already dropped, but only applies
                                  // for the brief window before pip_sizes is populated.
                                  const str = data.tick.quote.toString();
                                  const dot = str.indexOf('.');
                                  return dot === -1 ? 0 : str.length - dot - 1;
                              })();

                    const formattedQuote = Number(data.tick.quote).toFixed(decimalPlaces);
                    const lastDigit = parseInt(formattedQuote.slice(-1), 10);
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
        tradeParams: any,
        onTradeResult?: (result: { index: number; success: boolean; error?: string }) => void
    ) => {
        if (!api_base.api || !api_base.is_authorized) {
            console.error('[BulkTrader] Cannot trade — not connected/authorized to a Deriv account.');
            onTradeResult?.({ index: -1, success: false, error: 'Not connected to your Deriv account.' });
            return;
        }

        const delay = mode === 'FAST' ? 50 : 300;

        for (let i = 0; i < count; i++) {
            setTimeout(async () => {
                try {
                    // Deriv direct proposal + buy request payload.
                    // IMPORTANT: the API expects "underlying_symbol" in parameters, not
                    // "symbol" — using the wrong key here causes every buy to be silently
                    // rejected (confirmed against the working Purchase.js -> tradeOptionToBuy
                    // helper used by the rest of this app).
                    const req: any = {
                        buy: '1',
                        price: tradeParams.amount,
                        parameters: {
                            amount: tradeParams.amount,
                            basis: 'stake',
                            contract_type: tradeParams.contract_type,
                            currency: 'USD',
                            duration: tradeParams.duration,
                            duration_unit: 't',
                            underlying_symbol: tradeParams.symbol,
                        }
                    };

                    if (tradeParams.prediction !== undefined) {
                        req.parameters.barrier = String(tradeParams.prediction);
                    }

                    console.log(`[BulkTrader] Firing trade #${i + 1}`, req);
                    const response: any = await api_base.api.send(req);
                    console.log(`[BulkTrader] Trade #${i + 1} response:`, response);

                    if (response?.error) {
                        onTradeResult?.({ index: i, success: false, error: response.error.message || 'Trade failed' });
                    } else {
                        onTradeResult?.({ index: i, success: true });
                    }
                } catch (err: any) {
                    console.error(`[BulkTrader] Trade #${i + 1} failed:`, err);
                    onTradeResult?.({ index: i, success: false, error: err?.message || 'Trade failed' });
                }
            }, i * delay);
        }
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
