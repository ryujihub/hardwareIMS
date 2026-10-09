type NewOrderScreen = 'selection' | 'checkout';

export interface NewOrderNav {
  screen: NewOrderScreen;
  navigate: (target: NewOrderScreen) => void;
  goBack: () => void;
  canGoBack: boolean;
}

// Module-level singleton updated by MainTabs so both new-order screens share one nav.
let newOrderNav: NewOrderNav = {
  screen: 'selection',
  navigate: () => {},
  goBack: () => {},
  canGoBack: false,
};

export function useNavigation(): Readonly<NewOrderNav> {
  return newOrderNav;
}

export function setNewOrderNav(next: NewOrderNav) {
  newOrderNav = next;
}
