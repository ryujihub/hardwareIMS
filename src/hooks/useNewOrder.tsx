import { createContext, useCallback, useMemo, useState, useContext } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '@/services/auth';
import { fetchProducts, findProductByBarcode, placeOrder } from '@/services/db';
import { useSettings } from '@/services/settings';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { peso } from '@/utils/format';
import { isLowStock } from '@/utils/stock';
import type { CartItem, Order, OrderItem, PaymentMethod, Product } from '@/types';

const PAYMENT_OPTIONS: { key: PaymentMethod; label: string; icon: string }[] = [
  { key: 'cash', label: 'Cash', icon: '💵' },
  { key: 'card', label: 'Card', icon: '💳' },
  { key: 'gcash', label: 'GCash', icon: '📱' },
];

export interface NewOrderState {
  products: Product[];
  query: string;
  cart: CartItem[];
  customerName: string;
  customerPhone: string;
  deliveryFee: string;
  payment: PaymentMethod;
  busy: boolean;
  scanning: boolean;
}

export interface NewOrderActions {
  load: () => Promise<void>;
  setQuery: (q: string) => void;
  setCart: (cart: CartItem[] | ((prev: CartItem[]) => CartItem[])) => void;
  setCustomerName: (v: string) => void;
  setCustomerPhone: (v: string) => void;
  setDeliveryFee: (v: string) => void;
  setPayment: (v: PaymentMethod) => void;
  setBusy: (v: boolean) => void;
  setScanning: (v: boolean) => void;
  addToCart: (p: Product) => void;
  changeQty: (productId: string, delta: number) => void;
  handleBarcode: (code: string, opts?: { addToCart?: (p: Product) => void }) => Promise<void>;
  completeOrder: (onOrderPlaced?: (order: Order, items: OrderItem[]) => void) => Promise<boolean>;
}

export interface NewOrderContextValue extends NewOrderState {
  filtered: Product[];
  enabledMethods: typeof PAYMENT_OPTIONS;
  subtotal: number;
  total: number;
  feeNum: number;
  settings: ReturnType<typeof useSettings>['settings'];
  profile: ReturnType<typeof useAuth>['profile'];
  addToCart: (p: Product) => void;
  changeQty: (productId: string, delta: number) => void;
  handleBarcode: (code: string, opts?: { addToCart?: (p: Product) => void }) => Promise<void>;
  completeOrder: (onOrderPlaced?: (order: Order, items: OrderItem[]) => void) => Promise<boolean>;
  setQuery: (q: string) => void;
  setCart: (cart: CartItem[] | ((prev: CartItem[]) => CartItem[])) => void;
  setCustomerName: (v: string) => void;
  setCustomerPhone: (v: string) => void;
  setDeliveryFee: (v: string) => void;
  setPayment: (v: PaymentMethod) => void;
  setBusy: (v: boolean) => void;
  setScanning: (v: boolean) => void;
  load: () => Promise<void>;
}

const NewOrderContext = createContext<NewOrderContextValue | null>(null);

export function useNewOrder(): NewOrderContextValue {
  const ctx = useContext(NewOrderContext);
  if (!ctx) {
    throw new Error('useNewOrder must be used within a NewOrderProvider');
  }
  return ctx;
}

