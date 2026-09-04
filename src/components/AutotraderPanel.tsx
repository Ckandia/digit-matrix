import React from 'react';
import { useAutotrader } from '@/hooks/use-autotrader';

export const AutotraderPanel: React.FC = () => {
    const { start, stop, resume, status, isLoggedIn } = useAutotrader();

    const handleStart = async () => {
        try {
            const s = await start();
            alert('Autotrader started! ' + JSON.stringify(s));
        } catch (e) {
            alert(e instanceof Error ? e.message : 'Error starting');
        }
    };

    const handleStatus = async () => {
        const s = await status();
        alert(JSON.stringify(s, null, 2));
    };

    return (
        <div style={{ padding: 16, border: '1px solid #ccc', borderRadius: 8, margin: 8 }}>
            <h3>Auto Trader</h3>
            {!isLoggedIn && <p style={{ color: 'red' }}>Log in to Deriv first.</p>}
            <button onClick={handleStart} disabled={!isLoggedIn}>Start</button>{' '}
            <button onClick={
