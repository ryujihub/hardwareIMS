import type { jsPDF } from 'jspdf';
import { peso, formatDateTime } from '@/utils/format';
import { getSettings } from './settings';
import type { Order, OrderItem } from '@/types';

/**
 * Real, text-based PDF builds for the web.
 *
 * `expo-print` is a no-op on web — its web stub just calls `window.print()`,
 * which prints the app page and returns `undefined`. Reports therefore looked
 * like a screenshot of the app and produced no `uri`. These helpers render the
 * documents with jsPDF so the browser downloads a proper, selectable PDF.
 * Native keeps using `expo-print` (see reports.ts / ReceiptScreen).
 */

export interface SalesReportRow {
  day: string;
  total_orders: number;
  total_revenue: number;
  total_delivery: number;
}

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 48;
const FOOTER_SPACE = 70;

function hexToRgb(hex: string): [number, number, number] {
  const clean = (hex || '').replace(/^#/, '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const value = Number.parseInt(full, 16);
  if (full.length !== 6 || !Number.isFinite(value)) return [30, 58, 95];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

// jsPDF's built-in fonts only cover WinAnsiEncoding: a ₱ sign or an emoji would
// make jsPDF switch the whole string to UTF-16 and render as garbage/blank.
// Map those to safe equivalents and drop what cannot be represented.
const CHAR_MAP: Record<string, string> = {
  '₱': 'PHP ',
  '₩': 'KRW ',
  '₹': 'INR ',
  '₫': 'VND ',
  '—': '-',
  '–': '-',
  '•': '*',
  '’': "'",
  '‘': "'",
  '“': '"',
  '”': '"',
  '…': '...',
  '×': 'x',
  '✕': 'x',
  '🙏': '',
};

function pdfSafe(value: string): string {
  const mapped = value.replace(/[^\x20-\x7e\xa0-\xff]/g, (ch) => CHAR_MAP[ch] ?? '');
  return mapped.replace(/[ \t]+$/, '').replace(/[ \t]{2,}/g, ' ');
}

/** Currency for PDF output — `peso()` uses ₱, which the PDF fonts cannot draw. */
function pdfMoney(amount: number): string {
  return pdfSafe(peso(amount));
}

function safeFileName(title: string): string {
  return `${title.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toLowerCase() || 'report'}.pdf`;
}

/** jsPDF is browser-only, so it is loaded on demand and never at native runtime. */
async function createDoc(format: string | [number, number], unit: 'pt' | 'mm'): Promise<jsPDF> {
  const mod = (await import('jspdf')) as {
    jsPDF?: new (options: Record<string, unknown>) => jsPDF;
    default?: { jsPDF?: new (options: Record<string, unknown>) => jsPDF };
  };
  const Ctor = mod.jsPDF ?? mod.default?.jsPDF;
  if (!Ctor) throw new Error('PDF engine unavailable in this browser');
  // Uncompressed content streams keep the text searchable with any PDF tool
  // (and trivially verifiable) at a negligible size cost for these reports.
  return new Ctor({ unit, format, orientation: 'portrait', compress: false });
}

/** Daily sales summary — A4 table with selectable text. */
export async function saveSalesPdf(rows: SalesReportRow[], title: string): Promise<void> {
  const doc = await createDoc('a4', 'pt');
  const { store_name, primary_color } = getSettings();
  const [pr, pg, pb] = hexToRgb(primary_color);
  const right = A4_WIDTH - MARGIN;
  const tableWidth = right - MARGIN;
  let y = MARGIN;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(pr, pg, pb);
  doc.text(pdfSafe(store_name), MARGIN, y + 14);
  y += 26;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(pdfSafe(title), MARGIN, y);
  doc.text(pdfSafe(`Generated ${formatDateTime(new Date().toISOString())}`), right, y, { align: 'right' });
  y += 12;

  doc.setDrawColor(pr, pg, pb);
  doc.setLineWidth(1.2);
  doc.line(MARGIN, y, right, y);
  y += 18;

  const dateX = MARGIN;
  const ordersX = MARGIN + 150;
  const revenueX = MARGIN + 320;
  const deliveryX = right;
  const columns = [
    { label: 'Date', x: dateX, align: 'left' as const },
    { label: 'Orders', x: ordersX, align: 'center' as const },
    { label: 'Revenue', x: revenueX, align: 'right' as const },
    { label: 'Delivery', x: deliveryX, align: 'right' as const },
  ];

  const drawHeader = () => {
    doc.setFillColor(pr, pg, pb);
    doc.rect(MARGIN, y, tableWidth, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    for (const col of columns) doc.text(pdfSafe(col.label), col.x, y + 15, { align: col.align });
    y += 22;
    doc.setTextColor(35, 35, 35);
    doc.setFont('helvetica', 'normal');
  };
  drawHeader();

  const rowHeight = 20;
  rows.forEach((row, index) => {
    if (y + rowHeight > A4_HEIGHT - FOOTER_SPACE) {
      doc.addPage();
      y = MARGIN;
      drawHeader();
    }
    if (index % 2 === 1) {
      doc.setFillColor(246, 247, 249);
      doc.rect(MARGIN, y, tableWidth, rowHeight, 'F');
    }
    doc.setDrawColor(220, 223, 228);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y + rowHeight, right, y + rowHeight);

    doc.setFontSize(10);
    const baseline = y + 13.5;
    doc.text(pdfSafe(row.day.slice(0, 10)), dateX, baseline);
    doc.text(String(row.total_orders), ordersX, baseline, { align: 'center' });
    doc.text(pdfMoney(Number(row.total_revenue)), revenueX, baseline, { align: 'right' });
    doc.text(pdfMoney(Number(row.total_delivery)), deliveryX, baseline, { align: 'right' });
    y += rowHeight;
  });

  if (rows.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text('No sales recorded in this period.', MARGIN, y + 16);
    y += rowHeight;
  }

  const grandRevenue = rows.reduce((sum, r) => sum + Number(r.total_revenue), 0);
  const grandDelivery = rows.reduce((sum, r) => sum + Number(r.total_delivery), 0);
  doc.setDrawColor(pr, pg, pb);
  doc.setLineWidth(1);
  doc.line(MARGIN, y, right, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(pr, pg, pb);
  doc.text(pdfSafe(`TOTAL (${rows.length} day${rows.length === 1 ? '' : 's'})`), MARGIN, y + 15);
  doc.text(pdfMoney(grandRevenue), revenueX, y + 15, { align: 'right' });
  doc.text(pdfMoney(grandDelivery), deliveryX, y + 15, { align: 'right' });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(pdfSafe(store_name), MARGIN, A4_HEIGHT - 24);
    doc.text(`Page ${page} of ${pages}`, right, A4_HEIGHT - 24, { align: 'right' });
  }

  doc.save(safeFileName(title));
}

/** 80mm thermal-style receipt with selectable text. */
export async function saveReceiptPdf(order: Order, items: OrderItem[]): Promise<void> {
  const { store_name, tagline, receipt_footer, primary_color } = getSettings();
  const doc = await createDoc([80, 240], 'mm');
  const [pr, pg, pb] = hexToRgb(primary_color);
  const left = 6;
  const right = 74;
  const center = 40;
  const contentWidth = right - left;
  let y = 13;

  const dashed = (at: number) => {
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.2);
    for (let x = left; x < right; x += 3) doc.line(x, at, Math.min(x + 1.6, right), at);
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(pr, pg, pb);
  doc.text(pdfSafe(store_name.toUpperCase()), center, y, { align: 'center' });
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(90, 90, 90);
  for (const line of doc.splitTextToSize(pdfSafe(tagline), contentWidth) as string[]) {
    doc.text(line, center, y, { align: 'center' });
    y += 3.6;
  }
  y += 1.5;
  dashed(y);
  y += 6;

  doc.setTextColor(30, 30, 30);
  doc.setFontSize(8.5);
  doc.text(pdfSafe(`Customer: ${order.customer_name}`), left, y);
  y += 4.4;
  if (order.customer_phone) {
    doc.text(pdfSafe(`Phone: ${order.customer_phone}`), left, y);
    y += 4.4;
  }
  doc.text(pdfSafe(`Date: ${formatDateTime(order.created_at)}`), left, y);
  y += 4.4;
  doc.text(pdfSafe(`Payment: ${(order.payment_method ?? 'cash').toUpperCase()}`), left, y);
  y += 5.5;
  dashed(y);
  y += 7;

  for (const item of items) {
    const nameLines = doc.splitTextToSize(pdfSafe(item.name), contentWidth - 20) as string[];
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    nameLines.forEach((line, index) => doc.text(line, left, y + index * 3.8));
    doc.text(pdfMoney(Number(item.price) * item.quantity), right, y, { align: 'right' });
    y += nameLines.length * 3.8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(pdfSafe(`${item.quantity} x ${peso(Number(item.price))}`), left, y + 1.5);
    doc.setTextColor(30, 30, 30);
    y += 6.5;
  }

  dashed(y);
  y += 6;

  const totalLine = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 10.5 : 8.5);
    doc.text(pdfSafe(label), left, y);
    doc.text(pdfSafe(value), right, y, { align: 'right' });
    y += bold ? 5.5 : 4.8;
  };

  totalLine('Subtotal', pdfMoney(Number(order.subtotal)));
  totalLine('Delivery', pdfMoney(Number(order.delivery_fee)));
  totalLine('TOTAL', pdfMoney(Number(order.total)), true);

  y += 3;
  dashed(y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  for (const line of doc.splitTextToSize(pdfSafe(receipt_footer), contentWidth) as string[]) {
    doc.text(line, center, y, { align: 'center' });
    y += 4;
  }
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(`Ref ${order.id}`, center, y + 3, { align: 'center' });

  doc.save(safeFileName(`receipt_${order.customer_name || 'order'}`));
}
