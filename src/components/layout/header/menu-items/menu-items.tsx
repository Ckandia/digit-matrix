// ========================================
// MENU ITEMS COMPONENT
// ========================================

import { observer } from 'mobx-react-lite';
import { MenuItems as MenuItemsConfigList } from '../header-config';

export const MenuItems = observer(() => {
    return null;
});

export const TradershubLink = observer(() => {
    return null;
});

type MenuItemsType = typeof MenuItems & {
    TradershubLink: typeof TradershubLink;
};

(MenuItems as MenuItemsType).TradershubLink = TradershubLink;

export default MenuItems as MenuItemsType;
