// src/pages/bulk-trader/api.ts
const API_URL = 'https://digit-matrix-backend.onrender.com';

// Fetch 1000-tick deep analysis
export const fetchAnalysis = async (marketSymbol: string) => {
    try {
        const res = await fetch(`${API_URL}/api/analysis/${marketSymbol}?lookback=1000`);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.error) return null;
        return data;
    } catch (e) {
        return null;
    }
};

// Fetch last 20 ticks from backend (signal uses these)
export const fetchRecentTicks = async (marketSymbol: string, limit = 20) => {
    try {
        const res = await fetch(`${API_URL}/api/ticks/${marketSymbol}?limit=${limit}`);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
};

// Send local ticks to backend so it can build the database
export const sendTickToBackend = async (symbol: string, quote: number) => {
    try {
        await fetch(`${API_URL}/api/ticks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol, quote }),
        });
    } catch (e) {
        // silent fail
    }
};

// Save every trade to backend
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
