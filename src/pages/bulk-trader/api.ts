// Bulk Trader's own names for the shared backend client in ../../services/backend-api.
// Kept as a thin wrapper (not a second copy of the URL/fetch logic) so this
// file and services/backend-api.ts can never drift out of sync again.
import { backendAPI, SessionStats, AnalysisResult, TickRecord, TradeLogPayload } from '@/services/backend-api';

export type { SessionStats, AnalysisResult, TickRecord };

export const fetchAnalysis = (marketSymbol: string): Promise<AnalysisResult | null> =>
    backendAPI.getAnalysis(marketSymbol);

export const fetchRecentTicks = (marketSymbol: string, limit = 20): Promise<TickRecord[] | null> =>
    backendAPI.getTicks(marketSymbol, limit);

export const sendTickToBackend = (symbol: string, quote: number): Promise<void> =>
    backendAPI.sendTick(symbol, quote);

export const fetchSessionStats = (loginid: string): Promise<SessionStats | null> =>
    backendAPI.getSessionStats(loginid);

export const logTradeToBackend = (trade: TradeLogPayload): Promise<void> =>
    backendAPI.logTrade(trade);
