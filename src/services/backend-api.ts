// Your real Render backend URL
const BACKEND_URL = 'https://digit-matrix-backend-1.onrender.com';

// Simple rate limiter so we don't flood the console if back-end is down
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
    async sendTick(symbol: string, quote: number) {
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

    async getAnalysis(symbol: string, lookback = 1000) {
        try {
            const res = await fetch(`${BACKEND_URL}/api/analysis/${symbol}?lookback=${lookback}`);
            if (!res.ok) return null;
            return await res.json();
        } catch (e) {
            if (shouldLogError()) {
                console.error('[Digit Matrix Backend] Analysis error:', e);
            }
            return null;
        }
    }

    async logTrade(trade: Record<string, any>) {
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

    async getTrades(loginid: string, limit = 50) {
        try {
            const res = await fetch(`${BACKEND_URL}/api/trades/${loginid}?limit=${limit}`);
            if (!res.ok) return [];
            return await res.json();
        } catch (e) {
            if (shouldLogError()) {
                console.error('[Digit Matrix Backend] Get trades error:', e);
            }
            return [];
        }
    }

    async getSessionStats(loginid: string) {
        try {
            const res = await fetch(`${BACKEND_URL}/api/stats/session/${loginid}`);
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
