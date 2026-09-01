import { useState, useEffect, useRef, useCallback } from 'react';
import { TickData, TradeExecutionMode, TradeResult } from './types';

export interface AccountInfo {
    loginid: string;
    balance: number;
    currency: string;
}

// Helper to convert human UI names to Deriv API symbol codes
const getDerivSymbol = (sym: string) => {
    if (sym.includes('Vol 10 (1s)')) return '1HZ10V';
    if (sym.includes('Vol 10') && !sym.includes('1s')) return 'R_10';
    if (sym.includes('Vol 25 (1s)')) return '1HZ25V';
    if (sym.includes('Vol 25') && !sym.includes('1s')) return 'R_25';
    if (sym.includes('Vol 50 (1s)')) return '1HZ50V';
    if (sym.includes('Vol 50') && !sym.includes('1s')) return 'R_50';
    if (sym.includes('Vol 75 (1s)')) return '1HZ75V';
    if (sym.includes('Vol 75') && !sym.includes('1s')) return 'R_75';
    if (sym.includes('Vol 100 (1s)')) return '1HZ100V';
    if (sym.includes('Vol 100') && !sym.includes('1s')) return 'R_100';
    if (sym.includes('Jump 100')) return 'JD100';
    if (sym.includes('Jump 75')) return 'JD75';
    if (sym.includes('Jump 50')) return 'JD50';
    if (sym.includes('Jump 25')) return 'JD25';
    if (sym.includes('Jump 10')) return 'JD10';
    return sym; // Fallback to whatever was passed
};

export const useBulkTrader = () => {
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
    const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
    const [tickSequence, setTickSequence] = useState<TickData[]>([]);

    const wsRef = useRef<WebSocket | null>(null);
    const tickSequenceRef = useRef<TickData[]>([]);
    const subscribedSymbolRef = useRef<string | null>(null);
    const pendingSymbolRef = useRef<string | null>(null); // FIX: Caches the symbol if WS isn't ready yet
    const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const safeSetTicks = useCallback((ticks: TickData[]) => {
        const validTicks = Array.isArray(ticks) ? ticks : [];
        tickSequenceRef.current = validTicks;
        setTickSequence(validTicks);
    }, []);

    // 2. Safe symbol subscription
    const subscribeTicks = useCallback((symbol: string) => {
        const actualSymbol = getDerivSymbol(symbol);

        // FIX: If socket is not open yet, save it and subscribe once it opens
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            pendingSymbolRef.current = actualSymbol;
            return;
        }

        if (subscribedSymbolRef.current === actualSymbol) return;

        // Forget previous tick stream if subscribed
        if (subscribedSymbolRef.current) {
            wsRef.current.send(JSON.stringify({ forget_all: 'ticks' }));
        }

        subscribedSymbolRef.current = actualSymbol;
        pendingSymbolRef.current = null;
        safeSetTicks([]);

        wsRef.current.send(
            JSON.stringify({
                ticks_history: actualSymbol,
                adjust_start_time: 1,
                count: 50,
                end: 'latest',
                style: 'ticks',
                subscribe: 1,
            })
        );
    }, [safeSetTicks]);

    // 1. Initialize and maintain persistent WebSocket connection
    useEffect(() => {
        const app_id = 1089; // Default Deriv App ID
        const wsUrl = `wss://ws.derivws.com/websockets/v3?app_id=${app_id}`;

        if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
            return;
        }

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setIsConnected(true);
            
            // FIX: Keep-alive ping every 30 seconds to prevent silent disconnects
            pingIntervalRef.current = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ping: 1 }));
            }, 30000);

            // FIX: Better Token Extraction (checks URL params first, then storage)
            const urlParams = new URLSearchParams(window.location.search);
            let token = urlParams.get('token1') || localStorage.getItem('config.account1') || localStorage.getItem('token');
            
            if (token) {
                try {
                    const parsed = JSON.parse(token);
                    token = parsed.token || token;
                } catch {
                    // Token is just a plain string
                }
                ws.send(JSON.stringify({ authorize: token }));
            }

            // FIX: If UI requested ticks while connecting, fire it now
            if (pendingSymbolRef.current) {
                subscribeTicks(pendingSymbolRef.current);
            }
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                // FIX: Catch and log Deriv API errors so it's not failing silently
                if (data.error) {
                    console.error('[DerivAPI Error]:', data.error.message);
                    return;
                }

                if (data.msg_type === 'authorize') {
                    if (data.authorize) {
                        setIsAuthorized(true);
                        setAccountInfo({
                            loginid: data.authorize.loginid,
                            balance: Number(data.authorize.balance || 0),
                            currency: data.authorize.currency || 'USD',
                        });
                    } else {
                        setIsAuthorized(false);
                    }
                }

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
                }
            } catch (err) {
                console.error('[DerivAPI] Parse Error:', err);
            }
        };

        ws.onerror = (error) => {
            console.error('[DerivAPI] WebSocket Error:', error);
        };

        ws.onclose = () => {
            setIsConnected(false);
            setIsAuthorized(false);
            wsRef.current = null;
            if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        };

        return () => {
            if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [safeSetTicks, subscribeTicks]);

    // 3. Trade execution handler
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
                if (isCancelled || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

                const dynamic = getDynamicParams();
                const proposalReq = {
                    proposal: 1,
                    amount: dynamic.amount,
                    basis: 'stake',
                    currency: accountInfo?.currency || 'USD',
                    symbol: getDerivSymbol(params.symbol), // FIX: apply symbol mapping here too
                    duration: params.duration,
                    duration_unit: 't',
                    contract_type: dynamic.contract_type,
                    barrier: dynamic.prediction !== undefined ? `${dynamic.prediction}` : undefined,
                };

                wsRef.current.send(JSON.stringify(proposalReq));
                onTradeComplete({ success: true });
            };

            if (isSequential) {
                executeSingle();
            } else {
                for (let i = 0; i < count; i++) {
                    executeSingle();
                }
            }

            return () => {
                isCancelled = true;
                onAllFinished();
            };
        },
        [accountInfo?.currency]
    );

    return {
        isConnected,
        isAuthorized,
        accountInfo,
        tickSequence: tickSequence || [],
        subscribeTicks,
        executeBulkTrades,
    };
};
