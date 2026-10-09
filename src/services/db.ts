import { supabase } from './supabase';
import { cacheGet, cacheSet, getQueue, replaceQueue, CACHE_KEYS } from '@/store/cache';
import {
  localProducts,
  localProductById,
  localProductByBarcode,
  bulkUpsertLocalProducts,
  localSettings,
  upsertLocalSettings,
  pullFromSupabase,
  placeLocalOrder,
  markLocalOrderSynced,
  enqueueLocalMutation,
  removeLocalMutation,
  getDb,
  syncBunker,
} from './localdb';
import { DEFAULT_SETTINGS, type CartItem, type Order, type OrderItem, type OrderStatus, type PaymentMethod, type PaymentStatus, type Product, type Profile, type QueuedOrder, type Settings } from '@/types';

// Deterministic fake ID generator for demo/kiosk offline staffer identity.
let demoStaffId: string | null = null;
export function getDemoStaffId(): string {
  if (demoStaffId) return demoStaffId;
  demoStaffId = `demo_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  try {
    cacheSet('demo.staffId', demoStaffId);
  } catch {}
  return demoStaffId;
}

export async function getActingStaffId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    if (data.user) return data.user.id;
  } catch {}
  // No real session — use the demo/local staffer identity for offline work.
  return getDemoStaffId();
}

export async function getActingStaffName(): Promise<string> {
  try {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const { data: p } = await supabase.from('profiles').select('name').eq('id', data.user.id).single();
      if (p) return p.name;
    }
  } catch {}
  return 'Demo Staff';
}

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
  // Local-first: always read from the local SQLite catalog so the app is usable offline.
  const local = localProducts();
  if (local.length > 0) {
    // Best-effort background refresh from Supabase into the local DB when online.
    void pullFromSupabase();
    return { data: local, offline: false };
  }

  // No local catalog yet — try Supabase and seed the local DB so future opens are offline.
  try {
    const { data, error } = await supabase.from('products').select('*').order('name');
    if (error) throw error;
    const products = (data ?? []) as Product[];
    bulkUpsertLocalProducts(products);
    return { data: products, offline: false };
  } catch {
    // Nothing online and nothing cached locally yet — return empty.
    return { data: [], offline: true };
  }
}

// Keep a Supabase-only barcode lookup for products that may not be in the local catalog yet.
export async function findProductByBarcode(barcode: string): Promise<Product | null> {
  // Check local catalog first (fast, offline).
  const local = localProductByBarcode(barcode);
  if (local) return local;

  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('barcode', barcode)
      .maybeSingle();
    if (error || !data) return null;
    const product = data as Product;
    bulkUpsertLocalProducts([product]);
    return product;
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
  // Local-first: read from the local SQLite settings row (seeded at first run).
  const local = localSettings();
  if (local.store_name) {
    void pullFromSupabase();
    return { data: local, offline: false };
  }

  try {
    const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single();
    if (error) throw error;
    const settings = normalizeSettings(data as Partial<Settings> | null);
    upsertLocalSettings(settings);
    return { data: settings, offline: false };
  } catch {
    return { data: local, offline: true };
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

// Creates an order. Writes to the local SQLite DB first (so the order exists
// even when there is no internet), then attempts to sync to Supabase.
// When that fails with a network error the order stays local and is synced later.
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  // 1) Local truth: write the order + items + local stock decrement.
  const actingStaff = await getActingStaffId();
  const actingStaffName = await getActingStaffName();

  // 1) Local truth: write the order + items + local stock decrement.
  const { order: localOrder, items: _localItems } = placeLocalOrder({
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    staffId: actingStaff,
    staffName: actingStaffName,
    items: input.items,
    paymentMethod: input.paymentMethod,
    subtotal: input.subtotal,
    deliveryFee: input.deliveryFee,
    total: input.total,
  });

  // 2) Enqueue a sync mutation (durable across app restarts via SQLite queue).
  enqueueLocalMutation({
    localId: localOrder.id,
    createdAt: localOrder.created_at,
    payload: {
      customer_name: input.customerName,
      customer_phone: input.customerPhone,
      items: input.items,
      payment_method: input.paymentMethod,
      subtotal: input.subtotal,
      delivery_fee: input.deliveryFee,
      total: input.total,
    },
  });

  // 3) Attempt sync to Supabase immediately.
  try {
    const me = await supabase.auth.getUser();
    const staffId = me.data?.user?.id ?? null;

    const { data: supOrder, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_name: input.customerName,
        customer_phone: input.customerPhone,
        staff_id: staffId,
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
    if (!supOrder) throw new Error('No order returned');

    const rows = input.items.map((item) => ({
      order_id: supOrder.id as string,
      product_id: item.productId || null,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
    }));
    const { error: itemsError } = await supabase.from('order_items').insert(rows);
    if (itemsError) throw itemsError;

    // Synced — clear the queued mutation.
    removeLocalMutation(localOrder.id);
    return { ok: true, offline: false, orderId: supOrder.id };
  } catch (err) {
    if (!isNetworkError(err)) {
      return { ok: false, error: errorMessage(err) };
    }
    // Network failed — the order already exists locally. Sync later.
    return { ok: true, offline: true, queued: toQueuedOrder(localOrder) };
  }
}

function toQueuedOrder(localOrder: Order): QueuedOrder {
  const database = getDb();
  const itemRows = database.getAllSync<{
    product_id: string | null;
    name: string;
    price: number;
    quantity: number;
  }>(`select product_id, name, price, quantity from local_order_items where order_id = ?`, [
    localOrder.id,
  ]);
  return {
    localId: localOrder.id,
    createdAt: localOrder.created_at,
    payload: {
      customer_name: localOrder.customer_name,
      customer_phone: localOrder.customer_phone,
      items: itemRows.map((r: { product_id: string | null; name: string; price: number; quantity: number }, idx: number) => ({
        productId: r.product_id ?? `unknown-${idx}`,
        name: r.name,
        price: r.price,
        quantity: r.quantity,
      })),
      payment_method: localOrder.payment_method,
      subtotal: localOrder.subtotal,
      delivery_fee: localOrder.delivery_fee,
      total: localOrder.total,
    },
  };
}

// Pushes queued local orders to Supabase. Called on reconnect / app focus.
// Returns how many orders were synced.
export async function syncQueuedOrders(): Promise<number> {
  const result = await syncBunker();
  return result.pushed;
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
