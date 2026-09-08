import DerivAPIBasic from '@deriv/deriv-api/dist/DerivAPIBasic';
import APIMiddleware from './api-middleware';

/**
 * Singleton instance management for DerivAPI
 */
let derivApiInstance = null;
let derivApiPromise = null;
let currentWebSocketURL = null;

const DEFAULT_LOCAL_APP_ID = '1089';

const getAppId = () => {
    // This is the LEGACY WebSocket API (wss://ws.derivws.com/websockets/v3),
    // which is a separate system from the new OAuth client_id used for login.
    // Deliberately reads a DIFFERENT env var than the OAuth flow — do not
    // point this at NEXT_PUBLIC_DERIV_APP_ID (that's the new-system client_id
    // and is not a valid legacy app_id).
    try {
        const envId = process.env.NEXT_PUBLIC_DERIV_LEGACY_APP_ID?.trim();
        if (envId) return envId;
    } catch (e) { /* no-op */ }
    // 1089 is Deriv's public legacy test app_id — safe default for the
    // WebSocket connection (market data, symbols, ticks).
    return DEFAULT_LOCAL_APP_ID;
};

const buildSocketURL = () => {
    const app_id = getAppId();
    // Authoritative Deriv production endpoint
    return `wss://ws.derivws.com/websockets/v3?app_id=${app_id}`;
};

/**
 * Clears the singleton instance (useful for logout or forced reconnection)
 */
export const clearDerivApiInstance = () => {
    if (derivApiInstance?.connection) {
        try {
            derivApiInstance.connection.close();
        } catch (error) {
            console.error('[DerivAPI] Error closing WebSocket:', error);
        }
    }
    derivApiInstance = null;
    derivApiPromise = null;
    currentWebSocketURL = null;
};

/**
 * Generates a Deriv API instance with WebSocket connection using singleton pattern
 */
export const generateDerivApiInstance = async (forceNew = false) => {
    if (forceNew) {
        console.log('[DerivAPI] Forcing new instance creation');
        clearDerivApiInstance();
    }

    if (derivApiInstance) {
        const readyState = derivApiInstance.connection?.readyState;
        if (readyState === WebSocket.CONNECTING || readyState === WebSocket.OPEN) {
            console.log('[DerivAPI] Reusing existing instance (state:', readyState, ')');
            return derivApiInstance;
        } else {
            console.log('[DerivAPI] Existing instance not usable (state:', readyState, '), creating new');
            clearDerivApiInstance();
        }
    }

    if (derivApiPromise) {
        console.log('[DerivAPI] Reusing existing creation promise');
        return derivApiPromise;
    }

    derivApiPromise = (async () => {
        try {
            const wsURL = buildSocketURL();

            if (currentWebSocketURL && currentWebSocketURL !== wsURL) {
                console.log('[DerivAPI] WebSocket URL changed, clearing old instance');
                clearDerivApiInstance();
            }

            currentWebSocketURL = wsURL;

            console.log('[DerivAPI] Creating new WebSocket connection to:', wsURL);
            const deriv_socket = new WebSocket(wsURL);
            const deriv_api = new DerivAPIBasic({
                connection: deriv_socket,
                middleware: new APIMiddleware({}),
            });

            derivApiInstance = deriv_api;

            deriv_socket.addEventListener('close', () => {
                console.log('[DerivAPI] WebSocket connection closed');
                if (derivApiInstance === deriv_api) {
                    derivApiInstance = null;
                    currentWebSocketURL = null;
                }
            });

            deriv_socket.addEventListener('open', () => {
                console.log('[DerivAPI] WebSocket connection established');
            });

            deriv_socket.addEventListener('error', error => {
                console.error('[DerivAPI] WebSocket connection error:', error);
            });

            return deriv_api;
        } catch (error) {
            console.error('[DerivAPI] Error creating instance:', error);
            derivApiPromise = null;
            derivApiInstance = null;
            throw error;
        } finally {
            setTimeout(() => {
                derivApiPromise = null;
            }, 100);
        }
    })();

    return derivApiPromise;
};

export const getLoginId = () => {
    const login_id = localStorage.getItem('active_loginid');
    if (login_id && login_id !== 'null') return login_id;
    return null;
};

export const V2GetActiveAccountId = () => {
    const account_id = localStorage.getItem('active_loginid');
    if (account_id && account_id !== 'null') return account_id;
    return null;
};

export const getToken = () => {
    const active_loginid = getLoginId();
    const client_accounts = JSON.parse(localStorage.getItem('accountsList') || '{}');
    const active_account = client_accounts?.[active_loginid] || {};
    return {
        token: active_account.token || active_account || undefined,
        account_id: active_loginid || undefined,
    };
};
