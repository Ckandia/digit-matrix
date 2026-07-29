import React, { useState } from 'react';
import './risk-disclaimer.scss';

const RiskDisclaimer = () => {
    const [collapsed, setCollapsed] = useState<boolean>(
        localStorage.getItem('risk_disclaimer_collapsed') === 'true'
    );

    const toggle = () => {
        const next = !collapsed;
        setCollapsed(next);
        localStorage.setItem('risk_disclaimer_collapsed', String(next));
    };

    if (collapsed) {
        return (
            <button className="risk-disclaimer-collapsed" onClick={toggle} aria-label="Show risk disclaimer">
                ⚠
            </button>
        );
    }

    return (
        <div className="risk-disclaimer-banner">
            <span className="warning-icon">⚠</span>
            <p>
                Trading synthetic indices carries a high level of risk and may not be suitable for all
                investors. You could lose some or all of your invested capital. Digit Matrix is an
                independent third-party application built on the Deriv API and is not affiliated with,
                endorsed by, or officially connected to Deriv.
            </p>
            <button className="dismiss-btn" onClick={toggle} aria-label="Collapse disclaimer">×</button>
        </div>
    );
};

export default RiskDisclaimer;
