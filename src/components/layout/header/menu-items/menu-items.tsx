import { observer } from 'mobx-react-lite';
import { NavLink } from 'react-router-dom';
import { Text } from '@deriv-com/ui';
import { MenuItems as MenuItemsConfigList, TradershubLink as TradershubConfig } from './header-config';

export const MenuItems = observer(() => {
    return (
        <div className='app-header__menu-items' style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {MenuItemsConfigList.map((item, index) => (
                <NavLink
                    key={index}
                    to={item.href}
                    className={({ isActive }) =>
                        `app-header__menu-item ${isActive ? 'app-header__menu-item--active' : ''}`
                    }
                    style={({ isActive }) => ({
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        textDecoration: 'none',
                        color: isActive ? 'var(--text-prominent)' : 'var(--text-general)',
                        backgroundColor: isActive ? 'var(--general-active)' : 'transparent',
                    })}
                >
                    {item.icon}
                    <Text size='sm' weight={isActive ? 'bold' : 'normal'}>
                        {item.label}
                    </Text>
                </NavLink>
            ))}
        </div>
    );
});

export const TradershubLink = observer(() => {
    return null;
});

type MenuItemsType = typeof MenuItems & {
    TradershubLink: typeof TradershubLink;
};

(MenuItems as MenuItemsType).TradershubLink = TradershubLink;

export default MenuItems as MenuItemsType;
