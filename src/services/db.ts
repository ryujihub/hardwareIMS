import { supabase } from './supabase';
import { DEFAULT_SETTINGS, type CartItem, type Order, type OrderItem, type OrderStatus, type PaymentMethod, type PaymentStatus, type Product, type Profile, type Settings } from '@/types';

export interface Fetched<T> {
  data: T;
  offline: boolean;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null) {
    const maybe = err as { message?: unknown };
    if (typeof maybe.message === 'string') return maybe.message;
  }
  return String(err ?? 'Something went wrong');
}

// ---------- Products ----------

export async function fetchProducts(): Promise<Fetched<Product[]>> {
  // Online source of truth: read the live Supabase catalog.
  try {
    const { data, error } = await supabase.from('products').select('*').order('name');
    if (error) throw error;
    return { data: (data ?? []) as Product[], offline: false };
  } catch {
    return { data: [], offline: true };
  }
}

// Barcode lookup straight against the live catalog.
export async function findProductByBarcode(barcode: string): Promise<Product | null> {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('barcode', barcode)
      .maybeSingle();
    if (error || !data) return null;
    return data as Product;
  } catch {
    return null;
  }
}

// Batch stock adjustment for a set of products (bulk operations)
export async function bulkAdjustStock(
  productIds: string[],
  delta: number,
  reason: string,
  staffId: string | null
): Promise<{ error: string | null }> {
  if (productIds.length === 0) return { error: null };
  const adjustments = productIds.map((id) => ({ product_id: id, delta, reason, staff_id: staffId }));
  const { error: logError } = await supabase.from('stock_adjustments').insert(adjustments);
  if (logError) return { error: logError.message };

  // Apply deltas via per-product SQL expressions in one request
  const { error } = await supabase.rpc('bulk_add_stock', { p_delta: delta, p_ids: productIds });
  if (error) {
    // RPC missing (migration not run) — fall back to sequential updates
    for (const id of productIds) {
      const { data } = await supabase.from('products').select('stock').eq('id', id).single();
      const next = Math.max((data?.stock ?? 0) + delta, 0);
      await supabase.from('products').update({ stock: next }).eq('id', id);
    }
  }
  return { error: null };
}

export async function bulkDeleteProducts(productIds: string[]): Promise<{ error: string | null }> {
  const { error } = await supabase.from('products').delete().in('id', productIds);
  return { error: error ? error.message : null };
}

export async function upsertProduct(p: Partial<Product> & { name: string; price: number }): Promise<{ error: string | null }> {
  // The barcode and image_url columns require migrations. If they aren't applied
  // yet, retry without those keys so the save still succeeds.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { barcode, image_url, ...rest } = p;
  const { error } = await supabase.from('products').upsert(p);
  if (error && /barcode|image_url/i.test(error.message)) {
    const { error: retryError } = await supabase.from('products').upsert(rest);
    return {
      error: retryError
        ? `${retryError.message} (barcode/image_url skipped — run migrations in supabase/ folder to enable)`
        : null,
    };
  }
  return { error: error ? error.message : null };
}

export async function deleteProduct(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('products').delete().eq('id', id);
  return { error: error ? error.message : null };
}

export async function adjustStock(productId: string, delta: number, reason: string, staffId: string | null): Promise<{ error: string | null }> {
  // bulk_add_stock applies `greatest(stock + delta, 0)` atomically on the
  // server, so two devices adjusting at once can't lose an update.
  return bulkAdjustStock([productId], delta, reason, staffId);
}

