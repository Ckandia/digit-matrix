const BACKEND_URL = (process.env as any).BACKEND_URL || 'http://localhost:10000';

class BackendAPI {
  async sendTick(symbol: string, quote: number) {
    try {
      await fetch(`${BACKEND_URL}/api/ticks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, quote }),
      });
    } catch (e) {
      // Silently fail so the bot never crashes if the back-end is down
      console.error('[Digit Matrix Backend] Tick error:', e);
    }
  }

  async getAnalysis(symbol: string, lookback = 1000) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/analysis/${symbol}?lookback=${lookback}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.error('[Digit Matrix Backend] Analysis error:', e);
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
      console.error('[Digit Matrix Backend] Trade log error:', e);
    }
  }

  async getTrades(loginid: string, limit = 50) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/trades/${loginid}?limit=${limit}`);
      if (!res.ok) return [];
      return await res.json();
    } catch (e) {
      console.error('[Digit Matrix Backend] Get trades error:', e);
      return [];
    }
  }

  async getSessionStats(loginid: string) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/stats/session/${loginid}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.error('[Digit Matrix Backend] Stats error:', e);
      return null;
    }
  }
}

export const backendAPI = new BackendAPI();
