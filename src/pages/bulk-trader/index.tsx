import React from 'react';
import BulkTrader from '@/components/bulk-trader'; // Adjust path if needed depending on where your bulk-trader.tsx is located

const BulkTraderPage = () => {
    return (
        <div className='bulk-trader-page' style={{ padding: '24px', width: '100%', height: '100%' }}>
            <BulkTrader />
        </div>
    );
};

export default BulkTraderPage;
