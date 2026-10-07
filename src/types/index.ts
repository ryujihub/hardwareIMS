export type Role = 'staff' | 'manager' | 'admin';

export interface Profile {
  id: string;
  name: string;
  role: Role;
  checked_in: boolean;
  last_check_in: string | null;
}

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  price: number;
  stock: number;
  reorder_point: number;
  image_url?: string | null;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
}

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image_url?: string | null;
}

export type PaymentMethod = 'cash' | 'card' | 'gcash';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid';
export type OrderStatus = 'pending' | 'completed' | 'cancelled';

export interface Order {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  staff_id: string | null;
  subtotal: number;
  delivery_fee: number;
  total: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  amount_paid: number;
  status: OrderStatus;
  created_at: string;
  completed_at: string | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  name: string;
  price: number;
  quantity: number;
}

// Admin-customizable app configuration (settings table row 1).
// Defaults match a fresh schema.sql install; the app works even when
// the customization migration hasn't run (missing fields fall back here).
export interface Settings {
  delivery_fee: number;
  store_name: string;
  tagline: string;
  currency_symbol: string;
  receipt_footer: string;
  primary_color: string;
  accent_color: string;
  dark_mode: boolean;
  payment_methods: PaymentMethod[];
  low_stock_threshold: number;
  categories: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  delivery_fee: 50,
  store_name: 'Metro Manila Hills',
  tagline: 'Construction Supply & Trading — Inventory System',
  currency_symbol: '₱',
  receipt_footer: 'Salamat po! 🙏',
  primary_color: '#1e3a5f',
  accent_color: '#f59e0b',
  dark_mode: false,
  payment_methods: ['cash', 'card', 'gcash'],
  low_stock_threshold: 5,
  categories: [],
};

// An order captured while offline, waiting to sync
export interface QueuedOrder {
  localId: string;
  createdAt: string;
  payload: {
    customer_name: string;
    customer_phone: string | null;
    items: CartItem[];
    payment_method: PaymentMethod;
    subtotal: number;
    delivery_fee: number;
    total: number;
  };
}
