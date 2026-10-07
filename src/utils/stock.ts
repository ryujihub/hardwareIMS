import type { Product } from '@/types';

// A product is low when it's at/below its own reorder point, falling back
// to the admin-configured global threshold when the product has none set.
export function isLowStock(p: Product, lowStockThreshold: number): boolean {
  const threshold = p.reorder_point > 0 ? p.reorder_point : lowStockThreshold;
  return p.stock <= threshold;
}
