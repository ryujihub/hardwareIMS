import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';
import { peso, formatDateTime } from '@/utils/format';

export interface DailySalesRow {
  day: string;
  total_orders: number;
  total_revenue: number;
  total_subtotal: number;
  total_delivery: number;
}

export async function fetchDailySales(limitDays = 14): Promise<DailySalesRow[]> {
  const { data, error } = await supabase
    .from('daily_sales')
    .select('*')
    .limit(limitDays);
  if (error || !data) return [];
  return data as DailySalesRow[];
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
    <h1 style="margin:0 0 4px">Metro Manila Hills</h1>
    <p style="margin:0 0 16px; color:#555">${title} — generated ${formatDateTime(new Date().toISOString())}</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse; width:100%; font-size:13px">
      <tr style="background:#1e3a5f; color:#fff">
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
