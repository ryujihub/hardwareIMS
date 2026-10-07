import { supabase } from './supabase';
import { cacheGet, cacheSet, enqueueOrder, getQueue, replaceQueue, CACHE_KEYS } from '@/store/cache';
import { DEFAULT_SETTINGS, type CartItem, type Order, type OrderItem, type OrderStatus, type PaymentMethod, type PaymentStatus, type Product, type Profile, type QueuedOrder, type Settings } from '@/types';

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

// Distinguishes connectivity failures (queue the order offline) from
// validation/permission failures (surface the error to the user).
function isNetworkError(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  return /network|failed to fetch|fetch failed|load failed|timed?\s?out|connection|socket|offline|dns/.test(
    msg
  );
}

// ---------- Products ----------

export async function fetchProducts(): Promise<Fetched<Product[]>> {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name');
    if (error) throw error;
    const products = (data ?? []) as Product[];
    await cacheSet(CACHE_KEYS.products, products);
    return { data: products, offline: false };
  } catch {
    // Network or permission failure — serve the last cached copy
    const cached = (await cacheGet<Product[]>(CACHE_KEYS.products)) ?? [];
    return { data: cached, offline: true };
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
  try {
    // select('*') is resilient: if the customization migration hasn't run,
    // Postgres just returns delivery_fee and the rest falls back to defaults.
    const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single();
    if (error) throw error;
    const settings = normalizeSettings(data as Partial<Settings> | null);
    await cacheSet(CACHE_KEYS.settings, settings);
    return { data: settings, offline: false };
  } catch {
    const cached = await cacheGet<Settings>(CACHE_KEYS.settings);
    return { data: normalizeSettings(cached), offline: true };
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
  | { ok: true; offline: false; orderId: string }
  | { ok: true; offline: true; queued: QueuedOrder }
  | { ok: false; error: string };

// Creates an order online; falls back to the offline queue when network fails.
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  try {
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_name: input.customerName,
        customer_phone: input.customerPhone,
        staff_id: (await supabase.auth.getUser()).data.user?.id ?? null,
        subtotal: input.subtotal,
        delivery_fee: input.deliveryFee,
        total: input.total,
        payment_method: input.paymentMethod,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (orderError) throw orderError;
    if (!order) throw new Error('No order returned');

    const rows = input.items.map((item) => ({
      order_id: order.id as string,
      product_id: item.productId || null,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
    }));
    const { error: itemsError } = await supabase.from('order_items').insert(rows);
    if (itemsError) throw itemsError;

    return { ok: true, offline: false, orderId: order.id };
  // Only queue when the failure looks like a network problem — otherwise a
  // validation/permission error would silently become an un-syncable order.
  } catch (err) {
    if (!isNetworkError(err)) {
      return { ok: false, error: errorMessage(err) };
    }
    // Offline path: persist locally and sync later
    const queued: QueuedOrder = {
      localId: `local_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
      createdAt: new Date().toISOString(),
      payload: {
        customer_name: input.customerName,
        customer_phone: input.customerPhone,
        items: input.items,
        payment_method: input.paymentMethod,
        subtotal: input.subtotal,
        delivery_fee: input.deliveryFee,
        total: input.total,
      },
    };
    await enqueueOrder(queued);
    return { ok: true, offline: true, queued };
  }
}

// Pushes queued orders to Supabase. Called on reconnect / app focus.
// Returns how many orders were synced.
export async function syncQueuedOrders(): Promise<number> {
  const queue = await getQueue();
  if (queue.length === 0) return 0;

  let synced = 0;
  const failed: QueuedOrder[] = [];

  for (const q of queue) {
    try {
      const result = await placeOrderOnline(q);
      if (result) synced += 1;
      else failed.push(q);
    } catch {
      failed.push(q);
    }
  }

  await replaceQueue(failed);
  return synced;
}

async function placeOrderOnline(q: QueuedOrder): Promise<boolean> {
  const payload = q.payload;
  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      customer_name: payload.customer_name,
      customer_phone: payload.customer_phone,
      staff_id: (await supabase.auth.getUser()).data.user?.id ?? null,
      subtotal: payload.subtotal,
      delivery_fee: payload.delivery_fee,
      total: payload.total,
      payment_method: payload.payment_method,
      status: 'completed',
      completed_at: q.createdAt,
    })
    .select('id')
    .single();
  if (error || !order) return false;

  const rows = payload.items.map((item) => ({
    order_id: order.id as string,
    product_id: item.productId || null,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
  }));
  const { error: itemsError } = await supabase.from('order_items').insert(rows);
  return !itemsError;
}

export async function getOrderItems(orderId: string): Promise<OrderItem[]> {
  const { data, error } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId);
  if (error) return [];
  return (data ?? []) as OrderItem[];
}

// ---------- Order status & payment tracking (Phase 2/3) ----------

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

// Look up a single product by scanned barcode
export async function findProductByBarcode(barcode: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('barcode', barcode)
    .maybeSingle();
  if (error || !data) return null;
  return data as Product;
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
