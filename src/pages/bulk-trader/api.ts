// src/pages/bulk-trader/api.ts
// This file talks to your free backend on Render.com

const API_URL = 'https://digit-matrix-backend.onrender.com';

// Fetch smart analysis from your backend (hot digit, cold digit, even/odd split)
export const fetchAnalysis = async (marketSymbol: string) => {
    try {
        const res = await fetch(`${API_URL}/api/analysis/${marketSymbol}?lookback=100`);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        console.log('Backend not ready yet');
        return null;
    }
};

// Save every trade to your backend so you have a history log
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
