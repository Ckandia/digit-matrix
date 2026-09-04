const BACKEND_URL = (process.env as any).BACKEND_URL || 'https://digit-matrix-backend-1.onrender.com';
const BACKEND_API_KEY = (process.env as any).BACKEND_API_KEY || '';

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
    return errorCount === 1;
}

class BackendAPI {
    private _headers(includeContentType = true): Record<string, string> {
        const h: Record<string, string> = {};
        if (includeContentType) h['Content-Type'] = 'application/json';
        if (BACKEND_API_KEY) h['X-API-Key'] = BACKEND_API_KEY;
        return h;
    }

    async sendTick(symbol: string, quote: number): Promise<void> {
        try {
            await fetch(`${BACKEND_URL}/api/ticks`, {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify({ symbol, quote }),
            });
        } catch (e) {
            if (shouldLogError()) console.error('[Backend] Tick error:', e);
        }
    }

    async getTicks(symbol: string, limit = 20): Promise<TickRecord[] | null> {
        try {
            const res = await fetch(`${BACKEND_URL}/api/ticks/${encodeURIComponent(symbol)}?limit=${limit}`);
            if (!res.ok) return null;
            const data = await res.json();
            return Array.isArray(data) ? data : null;
        } catch (e) {
            if (shouldLogError()) console.error('[Backend] Get ticks error:', e);
            return null;
        }
    }

    async getAnalysis(symbol: string, lookback = 1000): Promise<AnalysisResult | null> {
        try {
            const res = await fetch(`${BACKEND_URL}/api/analysis/${encodeURIComponent(symbol)}?lookback=${lookback}`);
            if (!res.ok) return null;
            const data = await res.json();
            return data.error ? null : data;
        } catch (e) {
            if (shouldLogError()) console.error('[Backend] Analysis error:', e);
            return null;
        }
    }

    async logTrade(trade: TradeLogPayload): Promise<void> {
        try {
            await fetch(`${BACKEND_URL}/api/trades`, {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify(trade),
            });
        } catch (e) {
            if (shouldLogError()) console.error('[Backend] Trade log error:', e);
        }
    }

    async getTrades(loginid: string, limit = 50): Promise<Record<string, any>[]> {
        try {
            const res = await fetch(`${BACKEND_URL}/api/trades/${encodeURIComponent(loginid)}?limit=${limit}`);
            if (!res.ok) return [];
            return await res.json();
        } catch (e) {
            if (shouldLogError()) console.error('[Backend] Get trades error:', e);
            return [];
        }
    }

    async getSessionStats(loginid: string): Promise<SessionStats | null> {
        try {
            const res = await fetch(`${BACKEND_URL}/api/stats/session/${encodeURIComponent(loginid)}`);
            if (!res.ok) return null;
            return await res.json();
        } catch (e) {
            if (shouldLogError()) console.error('[Backend] Stats error:', e);
            return null;
        }
    }

    async startAutotrader(accessToken: string, loginid: string, environment = 'production'): Promise<any> {
        const res = await fetch(`${BACKEND_URL}/api/autotrader/start`, {
            method: 'POST',
            headers: this._headers(),
            body: JSON.stringify({ access_token: accessToken, loginid, environment }),
        });
        if (!res.ok) throw new Error(`startAutotrader failed: ${res.status}`);
        return res.json();
    }

    async stopAutotrader(): Promise<any> {
        const res = await fetch(`${BACKEND_URL}/api/autotrader/stop`, {
            method: 'POST',
            headers: this._headers(),
        });
        if (!res.ok) throw new Error(`stopAutotrader failed: ${res.status}`);
        return res.json();
    }

    async resumeAutotrader(): Promise<any> {
        const res = await fetch(`${BACKEND_URL}/api/autotrader/resume`, {
            method: 'POST',
            headers: this._headers(),
        });
        if (!res.ok) throw new Error(`resumeAutotrader failed: ${res.status}`);
        return res.json();
    }

    async getAutotraderStatus(): Promise<any> {
        const res = await fetch(`${BACKEND_URL}/api/autotrader/status`, {
            headers: this._headers(false),
        });
        if (!res.ok) throw new Error(`getAutotraderStatus failed: ${res.status}`);
        return res.json();
    }
}

export const backendAPI = new BackendAPI();
