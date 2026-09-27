import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Print from 'expo-print';
import { getOrderItems } from '@/services/db';
import { peso, formatDateTime } from '@/utils/format';
import { colors, spacing } from '@/theme';
import type { Order, OrderItem } from '@/types';

interface Props {
  order: Order;
  items?: OrderItem[];
  onClose: () => void;
}

// Renders a clean 58mm-style receipt as HTML for the system print dialog / PDF
function receiptHtml(order: Order, items: OrderItem[]): string {
  const lines = items
    .map(
      (i) => `
      <tr>
        <td>${i.name}<br/><small>${i.quantity} × ${peso(Number(i.price))}</small></td>
        <td style="text-align:right">${peso(Number(i.price) * i.quantity)}</td>
      </tr>`
    )
    .join('');

  return `
  <html><body style="font-family: monospace; padding: 12px; max-width: 320px;">
    <div style="text-align:center">
      <h2 style="margin:0">METRO MANILA HILLS</h2>
      <p style="margin:2px 0">Construction Supply & Trading</p>
      <hr/>
    </div>
    <p style="margin:4px 0">Customer: <b>${order.customer_name}</b></p>
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
    <p style="text-align:center; margin-top:16px">Salamat po! 🙏</p>
  </body></html>`;
}

export function ReceiptScreen({ order, items: itemsProp, onClose }: Props) {
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
      const { uri } = await Print.printToFileAsync({ html: receiptHtml(order, items) });
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
          <Text style={styles.shop}>METRO MANILA HILLS</Text>
          <Text style={styles.shopSub}>Construction Supply & Trading</Text>
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
          <Text style={styles.thanks}>Salamat po! 🙏</Text>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing(4), backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  close: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  content: { padding: spacing(4) },
  paper: { backgroundColor: colors.white, borderRadius: 8, padding: spacing(4), borderWidth: 1, borderColor: colors.border },
  shop: { textAlign: 'center', fontSize: 17, fontWeight: '800', color: colors.text },
  shopSub: { textAlign: 'center', fontSize: 11, color: colors.textMuted, marginBottom: spacing(2) },
  divider: { textAlign: 'center', color: colors.border, marginVertical: spacing(2) },
  line: { fontSize: 13, color: colors.text, marginBottom: 2 },
  itemRow: { flexDirection: 'row', marginBottom: spacing(2) },
  itemName: { fontSize: 13, fontWeight: '600', color: colors.text },
  itemQty: { fontSize: 11, color: colors.textMuted },
  itemTotal: { fontSize: 13, fontWeight: '600', color: colors.text },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  totalLabel: { fontSize: 13, color: colors.textMuted },
  totalValue: { fontSize: 13, fontWeight: '600', color: colors.text },
  grandLabel: { fontSize: 15, fontWeight: '800', color: colors.text },
  grandValue: { fontSize: 15, fontWeight: '800', color: colors.primary },
  thanks: { textAlign: 'center', marginTop: spacing(3), fontSize: 13, color: colors.textMuted },
  pendingNote: { textAlign: 'center', color: colors.warning, fontSize: 12, fontWeight: '600', marginTop: spacing(3) },
  footer: { flexDirection: 'row', gap: spacing(3), padding: spacing(4), backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border },
  printBtn: { flex: 2, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: spacing(3.5), alignItems: 'center' },
  printText: { color: colors.white, fontWeight: '700' },
  doneBtn: { flex: 1, backgroundColor: colors.bg, borderRadius: 10, paddingVertical: spacing(3.5), alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  doneText: { color: colors.textMuted, fontWeight: '700' },
});
