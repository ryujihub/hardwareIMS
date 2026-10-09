import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { supabase } from './supabase';
import { enqueueOrder } from '@/store/cache';
import type { CartItem, Order, OrderItem, PaymentMethod, Product, Settings } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';

export interface LocalFetched<T> {
  data: T;
  offline: boolean;
}

let db: SQLiteDatabase | null = null;

function getDb(): SQLiteDatabase {
  if (!db) {
    db = openDatabaseSync('hardwareims.db');
    upgradeDb(db);
  }
  return db;
}

export { getDb };

function upgradeDb(database: SQLiteDatabase) {
  // Local product catalog (mirrors Supabase products, owned locally for offline use)
  database.execSync(`
    create table if not exists local_products (
      id            text primary key,
      name          text not null,
      sku           text,
      barcode       text,
      category      text,
      price         real not null,
      stock         integer not null default 0,
      reorder_point integer not null default 10,
      image_url     text
    );
  `);

  // Local settings (single row, mirrors Supabase settings id=1)
  database.execSync(`
    create table if not exists local_settings (
      id                  integer primary key check (id = 1),
      delivery_fee        real not null default 50,
      store_name          text    not null default 'Metro Manila Hills',
      tagline             text    not null default 'Construction Supply & Trading — Inventory System',
      currency_symbol     text    not null default '₱',
      receipt_footer      text    not null default 'Salamat po! 🙏',
      primary_color       text    not null default '#1e3a5f',
      accent_color        text    not null default '#f59e0b',
      dark_mode           integer not null default 0,
      payment_methods     text    not null default '["cash","card","gcash"]',
      low_stock_threshold integer not null default 5,
      categories          text    not null default '[]',
      updated_at          text
    );
  `);

  // Local orders placed while offline (or online, written locally first)
  database.execSync(`
    create table if not exists local_orders (
      id             text primary key,
      customer_name  text not null,
      customer_phone text,
      staff_id       text,
      staff_name     text,
      subtotal       real not null default 0,
      delivery_fee   real not null default 0,
      total          real not null default 0,
      payment_method text not null default 'cash',
      payment_status text not null default 'paid',
      amount_paid    real not null default 0,
      status         text not null default 'completed',
      created_at     text not null,
      completed_at   text,
      synced         integer not null default 0
    );
  `);

  // Local order items
  database.execSync(`
    create table if not exists local_order_items (
      id         text primary key,
      order_id   text not null references local_orders (id) on delete cascade,
      product_id text,
      name       text not null,
      price      real not null,
      quantity   integer not null check (quantity > 0)
    );
  `);

  // Mutations waiting to be pushed to Supabase
  database.execSync(`
    create table if not exists local_sync_queue (
      local_id  text primary key,
      kind      text not null,
      created_at text not null,
      payload   text not null
    );
  `);

  // Seed default settings row if missing
  const settingsRow = database.getFirstSync<{ id: number }>(`select id from local_settings where id = 1`);
  if (!settingsRow) {
    database.runSync(`insert into local_settings (id) values (1)`);
  }
}

// ---------------- Row mappers ----------------

interface LocalProductRow {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  price: number;
  stock: number;
  reorder_point: number;
  image_url: string | null;
}

function toProduct(row: LocalProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode,
    category: row.category,
    price: row.price,
    stock: row.stock,
    reorder_point: row.reorder_point,
    image_url: row.image_url ?? undefined,
  };
}

interface LocalOrderRow {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  staff_id: string | null;
  staff_name: string | null;
  subtotal: number;
  delivery_fee: number;
  total: number;
  payment_method: string;
  payment_status: string;
  amount_paid: number;
  status: string;
  created_at: string;
  completed_at: string | null;
}

function toOrder(row: LocalOrderRow): Order {
  return {
    id: row.id,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    staff_id: row.staff_id,
    subtotal: row.subtotal,
    delivery_fee: row.delivery_fee,
    total: row.total,
    payment_method: row.payment_method as PaymentMethod,
    payment_status: row.payment_status as Order['payment_status'],
    amount_paid: row.amount_paid,
    status: row.status as Order['status'],
    created_at: row.created_at,
    completed_at: row.completed_at,
  };
}

