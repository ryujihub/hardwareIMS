import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';
import { getSettings } from './settings';
import { peso, formatDateTime, escapeHtml } from '@/utils/format';

export interface DailySalesRow {
  day: string;
  total_orders: number;
  total_revenue: number;
  total_subtotal: number;
  total_delivery: number;
}

const DAILY_SALES_VIEW_DDL = `
create or replace view public.daily_sales as
select
  date_trunc('day', created_at)  as day,
  count(*)::int                  as total_orders,
  coalesce(sum(total), 0)        as total_revenue,
  coalesce(sum(subtotal), 0)     as total_subtotal,
  coalesce(sum(delivery_fee), 0) as total_delivery
from public.orders
where status <> 'cancelled'
group by 1
order by 1 desc;
`;

export async function fetchDailySales(limitDays = 14): Promise<DailySalesRow[]> {
  // Prefer the server-side daily_sales view when it exists (fast, always correct).
  // If the view was never created in this database, fall back to computing the
  // same aggregate client-side from orders so the Admin screen still shows real
  // sales instead of a blank "No sales recorded yet." empty state.
  const { data, error } = await supabase
    .from('daily_sales')
    .select('day, total_orders, total_revenue, total_subtotal, total_delivery')
    .order('day', { ascending: false })
    .limit(limitDays);

  if (!error && data) {
    return data as DailySalesRow[];
  }

  // Missing view / not a "not found"-style error we can recover from? Still try
  // the client-side aggregate so the dashboard is never blank when orders exist.
  return computeDailySalesFromOrders(limitDays);
}

async function computeDailySalesFromOrders(limitDays = 14): Promise<DailySalesRow[]> {
  const { data: orders, error } = await supabase
    .from('orders')
    .select('created_at, total, subtotal, delivery_fee, status')
    .order('created_at', { ascending: false });

  if (error || !orders) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - limitDays);

  const byDay = new Map<string, DailySalesRow>();
  for (const o of orders) {
    if (o.status === 'cancelled') continue;
    if (!o.created_at) continue;
    const d = new Date(o.created_at);
    if (d < cutoff) continue;
    const key = d.toISOString().slice(0, 10);
    const existing = byDay.get(key);
    if (existing) {
      existing.total_orders += 1;
      existing.total_revenue += Number(o.total || 0);
      existing.total_subtotal += Number(o.subtotal || 0);
      existing.total_delivery += Number(o.delivery_fee || 0);
    } else {
      byDay.set(key, {
        day: o.created_at.slice(0, 10),
        total_orders: 1,
        total_revenue: Number(o.total || 0),
        total_subtotal: Number(o.subtotal || 0),
        total_delivery: Number(o.delivery_fee || 0),
      });
    }
  }

  return Array.from(byDay.values()).sort((a, b) => (b.day < a.day ? 1 : -1));
}

function escapeCsv(value: unknown): string {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildSalesCsv(rows: DailySalesRow[]): string {
  const header = 'Date,Orders,Revenue,Subtotal,Delivery Fees';
  const lines = rows.map((r) =>
    [r.day.slice(0, 10), r.total_orders, Number(r.total_revenue).toFixed(2), Number(r.total_subtotal).toFixed(2), Number(r.total_delivery).toFixed(2)].map(escapeCsv).join(',')
  );
  return [header, ...lines].join('\n');
}

function buildSalesHtml(rows: DailySalesRow[], title: string): string {
  const { store_name, primary_color } = getSettings();
  const body = rows
    .map(
      (r) => `<tr>
        <td>${r.day.slice(0, 10)}</td>
        <td style="text-align:center">${r.total_orders}</td>
        <td style="text-align:right">${peso(Number(r.total_revenue))}</td>
        <td style="text-align:right">${peso(Number(r.total_delivery))}</td>
      </tr>`
    )
    .join('');
  const grandTotal = rows.reduce((s, r) => s + Number(r.total_revenue), 0);

  return `<html><body style="font-family: sans-serif; padding: 24px;">
    <h1 style="margin:0 0 4px">${escapeHtml(store_name)}</h1>
    <p style="margin:0 0 16px; color:#555">${escapeHtml(title)} — generated ${formatDateTime(new Date().toISOString())}</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse; width:100%; font-size:13px">
      <tr style="background:${primary_color}; color:#fff">
        <th>Date</th><th>Orders</th><th>Revenue</th><th>Delivery</th>
      </tr>
      ${body}
      <tr>
        <td colspan="2"><b>TOTAL (${rows.length} days)</b></td>
        <td style="text-align:right"><b>${peso(grandTotal)}</b></td>
        <td></td>
      </tr>
    </table>
  </body></html>`;
}

async function shareFile(uri: string, mimeType: string, title: string): Promise<void> {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType, dialogTitle: title });
  }
}

export async function exportSalesPdf(rows: DailySalesRow[], title: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html: buildSalesHtml(rows, title) });
  await shareFile(uri, 'application/pdf', title);
}

// Real .csv file: written to cache on native, browser download on web
export async function exportSalesCsv(rows: DailySalesRow[], title: string): Promise<void> {
  const csv = buildSalesCsv(rows);
  const fileName = title.replace(/[^a-z0-9]+/gi, '_').toLowerCase() + '.csv';

  if (Platform.OS === 'web') {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const fileUri = (FileSystem.cacheDirectory ?? '') + fileName;
  await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
  await shareFile(fileUri, 'text/csv', title);
}
