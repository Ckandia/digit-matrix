const API_URL = 'https://digit-matrix-backend.onrender.com';

export const fetchAnalysis = async (marketSymbol: string) => {
    try {
        const res = await fetch(`${API_URL}/api/analysis/${encodeURIComponent(marketSymbol)}?lookback=1000`);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.error) return null;
        return data;
    } catch (e) {
        return null;
    }
};

export const fetchRecentTicks = async (marketSymbol: string, limit: number = 20) => {
    try {
        const res = await fetch(`${API_URL}/api/ticks/${encodeURIComponent(marketSymbol)}?limit=${limit}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (!Array.isArray(data)) return null;
        return data;
    } catch (e) {
        return null;
    }
};

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
