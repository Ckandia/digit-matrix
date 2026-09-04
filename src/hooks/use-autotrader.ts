import { useCallback } from 'react';
import { backendAPI } from '@/services/backend-api';

function getAuthToken(): string | null {
    const activeLoginId = localStorage.getItem('active_loginid');
    if (!activeLoginId) return null;
    const accountsList = JSON.parse(localStorage.getItem('accountsList') ?? '{}');
    return accountsList[activeLoginId] || null;
}

export function useAutotrader() {
    const start = useCallback(async () => {
        const accessToken = getAuthToken();
        const loginid = localStorage.getItem('active_loginid');
        const env = (process.env as any).NEXT_PUBLIC_DERIV_ENV || 'production';

        if (!accessToken || !loginid) {
            throw new Error('Please log in to Deriv first.');
        }

        return backendAPI.startAutotrader(accessToken, loginid, env);
    }, []);

    const stop = useCallback(() => backendAPI.stopAutotrader(), []);
    const resume = useCallback(() => backendAPI.resumeAutotrader(), []);
    const status = useCallback(() => backendAPI.getAutotraderStatus(), []);

    const isLoggedIn = !!localStorage.getItem('active_loginid');

    return { start, stop, resume, status, isLoggedIn };
}
