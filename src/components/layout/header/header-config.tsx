import React from 'react';
import { localize } from '@deriv-com/translations';
import {
    LegacyHelpCentreIcon,
    LegacyChartsIcon,
    LegacyBookmark1pxIcon,
    LegacyGuide1pxIcon,
    LegacyToolboxIcon,
} from '@deriv/quill-icons/Legacy';

export const MenuItems = [
    {
        id: 'dt_dashboard_tab',
        icon: <LegacyHelpCentreIcon iconSize='sm' />,
        content: localize('Dashboard'),
        link_to: '/dashboard',
        to: '/dashboard',
    },
    {
        id: 'dt_bot_builder_tab',
        icon: <LegacyBookmark1pxIcon iconSize='sm' />,
        content: localize('Bot Builder'),
        link_to: '/bot-builder',
        to: '/bot-builder',
    },
    {
        id: 'dt_charts_tab',
        icon: <LegacyChartsIcon iconSize='sm' />,
        content: localize('Charts'),
        link_to: '/charts',
        to: '/charts',
    },
    {
        id: 'dt_tutorials_tab',
        icon: <LegacyGuide1pxIcon iconSize='sm' />,
        content: localize('Tutorials'),
        link_to: '/tutorials',
        to: '/tutorials',
    },
    {
        id: 'dt_bulk_trader_tab',
        icon: <LegacyToolboxIcon iconSize='sm' />,
        content: localize('Bulk Trader'),
        link_to: '/bulk-trader',
        to: '/bulk-trader',
    },
];
