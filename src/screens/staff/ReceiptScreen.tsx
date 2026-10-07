import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Print from 'expo-print';
import { getOrderItems } from '@/services/db';
import { useSettings, useStyles } from '@/services/settings';
import { peso, formatDateTime, escapeHtml } from '@/utils/format';
import { colors, spacing, createStyleSheet } from '@/theme';
import type { Order, OrderItem } from '@/types';

interface Props {
  order: Order;
  items?: OrderItem[];
  onClose: () => void;
}

// Renders a clean 58mm-style receipt as HTML for the system print dialog / PDF
function receiptHtml(order: Order, items: OrderItem[], storeName: string, tagline: string, receiptFooter: string): string {
  const lines = items
    .map(
      (i) => `
      <tr>
        <td>${escapeHtml(i.name)}<br/><small>${i.quantity} × ${peso(Number(i.price))}</small></td>
        <td style="text-align:right">${peso(Number(i.price) * i.quantity)}</td>
      </tr>`
    )
    .join('');

  return `
  <html><body style="font-family: monospace; padding: 12px; max-width: 320px;">
    <div style="text-align:center">
      <h2 style="margin:0">${escapeHtml(storeName.toUpperCase())}</h2>
      <p style="margin:2px 0">${escapeHtml(tagline)}</p>
      <hr/>
    </div>
    <p style="margin:4px 0">Customer: <b>${escapeHtml(order.customer_name)}</b></p>
    <p style="margin:4px 0">Date: ${formatDateTime(order.created_at)}</p>
    <p style="margin:4px 0">Payment: ${(order.payment_method ?? 'cash').toUpperCase()}</p>
    <hr/>
    <table style="width:100%; font-size:12px">${lines}</table>
    <hr/>
    <table style="width:100%; font-size:13px">
      <tr><td>Subtotal</td><td style="text-align:right">${peso(Number(order.subtotal))}</td></tr>
      <tr><td>Delivery</td><td style="text-align:right">${peso(Number(order.delivery_fee))}</td></tr>
      <tr><td><b>TOTAL</b></td><td style="text-align:right"><b>${peso(Number(order.total))}</b></td></tr>
    </table>
    <p style="text-align:center; margin-top:16px">${escapeHtml(receiptFooter)}</p>
  </body></html>`;
}

export function ReceiptScreen({ order, items: itemsProp, onClose }: Props) {
  const { settings } = useSettings();
  const styles = useStyles(makeStyles);
  const [items, setItems] = useState<OrderItem[]>(itemsProp ?? []);

  // For orders opened from history (no items passed), load them from the database
  useEffect(() => {
    if (itemsProp || order.id.startsWith('local_')) return;
    let active = true;
    void getOrderItems(order.id).then((rows) => {
      if (active) setItems(rows);
    });
    return () => {
      active = false;
    };
  }, [order.id, itemsProp]);

  // PDF is generated on demand; on web this opens the browser's print dialog.
  async function printPdf() {
    try {
      const { uri } = await Print.printToFileAsync({
        html: receiptHtml(order, items, settings.store_name, settings.tagline, settings.receipt_footer),
      });
      const Sharing = require('expo-sharing');
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Receipt PDF' });
      }
    } catch {
      // Printing is best-effort; receipt is still visible on screen
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onClose}>
          <Text style={styles.close}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Receipt</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.paper}>
          <Text style={styles.shop}>{settings.store_name.toUpperCase()}</Text>
          <Text style={styles.shopSub}>{settings.tagline}</Text>
          <Text style={styles.divider}>─────────────────────────</Text>
          <Text style={styles.line}>Customer: {order.customer_name}</Text>
          {order.customer_phone ? <Text style={styles.line}>Phone: {order.customer_phone}</Text> : null}
          <Text style={styles.line}>Date: {formatDateTime(order.created_at)}</Text>
          <Text style={styles.line}>Payment: {(order.payment_method ?? 'cash').toUpperCase()}</Text>
          <Text style={styles.divider}>─────────────────────────</Text>

          {items.map((i) => (
            <View key={i.id} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{i.name}</Text>
                <Text style={styles.itemQty}>
                  {i.quantity} × {peso(Number(i.price))}
                </Text>
              </View>
              <Text style={styles.itemTotal}>{peso(Number(i.price) * i.quantity)}</Text>
            </View>
          ))}

          <Text style={styles.divider}>─────────────────────────</Text>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{peso(Number(order.subtotal))}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Delivery</Text>
            <Text style={styles.totalValue}>{peso(Number(order.delivery_fee))}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.grandLabel}>TOTAL</Text>
            <Text style={styles.grandValue}>{peso(Number(order.total))}</Text>
          </View>
          <Text style={styles.thanks}>{settings.receipt_footer}</Text>
        </View>

        {order.id.startsWith('local_') ? (
          <Text style={styles.pendingNote}>📴 Offline order — will sync automatically</Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.printBtn} onPress={printPdf}>
          <Text style={styles.printText}>🖨️ Print / Save PDF</Text>
        </Pressable>
        <Pressable style={styles.doneBtn} onPress={onClose}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(c: import('@/theme').Palette) {
  return createStyleSheet({
    root: { flex: 1, backgroundColor: c.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing(4), backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.border },
    close: { color: c.primary, fontSize: 15, fontWeight: '600' },
    title: { fontSize: 16, fontWeight: '700', color: c.text },
    content: { padding: spacing(4) },
    // The receipt paper stays white like real thermal paper, in both themes
    paper: { backgroundColor: '#ffffff', borderRadius: 8, padding: spacing(4), borderWidth: 1, borderColor: c.border },
    shop: { textAlign: 'center', fontSize: 17, fontWeight: '800', color: '#0f172a' },
    shopSub: { textAlign: 'center', fontSize: 11, color: '#64748b', marginBottom: spacing(2) },
    divider: { textAlign: 'center', color: '#cbd5e1', marginVertical: spacing(2) },
    line: { fontSize: 13, color: '#0f172a', marginBottom: 2 },
    itemRow: { flexDirection: 'row', marginBottom: spacing(2) },
    itemName: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
    itemQty: { fontSize: 11, color: '#64748b' },
    itemTotal: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    totalLabel: { fontSize: 13, color: '#64748b' },
    totalValue: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
    grandLabel: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
    grandValue: { fontSize: 15, fontWeight: '800', color: c.primary },
    thanks: { textAlign: 'center', marginTop: spacing(3), fontSize: 13, color: '#64748b' },
    pendingNote: { textAlign: 'center', color: c.warning, fontSize: 12, fontWeight: '600', marginTop: spacing(3) },
    footer: { flexDirection: 'row', gap: spacing(3), padding: spacing(4), backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.border },
    printBtn: { flex: 2, backgroundColor: c.primary, borderRadius: 10, paddingVertical: spacing(3.5), alignItems: 'center' },
    printText: { color: c.onPrimary, fontWeight: '700' },
    doneBtn: { flex: 1, backgroundColor: c.bg, borderRadius: 10, paddingVertical: spacing(3.5), alignItems: 'center', borderWidth: 1, borderColor: c.border },
    doneText: { color: c.textMuted, fontWeight: '700' },
  });
}
