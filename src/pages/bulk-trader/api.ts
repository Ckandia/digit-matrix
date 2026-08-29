// src/pages/bulk-trader/api.ts
const API_URL = 'https://digit-matrix-backend.onrender.com';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const fetchAnalysis = async (marketSymbol: string) => {
    try {
        // Render free tier sleeps after 15 min — try up to 3 times
        for (let attempt = 1; attempt <= 3; attempt++) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000); // 8 second timeout

            try {
                const res = await fetch(
                    `${API_URL}/api/analysis/${marketSymbol}?lookback=100`,
                    { signal: controller.signal }
                );
                clearTimeout(timeout);

                if (res.ok) {
                    const data = await res.json();
                    if (!data.error) return data;
                }
            } catch (e) {
                clearTimeout(timeout);
                if (attempt < 3) await sleep(3000); // wait 3s then retry
            }
        }
        return null;
    } catch (e) {
        return null;
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
