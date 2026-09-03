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
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef<number>(0);

  useEffect(() => {
    const checkStatus = () => {
      const hasConnection = !!api_base.api && api_base.api.connection?.readyState === WebSocket.OPEN;
      const authorized = !!api_base.is_authorized;

      setIsConnected(hasConnection);
      setIsAuthorized(authorized);
      setAccountInfo(authorized ? (api_base.account_info as BulkTraderAccountInfo) : null);

      if (!hasConnection && api_base.api) {
        if (!reconnectTimeoutRef.current) {
          const baseDelay = 1000;
          const maxDelay = 30000;
          const delay = Math.min(baseDelay * Math.pow(2, retryCountRef.current), maxDelay);

          console.log(`[BulkTrader] Connection lost. Attempting reconnect in ${delay / 1000}s...`);
          retryCountRef.current += 1;

          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            if (typeof (api_base as any).init === 'function') {
              (api_base as any).init();
            } else if (api_base.api?.connection) {
              api_base.api.init();
            }
          }, delay);
        }
      } else if (hasConnection) {
        retryCountRef.current = 0;
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 500);

    return () => {
      clearInterval(interval);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isConnected || !api_base.api) return;

    if (activeSymbolRef.current && api_base.api) {
      api_base.api.send({
        ticks: activeSymbolRef.current,
        subscribe: 1,
      }).catch((err: any) => {
        console.error('[BulkTrader] Failed to re-subscribe ticks after reconnection:', err);
      });
    }

    const subscription = api_base.api?.onMessage().subscribe(({ data }: any) => {
      if (data?.msg_type === 'tick' && data.tick) {
        if (data.tick.symbol === activeSymbolRef.current) {
          if (data.subscription?.id) {
            subscriptionIdRef.current = data.subscription.id;
          }

          const pipSizes = (api_base as any).pip_sizes as Record<string, number> | undefined;
          const knownDecimals = pipSizes?.[data.tick.symbol];
          const decimalPlaces =
            typeof knownDecimals === 'number'
              ? knownDecimals
              : (() => {
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
            symbol: data.tick.symbol,
          };

          setTickSequence((prev) => [...prev.slice(-49), newTick]);
        }
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [isConnected]);

  const subscribeTicks = useCallback(async (symbol: string) => {
    if (!symbol || !api_base.api) return;
    if (api_base.api.connection?.readyState !== WebSocket.OPEN) {
      console.warn('[BulkTrader] Socket not open, skipping tick subscription');
      return;
    }

    if (subscriptionIdRef.current) {
      try {
        await api_base.api.send({ forget: subscriptionIdRef.current });
      } catch (err) {
        // ignore
      }
      subscriptionIdRef.current = null;
    }

    activeSymbolRef.current = symbol;
    setTickSequence([]);

    try {
      const res: any = await api_base.api.send({
        ticks: symbol,
        subscribe: 1,
      });
      if (res?.subscription?.id) {
        subscriptionIdRef.current = res.subscription.id;
      }
    } catch (err) {
      console.error('Error subscribing to ticks on shared socket:', err);
    }
  }, []);

  const trackContract = useCallback(
    (
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
    },
    [transactions, summary_card, journal]
  );

  const executeBulkTrades = useCallback(
    (
      mode: TradeExecutionMode,
      count: number,
      staticParams: { symbol: string; duration: number },
      getDynamicParams: () => { contract_type: string; prediction?: number; amount: number },
      onTradeResult?: (result: { index: number; success: boolean; error?: string }) => void,
      onContractSettled?: (result: { contract_type: string; profit: number; won: boolean }) => void,
      sequential: boolean = false,
      onBatchComplete?: () => void
    ): (() => void) => {
      if (!api_base.api || !api_base.is_authorized) {
        console.error('[BulkTrader] Cannot trade — not connected/authorized to a Deriv account.');
        onTradeResult?.({ index: -1, success: false, error: 'Not connected to your Deriv account.' });
        return () => {};
      }

      const loginIdAtStart = (api_base.account_info as any)?.loginid;
      const delay = mode === 'FAST' ? 50 : 300;
      let cancelled = false;

      const isFatalAccountError = (error: any): boolean => {
        const text = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
        return (
          text.includes('turnover limit') ||
          text.includes('daily limit') ||
          text.includes('trading limit') ||
          text.includes('insufficient balance') ||
          text.includes('self-exclusion') ||
          text.includes('self exclusion') ||
          text.includes('exceed your')
        );
      };

      const fireOneTrade = async (i: number): Promise<void> => {
        if (cancelled) return;

        const currentLoginId = (api_base.account_info as any)?.loginid;
        if (currentLoginId !== loginIdAtStart) {
          console.warn('[BulkTrader] Skipping trade — active account changed since this run started.');
          onTradeResult?.({ index: i, success: false, error: 'Account changed — trade skipped for safety.' });
          return;
        }

        try {
          const dynamic = getDynamicParams();

          // 1) Request proposal first
          const proposalReq: any = {
            proposal: 1,
            amount: dynamic.amount,
            basis: 'stake',
            contract_type: dynamic.contract_type,
            currency: 'USD',
            duration: staticParams.duration,
            duration_unit: 't',
            symbol: staticParams.symbol,
          };

          if (dynamic.prediction !== undefined) {
            proposalReq.barrier = String(dynamic.prediction);
          }

          const proposalRes: any = await api_base.api.send(proposalReq);
          if (proposalRes?.error) {
            const fatal = isFatalAccountError(proposalRes.error);
            const baseMsg = proposalRes.error.message || `Proposal failed${proposalRes.error.code ? ` (${proposalRes.error.code})` : ''}`;
            onTradeResult?.({ index: i, success: false, error: fatal ? `${baseMsg} — stopping batch` : baseMsg });
            if (fatal) cancelled = true;
            return;
          }

          const proposalId = proposalRes?.proposal?.id;
          const askPrice = proposalRes?.proposal?.ask_price;
          if (!proposalId || askPrice == null) {
            onTradeResult?.({ index: i, success: false, error: 'Invalid proposal response from Deriv' });
            return;
          }

          // 2) Buy using proposal id
          const buyReq = {
            buy: proposalId,
            price: askPrice,
          };

          console.log(`[BulkTrader] Firing trade #${i + 1}`, { proposal_id: proposalId, price: askPrice, contract_type: dynamic.contract_type });
          const response: any = await api_base.api.send(buyReq);
          console.log(`[BulkTrader] Trade #${i + 1} response:`, response);

          if (cancelled) return;

          if (response?.error) {
            const fatal = isFatalAccountError(response.error);
            const baseMsg = response.error.message || `Trade failed${response.error.code ? ` (${response.error.code})` : ''}`;
            const errMsg = fatal ? `${baseMsg} — stopping remaining trades in this batch` : baseMsg;
            onTradeResult?.({ index: i, success: false, error: errMsg });
            if (fatal) cancelled = true;
          } else {
            if (response?.buy?.contract_id) {
              journal.onLogSuccess({
                log_type: LogTypes.PURCHASE,
                extra: { transaction_id: response.buy.transaction_id } as any,
              });

              if (sequential) {
                await new Promise<void>((resolve) => {
                  trackContract(response.buy.contract_id, dynamic.contract_type, (settled) => {
                    onContractSettled?.(settled);
                    resolve();
                  });
                });
              } else {
                trackContract(response.buy.contract_id, dynamic.contract_type, onContractSettled);
              }
            }
            onTradeResult?.({ index: i, success: true });
          }
        } catch (err: any) {
          console.error(`[BulkTrader] Trade #${i + 1} failed:`, err);
          onTradeResult?.({ index: i, success: false, error: err?.message || 'Trade failed (network/unknown error)' });
        }
      };

      const timeoutIds: ReturnType<typeof setTimeout>[] = [];

      if (sequential) {
        (async () => {
          for (let i = 0; i < count; i++) {
            if (cancelled) break;
            await fireOneTrade(i);
            if (cancelled) break;
            if (i < count - 1) {
              await new Promise((resolve) => setTimeout(resolve, delay));
            }
          }
          onBatchComplete?.();
        })();
      } else {
        let completedCount = 0;
        for (let i = 0; i < count; i++) {
          const id = setTimeout(async () => {
            await fireOneTrade(i);
            completedCount += 1;
            if (completedCount === count) onBatchComplete?.();
          }, i * delay);
          timeoutIds.push(id);
        }
      }

      return () => {
        cancelled = true;
        timeoutIds.forEach((id) => clearTimeout(id));
      };
    },
    [trackContract, journal]
  );

  return {
    isConnected,
    isAuthorized,
    accountInfo,
    tickSequence,
    subscribeTicks,
    executeBulkTrades,
  };
};