// ---------------- Products (local) ----------------

export function localProducts(): Product[] {
  const database = getDb();
  const rows = database.getAllSync<LocalProductRow>(
    `select id, name, sku, barcode, category, price, stock, reorder_point, image_url
     from local_products order by name`
  );
  return rows.map(toProduct);
}

export function localProductById(id: string): Product | null {
  const database = getDb();
  const row = database.getFirstSync<LocalProductRow>(
    `select id, name, sku, barcode, category, price, stock, reorder_point, image_url
     from local_products where id = ?`,
    [id]
  );
  if (!row) return null;
  return toProduct(row);
}

export function localProductByBarcode(barcode: string): Product | null {
  const database = getDb();
  const row = database.getFirstSync<LocalProductRow>(
    `select id, name, sku, barcode, category, price, stock, reorder_point, image_url
     from local_products where barcode = ?`,
    [barcode]
  );
  if (!row) return null;
  return toProduct(row);
}

export function upsertLocalProduct(p: Product) {
  const database = getDb();
  database.runSync(
    `insert into local_products (id, name, sku, barcode, category, price, stock, reorder_point, image_url)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict (id) do update set
       name = excluded.name,
       sku = excluded.sku,
       barcode = excluded.barcode,
       category = excluded.category,
       price = excluded.price,
       stock = excluded.stock,
       reorder_point = excluded.reorder_point,
       image_url = excluded.image_url`,
    [p.id, p.name, p.sku, p.barcode, p.category, p.price, p.stock, p.reorder_point, p.image_url ?? null]
  );
}

export function bulkUpsertLocalProducts(products: Product[]) {
  const database = getDb();
  for (const p of products) {
    upsertLocalProduct(p);
  }
}

export function decrementLocalStock(productId: string, quantity: number): { ok: boolean; newStock: number; error?: string } {
  const database = getDb();
  const row = database.getFirstSync<{ stock: number | null }>(`select stock from local_products where id = ?`, [
    productId,
  ]);
  if (!row || row.stock == null) return { ok: false, newStock: 0, error: 'Product not found locally' };
  const current = row.stock;
  const next = Math.max(current - quantity, 0);
  database.runSync(`update local_products set stock = ? where id = ?`, [next, productId]);
  return { ok: true, newStock: next };
}

// ---------------- Settings (local) ----------------

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

interface LocalSettingsRow {
  id: number;
  delivery_fee: number;
  store_name: string;
  tagline: string;
  currency_symbol: string;
  receipt_footer: string;
  primary_color: string;
  accent_color: string;
  dark_mode: number;
  payment_methods: string;
  low_stock_threshold: number;
  categories: string;
  updated_at: string | null;
}

export function localSettings(): Settings {
  const database = getDb();
  const row = database.getFirstSync<LocalSettingsRow>(`select * from local_settings where id = 1`);
  if (!row) return DEFAULT_SETTINGS;
  return normalizeSettings({
    delivery_fee: row.delivery_fee,
    store_name: row.store_name,
    tagline: row.tagline,
    currency_symbol: row.currency_symbol,
    receipt_footer: row.receipt_footer,
    primary_color: row.primary_color,
    accent_color: row.accent_color,
    dark_mode: Boolean(row.dark_mode),
    payment_methods: JSON.parse(row.payment_methods ?? '[]') as PaymentMethod[],
    low_stock_threshold: row.low_stock_threshold,
    categories: JSON.parse(row.categories ?? '[]') as string[],
  });
}

