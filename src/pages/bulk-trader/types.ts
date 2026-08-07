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

export interface StrategySide {
    label: string;
    contract_type: string;
}

export interface StrategyPair {
    left: StrategySide;
    right: StrategySide;
}

// Groups each dropdown strategy into its opposite-direction pair, so the two main
// action buttons can relabel themselves (and fire the correct contract type) based
// on whatever the user has selected — e.g. selecting "Over" shows "Bulk Over" /
// "Bulk Under" instead of always showing "Bulk Even" / "Bulk Odd" regardless of
// the dropdown. Also used by Auto Flip to know what the "opposite side" is.
export const STRATEGY_PAIR_MAPPING: Record<string, StrategyPair> = {
    'Even': { left: { label: 'Even', contract_type: 'DIGITEVEN' }, right: { label: 'Odd', contract_type: 'DIGITODD' } },
    'Odd': { left: { label: 'Even', contract_type: 'DIGITEVEN' }, right: { label: 'Odd', contract_type: 'DIGITODD' } },
    'Matches': { left: { label: 'Match', contract_type: 'DIGITMATCH' }, right: { label: 'Differ', contract_type: 'DIGITDIFF' } },
    'Differs': { left: { label: 'Match', contract_type: 'DIGITMATCH' }, right: { label: 'Differ', contract_type: 'DIGITDIFF' } },
    'Over': { left: { label: 'Over', contract_type: 'DIGITOVER' }, right: { label: 'Under', contract_type: 'DIGITUNDER' } },
    'Under': { left: { label: 'Over', contract_type: 'DIGITOVER' }, right: { label: 'Under', contract_type: 'DIGITUNDER' } },
    'Rise': { left: { label: 'Rise', contract_type: 'CALL' }, right: { label: 'Fall', contract_type: 'PUT' } },
    'Fall': { left: { label: 'Rise', contract_type: 'CALL' }, right: { label: 'Fall', contract_type: 'PUT' } },
    'Only Ups': { left: { label: 'Only Ups', contract_type: 'CALL' }, right: { label: 'Only Downs', contract_type: 'PUT' } },
    'Only Downs': { left: { label: 'Only Ups', contract_type: 'CALL' }, right: { label: 'Only Downs', contract_type: 'PUT' } },
    'Rise Equals': { left: { label: 'Rise Equals', contract_type: 'CALLE' }, right: { label: 'Fall Equals', contract_type: 'PUTE' } },
    'Fall Equals': { left: { label: 'Rise Equals', contract_type: 'CALLE' }, right: { label: 'Fall Equals', contract_type: 'PUTE' } },
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

export interface AccountInfo {
    loginid?: string;
    balance?: number;
    currency?: string;
    is_authorized?: boolean;
}

export interface BulkExecutionResult {
    successCount: number;
    failureCount: number;
    totalProcessed: number;
    errors: string[];
}
