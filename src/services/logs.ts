import { supabase } from './supabase';
import type { Order } from '@/types';

export interface SalesLogRow {
  id: string;
  created_at: string;
  customer_name: string;
  total: number;
  payment_method: string;
  payment_status: string;
  status: string;
  staff_name: string;
}

export interface StockLogRow {
  id: string;
  created_at: string;
  delta: number;
  reason: string | null;
  product_name: string;
  staff_name: string;
}

export interface AttendanceLogRow {
  id: string;
  action: 'check_in' | 'check_out';
  at: string;
  staff_name: string;
}

const PAGE = 100;

function nameMapFrom(profiles: { id: string; name: string }[]): Map<string, string> {
  return new Map(profiles.map((p) => [p.id, p.name]));
}

export async function fetchSalesLogs(limit = 200): Promise<SalesLogRow[]> {
  const { data: profiles } = await supabase.from('profiles').select('id, name');
  const names = nameMapFrom((profiles ?? []) as { id: string; name: string }[]);

  // Try with payment tracking columns; fall back if the phase 2–3 migration
  // (payment_status / amount_paid) hasn't been applied yet.
  let rows: Record<string, unknown>[] | null = null;
  const withPayment = await supabase
    .from('orders')
    .select('id, created_at, customer_name, total, payment_method, payment_status, status, staff_id')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (!withPayment.error) {
    rows = withPayment.data;
  } else {
    const basic = await supabase
      .from('orders')
      .select('id, created_at, customer_name, total, payment_method, status, staff_id')
      .order('created_at', { ascending: false })
      .limit(limit);
    rows = basic.data;
  }
  if (!rows) return [];

  return (rows as unknown as (Order & { staff_id: string | null })[]).map((o) => ({
    id: o.id,
    created_at: o.created_at,
    customer_name: o.customer_name,
    total: Number(o.total),
    payment_method: o.payment_method ?? 'cash',
    payment_status: o.payment_status ?? 'paid',
    status: o.status ?? 'completed',
    staff_name: (o.staff_id && names.get(o.staff_id)) || '—',
  }));
}

export async function fetchStockLogs(limit = 200): Promise<StockLogRow[]> {
  const [{ data: rows }, { data: profiles }, { data: products }] = await Promise.all([
    supabase
      .from('stock_adjustments')
      .select('id, created_at, delta, reason, staff_id, product_id')
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase.from('profiles').select('id, name'),
    supabase.from('products').select('id, name'),
  ]);

  const names = nameMapFrom((profiles ?? []) as { id: string; name: string }[]);
  const productNames = new Map(
    ((products ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name])
  );

  return ((rows ?? []) as { id: string; created_at: string; delta: number; reason: string | null; staff_id: string | null; product_id: string | null }[]).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    delta: r.delta,
    reason: r.reason,
    product_name: (r.product_id && productNames.get(r.product_id)) || 'Deleted product',
    staff_name: (r.staff_id && names.get(r.staff_id)) || 'System',
  }));
}

export async function fetchAttendanceLogs(limit = 200): Promise<AttendanceLogRow[]> {
  const [{ data: rows }, { data: profiles }] = await Promise.all([
    supabase
      .from('attendance_logs')
      .select('id, action, at, staff_id')
      .order('at', { ascending: false })
      .limit(limit),
    supabase.from('profiles').select('id, name'),
  ]);

  const names = nameMapFrom((profiles ?? []) as { id: string; name: string }[]);

  return ((rows ?? []) as { id: string; action: 'check_in' | 'check_out'; at: string; staff_id: string }[]).map((r) => ({
    id: r.id,
    action: r.action,
    at: r.at,
    staff_name: names.get(r.staff_id) ?? 'Unknown',
  }));
}

// Search helper applied client-side across all log types
export function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => (f ?? '').toLowerCase().includes(q));
}

export { PAGE as LOG_PAGE_SIZE };
