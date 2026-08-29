// src/pages/bulk-trader/api.ts
const API_URL = 'https://digit-matrix-backend.onrender.com';

// Fetch smart analysis from your backend
export const fetchAnalysis = async (marketSymbol: string) => {
    try {
        const res = await fetch(`${API_URL}/api/analysis/${marketSymbol}?lookback=100`);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
};

// NEW: Send ticks from frontend to backend (works around Render WS issues)
export const sendTickToBackend = async (symbol: string, quote: number) => {
    try {
        await fetch(`${API_URL}/api/ticks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol, quote }),
        });
    } catch (e) {
        // silent fail — don't break the UI if backend is sleeping
    }
};

// Save every trade to your backend
export const logTradeToBackend = async (trade: {
    loginid?: string;
    market: string;
    strategy: string;
    contract_type: string;
    stake: number;
    prediction?: number;
    profit: number;
    result: string;
}) => {
    try {
        await fetch(`${API_URL}/api/trades`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(trade),
        });
    } catch (e) {
        console.log('Failed to log trade');
    }
};