// Supabase docs: React Native Blob/File/FormData don't work.
// Use ArrayBuffer decoded from base64 string instead.
export async function uploadProductImage(base64Data: string, fileExt: string): Promise<{ url: string | null; error: string | null }> {
  try {
    const fileName = `${Date.now()}_${Math.floor(Math.random() * 1000)}.${fileExt}`;
    
    // Decode base64 → binary string → Uint8Array → ArrayBuffer
    const binaryString = atob(base64Data);
    const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
    const arrayBuffer = bytes.buffer;
    
    const { error } = await supabase.storage
      .from('product-images')
      .upload(fileName, arrayBuffer, {
        upsert: false,
        contentType: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`,
      });
      
    if (error) throw error;
    
    const { data: publicData } = supabase.storage
      .from('product-images')
      .getPublicUrl(fileName);
      
    return { url: publicData.publicUrl, error: null };
  } catch (err) {
    return { url: null, error: errorMessage(err) };
  }
}

// ---------- Settings ----------

// Columns written by saveSettings — guarded so a missing customization
// migration only affects the columns it actually provides.
const SETTINGS_COLUMNS = [
  'delivery_fee',
  'store_name',
  'tagline',
  'currency_symbol',
  'receipt_footer',
  'primary_color',
  'accent_color',
  'dark_mode',
  'payment_methods',
  'low_stock_threshold',
  'categories',
] as const;

export async function fetchSettings(): Promise<Fetched<Settings>> {
  // Online source of truth: read the live settings row.
  try {
    const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single();
    if (error) throw error;
    return { data: normalizeSettings(data as Partial<Settings> | null), offline: false };
  } catch {
    // Caller keeps its last cached settings instead of overwriting them.
    return { data: DEFAULT_SETTINGS, offline: true };
  }
}

function normalizeSettings(raw: Partial<Settings> | null | undefined): Settings {
  const merged: Settings = { ...DEFAULT_SETTINGS, ...raw };
  if (!Array.isArray(merged.payment_methods) || merged.payment_methods.length === 0) {
    merged.payment_methods = [...DEFAULT_SETTINGS.payment_methods];
  }
  if (!Array.isArray(merged.categories)) merged.categories = [];
  merged.delivery_fee = Number.isFinite(Number(merged.delivery_fee)) ? Number(merged.delivery_fee) : DEFAULT_SETTINGS.delivery_fee;
  merged.low_stock_threshold = Number.isFinite(Number(merged.low_stock_threshold))
    ? Number(merged.low_stock_threshold)
    : DEFAULT_SETTINGS.low_stock_threshold;
  return merged;
}

export async function updateSettings(patch: Partial<Settings>): Promise<{ error: string | null }> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const source = patch as unknown as Record<string, unknown>;
  for (const col of SETTINGS_COLUMNS) {
    if (col in source) row[col] = source[col];
  }
  const { error } = await supabase.from('settings').update(row).eq('id', 1);
  if (!error) return { error: null };
  return {
    error: /pgrst204|column/i.test(error.message)
      ? `${error.message} — run supabase/migration_customization.sql to enable customization`
      : error.message,
  };
}

// ---------- Orders ----------

export async function fetchRecentOrders(limit = 30): Promise<Fetched<Order[]>> {
  try {
    // select('*') breaks if the phase 2-3 migration hasn't added the new
    // columns AND old cached rows are shaped by the newer type — but Postgres
    // simply omits missing columns, so * is actually the resilient choice.
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return { data: (data ?? []) as Order[], offline: false };
  } catch {
    return { data: [], offline: true };
  }
}

export interface PlaceOrderInput {
  customerName: string;
  customerPhone: string | null;
  items: CartItem[];
  paymentMethod: PaymentMethod;
  subtotal: number;
  deliveryFee: number;
  total: number;
}

export type PlaceOrderResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string };

// Creates an order. Online only: the order and its items are written straight
// to Supabase so the dashboard and every other device see it immediately.
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  try {
    const me = await supabase.auth.getUser();
    const staffId = me.data?.user?.id ?? null;
    if (!staffId) return { ok: false, error: 'You are signed out — please sign in again.' };

    const totalCost = input.items.reduce((s, i) => s + (i.cost_price || 0) * i.quantity, 0);

    const { data: supOrder, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_name: input.customerName,
        customer_phone: input.customerPhone,
        staff_id: staffId,
        subtotal: input.subtotal,
        delivery_fee: input.deliveryFee,
        total: input.total,
        total_cost: totalCost,
        payment_method: input.paymentMethod,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (orderError) throw orderError;
    if (!supOrder) throw new Error('No order returned');

    const rows = input.items.map((item) => ({
      order_id: supOrder.id as string,
      product_id: item.productId || null,
      name: item.name,
      price: item.price,
      cost_price: item.cost_price || 0,
      quantity: item.quantity,
    }));
    const { error: itemsError } = await supabase.from('order_items').insert(rows);
    if (itemsError) throw itemsError;

    return { ok: true, orderId: supOrder.id };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function getOrderItems(orderId: string): Promise<OrderItem[]> {
  const { data, error } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId);
  if (error) return [];
  return (data ?? []) as OrderItem[];
}

// ---------- Date-range recent orders (Admin) ----------
export async function fetchRecentOrdersInRange(
  startDate: string,
  endDate: string,
  limit = 100
): Promise<Fetched<Order[]>> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return { data: (data ?? []) as Order[], offline: false };
  } catch {
    return { data: [], offline: true };
  }
}

// ---------- Order status & payment tracking (Phase 2/3) ----------

export async function deleteOrder(orderId: string): Promise<{ error: string | null }> {
  // Cascading deletes on the database ensure order_items are removed as well
  const { error } = await supabase.from('orders').delete().eq('id', orderId);
  return { error: error ? error.message : null };
}

export async function setOrderStatus(orderId: string, status: OrderStatus): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_order_status', { p_order_id: orderId, p_status: status });
  if (!error) return { error: null };
  // Fallback when RPC isn't installed yet: update row directly (no stock restore)
  const { error: updateError } = await supabase.from('orders').update({ status }).eq('id', orderId);
  return { error: updateError ? updateError.message : null };
}

export async function updatePayment(
  orderId: string,
  paymentStatus: PaymentStatus,
  amountPaid: number
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('orders')
    .update({ payment_status: paymentStatus, amount_paid: amountPaid })
    .eq('id', orderId);
  return { error: error ? error.message : null };
}

export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('name');
  if (error) return [];
  return (data ?? []) as Profile[];
}



export async function fetchMyOrdersToday(staffId: string): Promise<Fetched<Order[]>> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('staff_id', staffId)
      .gte('created_at', startOfDay.toISOString())
      .order('created_at', { ascending: false });
    if (error) throw error;
    return { data: (data ?? []) as Order[], offline: false };
  } catch {
    return { data: [], offline: true };
  }
}