export function NewOrderProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const { settings } = useSettings();

  const [state, setState] = useState<NewOrderState>({
    products: [],
    query: '',
    cart: [],
    customerName: '',
    customerPhone: '',
    deliveryFee: String(settings.delivery_fee ?? 50),
    payment: 'cash',
    busy: false,
    scanning: false,
  });

  const load = useCallback(async () => {
    const res = await fetchProducts();
    setState((prev) => ({ ...prev, products: res.data }));
  }, []);

  // Keep delivery fee in sync with admin settings
  useState(() => {
    setState((prev) => ({ ...prev, deliveryFee: String(settings.delivery_fee ?? 50) }));
  });

  const enabledMethods = useMemo(() => {
    const enabled = PAYMENT_OPTIONS.filter((o) => settings.payment_methods.includes(o.key));
    return enabled.length > 0 ? enabled : PAYMENT_OPTIONS;
  }, [settings.payment_methods]);

  const filtered = useMemo(() => {
    const q = state.query.trim().toLowerCase();
    if (!q) return state.products.slice(0, 20);
    return state.products
      .filter((p) => p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q))
      .slice(0, 20);
  }, [state.products, state.query]);

  const subtotal = state.cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const feeNum = parseFloat(state.deliveryFee) || 0;
  const total = subtotal + feeNum;

  function addToCart(p: Product) {
    setState((prev) => {
      const existing = prev.cart.find((i) => i.productId === p.id);
      let cart: CartItem[];
      if (existing) {
        cart = prev.cart.map((i) =>
          i.productId === p.id ? { ...i, quantity: Math.min(i.quantity + 1, p.stock || 9999) } : i
        );
      } else {
        cart = [...prev.cart, { productId: p.id, name: p.name, price: Number(p.price), quantity: 1, image_url: p.image_url }];
      }
      return { ...prev, cart };
    });
  }

  function changeQty(productId: string, delta: number) {
    setState((prev) => ({
      ...prev,
      cart: prev.cart
        .map((i) => (i.productId === productId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0),
    }));
  }

  async function handleBarcode(code: string, opts?: { addToCart?: (p: Product) => void }) {
    setState((prev) => ({ ...prev, scanning: false }));
    const local = state.products.find((p) => p.barcode === code || p.sku === code);
    if (local) {
      if (local.stock === 0) {
        Alert.alert('Out of stock', `${local.name} has no stock left.`);
        return;
      }
      opts?.addToCart?.(local);
      return;
    }
    const remote = await findProductByBarcode(code);
    if (remote) {
      setState((prev) => ({
        ...prev,
        products: prev.products.some((p) => p.id === remote.id) ? prev.products : [remote, ...prev.products],
      }));
      if (remote.stock === 0) {
        Alert.alert('Out of stock', `${remote.name} has no stock left.`);
        return;
      }
      opts?.addToCart?.(remote);
    } else {
      Alert.alert('Not found', `No product with barcode ${code}.`);
    }
  }

  async function completeOrder(onOrderPlaced?: (order: Order, items: OrderItem[]) => void) {
    if (state.cart.length === 0) {
      Alert.alert('Empty cart', 'Add at least one product first.');
      return false;
    }
    if (!state.customerName.trim()) {
      Alert.alert('Customer name required', 'Enter the customer name before completing the order.');
      return false;
    }

    setState((prev) => ({ ...prev, busy: true }));

    const result = await placeOrder({
      customerName: state.customerName.trim(),
      customerPhone: state.customerPhone.trim() || null,
      items: state.cart,
      paymentMethod: state.payment,
      subtotal,
      deliveryFee: feeNum,
      total,
    });
    setState((prev) => ({ ...prev, busy: false }));

    if (!result.ok) {
      Alert.alert('Could not save order', result.error);
      return false;
    }

    const order: Order = {
      id: result.orderId,
      customer_name: state.customerName.trim(),
      customer_phone: state.customerPhone.trim() || null,
      staff_id: profile?.id ?? null,
      subtotal,
      delivery_fee: feeNum,
      total,
      payment_method: state.payment,
      payment_status: 'paid',
      amount_paid: total,
      status: 'completed',
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };
    const items: OrderItem[] = state.cart.map((i, idx) => ({
      id: `local_${idx}`,
      order_id: order.id,
      product_id: i.productId,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
    }));

    setState((prev) => ({
      ...prev,
      cart: [],
      customerName: '',
      customerPhone: '',
    }));

    onOrderPlaced?.(order, items);
    return true;
  }

  const value: NewOrderContextValue = {
    ...state,
    filtered,
    enabledMethods,
    subtotal,
    total,
    feeNum,
    settings,
    profile,
    setQuery: (q) => setState((prev) => ({ ...prev, query: q })),
    setCart: (cart) =>
      setState((prev) => ({
        ...prev,
        cart: typeof cart === 'function' ? cart(prev.cart) : cart,
      })),
    setCustomerName: (v) => setState((prev) => ({ ...prev, customerName: v })),
    setCustomerPhone: (v) => setState((prev) => ({ ...prev, customerPhone: v })),
    setDeliveryFee: (v) => setState((prev) => ({ ...prev, deliveryFee: v })),
    setPayment: (v) => setState((prev) => ({ ...prev, payment: v })),
    setBusy: (v) => setState((prev) => ({ ...prev, busy: v })),
    setScanning: (v) => setState((prev) => ({ ...prev, scanning: v })),
    addToCart,
    changeQty,
    handleBarcode,
    completeOrder,
    load,
  };

  return <NewOrderContext.Provider value={value}>{children}</NewOrderContext.Provider>;
}
