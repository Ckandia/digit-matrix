import React from 'react';
import { localize } from '@deriv-com/translations';

const BulkTrader = () => {
    return (
        <div className='bulk-trader'>
            <h2>{localize('Bulk Trades')}</h2>
            <p>{localize('Coming soon.')}</p>
        </div>
    );
};

export default BulkTrader;