export function upsertLocalSettings(s: Settings) {
  const database = getDb();
  database.runSync(
    `insert into local_settings (id, delivery_fee, store_name, tagline, currency_symbol, receipt_footer,
      primary_color, accent_color, dark_mode, payment_methods, low_stock_threshold, categories, updated_at)
     values (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict (id) do update set
       delivery_fee = excluded.delivery_fee,
       store_name = excluded.store_name,
       tagline = excluded.tagline,
       currency_symbol = excluded.currency_symbol,
       receipt_footer = excluded.receipt_footer,
       primary_color = excluded.primary_color,
       accent_color = excluded.accent_color,
       dark_mode = excluded.dark_mode,
       payment_methods = excluded.payment_methods,
       low_stock_threshold = excluded.low_stock_threshold,
       categories = excluded.categories,
       updated_at = excluded.updated_at`,
    [
      s.delivery_fee,
      s.store_name,
      s.tagline,
      s.currency_symbol,
      s.receipt_footer,
      s.primary_color,
      s.accent_color,
      s.dark_mode ? 1 : 0,
      JSON.stringify(s.payment_methods),
      s.low_stock_threshold,
      JSON.stringify(s.categories),
      new Date().toISOString(),
    ]
  );
}

// ---------------- Orders (local) ----------------

export function localOrders(): Order[] {
  const database = getDb();
  const rows = database.getAllSync<LocalOrderRow>(
    `select id, customer_name, customer_phone, staff_id, staff_name, subtotal, delivery_fee,
            total, payment_method, payment_status, amount_paid, status, created_at, completed_at
     from local_orders order by created_at desc`
  );
  return rows.map(toOrder);
}

export function localOrderById(id: string): Order | null {
  const database = getDb();
  const row = database.getFirstSync<LocalOrderRow>(
    `select id, customer_name, customer_phone, staff_id, staff_name, subtotal, delivery_fee,
            total, payment_method, payment_status, amount_paid, status, created_at, completed_at
     from local_orders where id = ?`,
    [id]
  );
  if (!row) return null;
  return toOrder(row);
}

