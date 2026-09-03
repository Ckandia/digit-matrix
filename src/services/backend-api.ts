// Single source of truth for every call to digit-matrix-backend.
// If the backend URL ever changes (new Render service, custom domain, etc.),
// this is the ONLY place it needs to be updated.
const BACKEND_URL = 'https://digit-matrix-backend-1.onrender.com';

export interface SessionStats {
    total_trades: number;
    wins: number;
    losses: number;
    win_rate: number;
    net_pnl: number;
}

export interface TickRecord {
    quote: number;
    digit: number;
    time: string;
}

export interface AnalysisResult {
    market: string;
    lookback: number;
    frequency_percent: Record<string, number>;
    even_odd: { even: number; odd: number; even_pct: number };
    hot_digit: string;
    cold_digit: string;
    hot_pct: number;
    cold_pct: number;
    max_streak: { digit: number; length: number };
    last_20_digits: number[];
    error?: string;
}

export interface TradeLogPayload {
    loginid?: string;
    market: string;
    strategy: string;
    contract_type: string;
    stake: number;
    prediction?: number;
    profit: number;
    result: string;
}

// Simple rate limiter so we don't flood the console if the backend is down
let lastErrorTime = 0;
let errorCount = 0;

function shouldLogError(): boolean {
    const now = Date.now();
    if (now - lastErrorTime > 30000) {
        lastErrorTime = now;
        errorCount = 0;
        return true;
    }
    errorCount++;
    // Log only the first error in each 30-second window
    return errorCount === 1;
}

class BackendAPI {
    async sendTick(symbol: string, quote: number): Promise<void> {
        try {
            await fetch(`${BACKEND_URL}/api/ticks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol, quote }),
            });
        } catch (e) {
            if (shouldLogError()) {
                console.error('[Digit Matrix Backend] Tick error (back-end down?):', e);
            }
        }
    }

    async getTicks(symbol: string, limit = 20): Promise<TickRecord[] | null> {
        try {
            const res = await fetch(`${BACKEND_URL}/api/ticks/${encodeURIComponent(symbol)}?limit=${limit}`);
            if (!res.ok) return null;
            const data = await res.json();
            if (!Array.isArray(data)) return null;
            return data;
        } catch (e) {
            if (shouldLogError()) {
                console.error('[Digit Matrix Backend] Get ticks error:', e);
            }
            return null;
        }
    }

    async getAnalysis(symbol: string, lookback = 1000): Promise<AnalysisResult | null> {
        try {
            const res = await fetch(`${BACKEND_URL}/api/analysis/${encodeURIComponent(symbol)}?lookback=${lookback}`);
            if (!res.ok) return null;
            const data = await res.json();
            if (data.error) return null;
            return data;
        } catch (e) {
            if (shouldLogError()) {
                console.error('[Digit Matrix Backend] Analysis error:', e);
            }
            return null;
        }
    }

    async logTrade(trade: TradeLogPayload): Promise<void> {
        try {
            await fetch(`${BACKEND_URL}/api/trades`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(trade),
            });
        } catch (e) {
            if (shouldLogError()) {
                console.error('[Digit Matrix Backend] Trade log error:', e);
            }
        }
    }

    async getTrades(loginid: string, limit = 50): Promise<Record<string, any>[]> {
        try {
            const res = await fetch(`${BACKEND_URL}/api/trades/${encodeURIComponent(loginid)}?limit=${limit}`);
            if (!res.ok) return [];
            return await res.json();
        } catch (e) {
            if (shouldLogError()) {
                console.error('[Digit Matrix Backend] Get trades error:', e);
            }
            return [];
        }
    }

    async getSessionStats(loginid: string): Promise<SessionStats | null> {
        try {
            const res = await fetch(`${BACKEND_URL}/api/stats/session/${encodeURIComponent(loginid)}`);
            if (!res.ok) return null;
            return await res.json();
        } catch (e) {
            if (shouldLogError()) {
                console.error('[Digit Matrix Backend] Stats error:', e);
            }
            return null;
        }
    }
}

export const backendAPI = new BackendAPI();
