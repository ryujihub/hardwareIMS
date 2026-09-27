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

export interface Settings {
  delivery_fee: number;
}

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
