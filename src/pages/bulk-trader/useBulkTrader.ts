import { useState, useEffect, useRef, useCallback } from 'react';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { LogTypes } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import { TickData, TradeExecutionMode } from './types';

export interface BulkTraderAccountInfo {
    loginid?: string;
    currency?: string;
    balance?: number;
}

export const useBulkTrader = () => {
    const { transactions, journal, summary_card } = useStore();
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

    // After a successful buy, subscribe to proposal_open_contract for that
    // specific contract and push every update straight into the Transactions
    // and Summary stores, and log Sell/Profit/Loss entries into the Journal —
    // the same store methods and LogTypes the bot engine's own OpenContract/
    // Sell/Total trackers use (see external/bot-skeleton/.../trade/OpenContract.js,
    // Sell.js, Total.js). Purchase.js's LogTypes.PURCHASE entry is logged separately
    // right after the buy succeeds, in executeBulkTrades below.
    //
    // IMPORTANT: we call these store methods directly rather than going through the
    // 'bot.contract' / 'ui.log.success' global observer events. Those are only wired
    // up inside run_panel_store.onRunButtonClick() / onMount() in ways tied to the
    // Bot Builder's own run lifecycle, so relying on them would be fragile for trades
    // fired from the Bulk Trader. Calling the store methods directly sidesteps that
    // registration lifecycle entirely and still reuses the exact same Transactions/
    // Summary/Journal panels — no duplicate history system.
    //
    // Note on Summary specifically: it's designed to show one "currently live"
    // contract at a time (mirroring a single bot run). With Bulk Trader firing many
    // contracts in parallel, Summary will jump between whichever contract most
    // recently updated rather than showing all of them — that's an inherent
    // limitation of reusing a single-contract view for multi-contract trading, not a
    // bug. Transactions (the full list) is where all the trades are visible.
    const trackContract = useCallback((
        contractId: number,
        contractType: string,
        onSettled?: (result: { contract_type: string; profit: number; won: boolean }) => void
    ) => {
        if (!api_base.api) return;

        const sub = api_base.api.onMessage().subscribe(({ data }: any) => {
            if (data?.msg_type === 'proposal_open_contract' && data.proposal_open_contract?.contract_id === contractId) {
                const contract = data.proposal_open_contract;
                const accountID = (api_base.account_info as any)?.loginid;

                transactions.onBotContractEvent({ accountID, ...contract });
                summary_card.onBotContractEvent({ accountID, ...contract });

                // Contract finished (sold or expired) — log the same Sell + Profit/Loss
                // journal entries the bot engine logs on settlement, then stop listening.
                if (contract.is_sold || contract.status !== 'open') {
                    journal.onLogSuccess({
                        log_type: LogTypes.SELL,
                        extra: { sold_for: contract.sell_price } as any,
                    });

                    const profit = Number(contract.profit);
                    journal.onLogSuccess({
                        log_type: profit > 0 ? LogTypes.PROFIT : LogTypes.LOST,
                        extra: { currency: contract.currency, profit },
                    });

                    onSettled?.({ contract_type: contractType, profit, won: profit > 0 });

                    sub.unsubscribe();
                }
            }
        });

        api_base.pushSubscription?.(sub as any);

        (api_base.api
            .send({
                proposal_open_contract: 1,
                contract_id: contractId,
                subscribe: 1,
            }) as any as Promise<any>
        ).catch((err: any) => {
            console.error('[BulkTrader] Failed to subscribe to contract updates:', err);
        });
    }, [transactions, summary_card, journal]);

    const executeBulkTrades = useCallback((
        mode: TradeExecutionMode, 
        count: number, 
        tradeParams: any,
        onTradeResult?: (result: { index: number; success: boolean; error?: string }) => void,
        onContractSettled?: (result: { contract_type: string; profit: number; won: boolean }) => void
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
                        if (response?.buy?.contract_id) {
                            journal.onLogSuccess({
                                log_type: LogTypes.PURCHASE,
                                extra: { transaction_id: response.buy.transaction_id } as any,
                            });
                            trackContract(response.buy.contract_id, tradeParams.contract_type, onContractSettled);
                        }
                        onTradeResult?.({ index: i, success: true });
                    }
                } catch (err: any) {
                    console.error(`[BulkTrader] Trade #${i + 1} failed:`, err);
                    onTradeResult?.({ index: i, success: false, error: err?.message || 'Trade failed' });
                }
            }, i * delay);
        }
    }, [trackContract, journal]);

    return {
        isConnected,
        isAuthorized,
        accountInfo,
        tickSequence,
        subscribeTicks,
        executeBulkTrades
    };
};
