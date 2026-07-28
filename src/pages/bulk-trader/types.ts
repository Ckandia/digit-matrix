export type TradeExecutionMode = 'FAST' | 'SLOW';

export const MARKET_MAPPING: Record<string, string> = {
    'Vol 10 (1s)': '1HZ10V',
    'Vol 10': 'R_10',
    'Vol 15 (1s)': '1HZ15V',
    'Vol 25': 'R_25',
    'Vol 25 (1s)': '1HZ25V',
    'Vol 30 (1s)': '1HZ30V',
    'Vol 50': 'R_50',
    'Vol 50 (1s)': '1HZ50V',
    'Vol 75': 'R_75',
    'Vol 75 (1s)': '1HZ75V',
    'Vol 90 (1s)': '1HZ90V',
    'Vol 100': 'R_100',
    'Vol 100 (1s)': '1HZ100V',
    'Jump 10': 'JD10',
    'Jump 25': 'JD25',
    'Jump 50': 'JD50',
    'Jump 75': 'JD75',
    'Jump 100': 'JD100',
};

export const STRATEGY_MAPPING: Record<string, string> = {
    'Even': 'DIGITEVEN',
    'Odd': 'DIGITODD',
    'Matches': 'DIGITMATCH',
    'Differs': 'DIGITDIFF',
    'Over': 'DIGITOVER',
    'Under': 'DIGITUNDER',
    'Rise': 'CALL',
    'Fall': 'PUT',
    'Only Ups': 'CALL',
    'Only Downs': 'PUT',
    'Rise Equals': 'CALLE',
    'Fall Equals': 'PUTE',
};

export interface TickData {
    epoch: number;
    quote: number;
    digit: number;
    type: 'E' | 'O';
}

export interface TradePayload {
    symbol: string;
    contract_type: string;
    amount: number;
    duration: number;
    prediction?: number;
}
