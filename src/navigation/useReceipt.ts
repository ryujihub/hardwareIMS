import type { Order, OrderItem } from '@/types';

export interface ReceiptNav {
  show: (order: Order, items?: OrderItem[]) => void;
}

// Module-level singleton updated by MainTabs so any screen (for example checkout
// right after an order is saved) can open the full-screen receipt.
let receiptNav: ReceiptNav = { show: () => {} };

export function useReceipt(): Readonly<ReceiptNav> {
  return receiptNav;
}

export function setReceiptNav(next: ReceiptNav) {
  receiptNav = next;
}