export function placeLocalOrder(input: {
  customerName: string;
  customerPhone: string | null;
  staffId: string | null;
  staffName: string | null;
  items: CartItem[];
  paymentMethod: PaymentMethod;
  subtotal: number;
  deliveryFee: number;
  total: number;
  createdLocalId?: string;
}): { order: Order; items: OrderItem[] } {
  const database = getDb();
  const id = input.createdLocalId ?? `local_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const now = new Date().toISOString();

  database.runSync(
    `insert into local_orders (id, customer_name, customer_phone, staff_id, staff_name, subtotal, delivery_fee, total, payment_method, payment_status, amount_paid, status, created_at, completed_at, synced)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, 'completed', ?, ?)`,
    [
      id,
      input.customerName,
      input.customerPhone,
      input.staffId,
      input.staffName,
      input.subtotal,
      input.deliveryFee,
      input.total,
      input.paymentMethod,
      input.total,
      now,
      now,
      0,
    ]
  );

  const items: OrderItem[] = [];
  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i]!;
    const itemId = `${id}_item_${i}`;
    database.runSync(
      `insert into local_order_items (id, order_id, product_id, name, price, quantity)
       values (?, ?, ?, ?, ?, ?)`,
      [itemId, id, item.productId ?? null, item.name, item.price, item.quantity]
    );
    items.push({ id: itemId, order_id: id, product_id: item.productId, name: item.name, price: item.price, quantity: item.quantity });

    if (item.productId) {
      decrementLocalStock(item.productId, item.quantity);
    }
  }

  return { order: localOrderById(id)!, items };
}

export type LocalSyncQueuePayload = {
  localId: string;
  createdAt: string;
  payload: { customer_name: string; customer_phone: string | null; items: CartItem[]; payment_method: PaymentMethod; subtotal: number; delivery_fee: number; total: number };
};

export function enqueueLocalMutation(payload: LocalSyncQueuePayload) {
  const database = getDb();
  database.runSync(
    `insert into local_sync_queue (local_id, kind, created_at, payload) values ('order', ?, ?)`,
    [payload.createdAt, JSON.stringify(payload.payload)]
  );
}

export function dequeuedLocalMutations(): LocalSyncQueuePayload[] {
  const database = getDb();
  const rows = database.getAllSync<{ local_id: string; payload: string; created_at: string }>(`select local_id, payload, created_at from local_sync_queue where kind = 'order' order by created_at`);
  return rows.map((r) => ({ localId: r.local_id, createdAt: r.created_at, payload: JSON.parse(r.payload) as LocalSyncQueuePayload['payload'] }));
}

export function removeLocalMutation(localId: string) {
  const database = getDb();
  database.runSync(`delete from local_sync_queue where local_id = ?`, [localId]);
}

// Mark a local order as synced (and store the server-assigned id if available)
export function markLocalOrderSynced(orderLocalId: string, serverId?: string) {
  const database = getDb();
  database.runSync(`update local_orders set synced = 1 where id = ?`, [orderLocalId]);
}

// Clear local DB (dev/reset only)
export function resetLocalDb() {
  const database = getDb();
  database.execSync(`drop table if exists local_order_items; drop table if exists local_orders; drop table if exists local_sync_queue; drop table if exists local_settings; drop table if exists local_products;`);
  upgradeDb(database);
}

// ---------------- Sync to Supabase ----------------

// Pull fresh products + settings from Supabase into the local DB (best-effort; no pushes).
export async function pullFromSupabase(): Promise<boolean> {
  try {
    const pRes = await supabase.from('products').select('*').order('name');
    if (pRes.error) return false;
    if (pRes.data) {
      bulkUpsertLocalProducts(pRes.data as Product[]);
    }

    const sRes = await supabase.from('settings').select('*').eq('id', 1).single();
    if (!sRes.error && sRes.data) {
      upsertLocalSettings(normalizeSettings(sRes.data as any));
    }
    return true;
  } catch {
    return false;
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null) {
    const maybe = err as { message?: unknown };
    if (typeof maybe.message === 'string') return maybe.message;
  }
  return String(err ?? 'Something went wrong');
}

export async function syncBunker(): Promise<{ pushed: number; pulled: boolean }> {
  let pushed = 0;
  try {
    const queue = dequeuedLocalMutations();
    for (const m of queue) {
      try {
        const result = await pushLocalOrderToSupabase(m.payload);
        if (result.orderId) {
          markLocalOrderSynced(m.localId, result.orderId);
          removeLocalMutation(m.localId);
          pushed += 1;
        } else {
          // Leave the mutation in the SQLite queue for the next retry.
        }
      } catch {
        // Network or server error mid-push — leave the mutation in the SQLite queue.
      }
    }
  } catch (err) {
    return { pushed, pulled: false };
  }

  // Pull: refresh local products + settings from Supabase when online
  let pulled = false;
  try {
    const pRes = await supabase.from('products').select('*').order('name');
    if (pRes.error) throw pRes.error;
    if (pRes.data) {
      bulkUpsertLocalProducts(pRes.data as Product[]);
      pulled = true;
    }

    const sRes = await supabase.from('settings').select('*').eq('id', 1).single();
    if (!sRes.error && sRes.data) {
      upsertLocalSettings(normalizeSettings(sRes.data as any));
      pulled = true;
    }
  } catch {
    // Network failed mid-pull — local data is still the truth; nothing lost.
  }

  return { pushed, pulled };
}

async function pushLocalOrderToSupabase(payload: { customer_name: string; customer_phone: string | null; items: CartItem[]; payment_method: PaymentMethod; subtotal: number; delivery_fee: number; total: number }): Promise<{ orderId: string | null; error?: string }> {
  try {
    const me = await supabase.auth.getUser();
    const staffId = me.data?.user?.id ?? null;

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_name: payload.customer_name,
        customer_phone: payload.customer_phone,
        staff_id: staffId,
        subtotal: payload.subtotal,
        delivery_fee: payload.delivery_fee,
        total: payload.total,
        payment_method: payload.payment_method,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (orderError || !order) {
      return { orderId: null, error: errorMessage(orderError) };
    }

    const rows = payload.items.map((item) => ({
      order_id: order.id as string,
      product_id: item.productId ?? null,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
    }));

    const { error: itemsError } = await supabase.from('order_items').insert(rows);
    if (itemsError) {
      return { orderId: null, error: errorMessage(itemsError) };
    }

    return { orderId: order.id as string };
  } catch (err) {
    return { orderId: null, error: errorMessage(err) };
  }
}

