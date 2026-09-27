import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/services/auth';
import { fetchProducts, fetchSettings, findProductByBarcode, placeOrder } from '@/services/db';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { peso } from '@/utils/format';
import { colors, spacing } from '@/theme';
import type { CartItem, Order, OrderItem, PaymentMethod, Product } from '@/types';

interface Props {
  onOrderPlaced?: (order: Order, items: OrderItem[]) => void;
}

const PAYMENT_OPTIONS: { key: PaymentMethod; label: string; icon: string }[] = [
  { key: 'cash', label: 'Cash', icon: '💵' },
  { key: 'card', label: 'Card', icon: '💳' },
  { key: 'gcash', label: 'GCash', icon: '📱' },
];

export function NewOrderScreen({ onOrderPlaced }: Props) {
  const { profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('50');
  const [payment, setPayment] = useState<PaymentMethod>('cash');
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([fetchProducts(), fetchSettings()]);
    setProducts(p.data);
    setOffline(p.offline);
    setDeliveryFee(String(s.data.delivery_fee));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Called by the barcode scanner with a scanned or typed code
  async function handleBarcode(code: string) {
    setScanning(false);
    const local = products.find((p) => p.barcode === code || p.sku === code);
    if (local) {
      if (local.stock === 0) {
        Alert.alert('Out of stock', `${local.name} has no stock left.`);
        return;
      }
      addToCart(local);
      return;
    }
    const remote = await findProductByBarcode(code);
    if (remote) {
      setProducts((prev) => (prev.some((p) => p.id === remote.id) ? prev : [remote, ...prev]));
      if (remote.stock === 0) {
        Alert.alert('Out of stock', `${remote.name} has no stock left.`);
        return;
      }
      addToCart(remote);
    } else {
      Alert.alert('Not found', `No product with barcode ${code}.`);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 20);
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q))
      .slice(0, 20);
  }, [products, query]);

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const feeNum = parseFloat(deliveryFee) || 0;
  const total = subtotal + feeNum;

  function addToCart(p: Product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === p.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === p.id ? { ...i, quantity: Math.min(i.quantity + 1, p.stock || 9999) } : i
        );
      }
      return [...prev, { productId: p.id, name: p.name, price: Number(p.price), quantity: 1 }];
    });
  }

  function changeQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) => (i.productId === productId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0)
    );
  }

  async function completeOrder() {
    if (cart.length === 0) {
      Alert.alert('Empty cart', 'Add at least one product first.');
      return;
    }
    if (!customerName.trim()) {
      Alert.alert('Customer name required', 'Enter the customer name before completing the order.');
      return;
    }

    setBusy(true);
    const result = await placeOrder({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || null,
      items: cart,
      paymentMethod: payment,
      subtotal,
      deliveryFee: feeNum,
      total,
    });
    setBusy(false);

    if (!result.ok) {
      Alert.alert('Could not save order', result.error);
      return;
    }

    const order: Order = {
      id: result.offline ? result.queued.localId : result.orderId,
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim() || null,
      staff_id: profile?.id ?? null,
      subtotal,
      delivery_fee: feeNum,
      total,
      payment_method: payment,
      payment_status: 'paid',
      amount_paid: total,
      status: 'completed',
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };
    const items: OrderItem[] = cart.map((i, idx) => ({
      id: `local_${idx}`,
      order_id: order.id,
      product_id: i.productId,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
    }));

    setCart([]);
    setCustomerName('');
    setCustomerPhone('');

    if (result.offline) {
      Alert.alert('Saved offline 📴', 'No connection right now — the order is queued and will sync automatically.');
    }
    onOrderPlaced?.(order, items);
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>🛒 New Order</Text>
        {offline ? <Text style={styles.offlineTag}>OFFLINE</Text> : null}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Customer name *</Text>
        <TextInput style={styles.input} value={customerName} onChangeText={setCustomerName} placeholder="e.g. Juan Dela Cruz" />

        <Text style={styles.label}>Phone</Text>
        <TextInput style={styles.input} value={customerPhone} onChangeText={setCustomerPhone} placeholder="09XX-XXX-XXXX" keyboardType="phone-pad" />

        <View style={styles.addProductsHeader}>
          <Text style={styles.label}>Add products</Text>
          <Pressable style={styles.scanBtn} onPress={() => setScanning(true)}>
            <Text style={styles.scanBtnText}>📷 Scan</Text>
          </Pressable>
        </View>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="🔍 Search products…"
          placeholderTextColor={colors.textMuted}
        />
        {filtered.map((p) => {
          const low = p.stock <= p.reorder_point;
          const inCart = cart.find((i) => i.productId === p.id);
          return (
            <View key={p.id} style={styles.productRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.productName}>{p.name}</Text>
                <Text style={[styles.productMeta, low && { color: colors.danger }]}>
                  {p.stock === 0 ? 'Out of stock' : `In stock: ${p.stock}`} · {peso(Number(p.price))}
                </Text>
              </View>
              {inCart ? (
                <Text style={styles.inCart}>×{inCart.quantity}</Text>
              ) : null}
              <Pressable
                style={[styles.addBtn, p.stock === 0 && { opacity: 0.4 }]}
                onPress={() => addToCart(p)}
                disabled={p.stock === 0}
              >
                <Text style={styles.addBtnText}>+ Add</Text>
              </Pressable>
            </View>
          );
        })}
        {filtered.length === 0 ? <Text style={styles.empty}>No products found.</Text> : null}

        {/* Cart */}
        {cart.length > 0 ? (
          <>
            <Text style={styles.section}>🧾 Cart</Text>
            {cart.map((i) => (
              <View key={i.productId} style={styles.cartRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.productName}>{i.name}</Text>
                  <Text style={styles.productMeta}>
                    {peso(i.price)} × {i.quantity} = {peso(i.price * i.quantity)}
                  </Text>
                </View>
                <Pressable style={styles.qtyBtn} onPress={() => changeQty(i.productId, -1)}>
                  <Text style={styles.qtyBtnText}>−</Text>
                </Pressable>
                <Text style={styles.qty}>{i.quantity}</Text>
                <Pressable style={styles.qtyBtn} onPress={() => changeQty(i.productId, +1)}>
                  <Text style={styles.qtyBtnText}>+</Text>
                </Pressable>
              </View>
            ))}
          </>
        ) : null}

        {/* Totals */}
        <View style={styles.totalsCard}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{peso(subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Delivery fee</Text>
            <TextInput
              style={styles.feeInput}
              value={deliveryFee}
              onChangeText={setDeliveryFee}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={[styles.totalRow, styles.grandTotalRow]}>
            <Text style={styles.grandTotalLabel}>TOTAL</Text>
            <Text style={styles.grandTotal}>{peso(total)}</Text>
          </View>
        </View>

        {/* Payment */}
        <View style={styles.paymentRow}>
          {PAYMENT_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              style={[styles.payBtn, payment === opt.key && styles.payBtnActive]}
              onPress={() => setPayment(opt.key)}
            >
              <Text style={{ fontSize: 18 }}>{opt.icon}</Text>
              <Text style={[styles.payLabel, payment === opt.key && styles.payLabelActive]}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          style={[styles.completeBtn, (busy || cart.length === 0) && { opacity: 0.5 }]}
          onPress={completeOrder}
          disabled={busy || cart.length === 0}
        >
          <Text style={styles.completeText}>{busy ? 'Saving…' : `✓ COMPLETE ORDER — ${peso(total)}`}</Text>
        </Pressable>
      </ScrollView>

      <BarcodeScanner
        visible={scanning}
        onScanned={(code) => void handleBarcode(code)}
        onClose={() => setScanning(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing(4), paddingBottom: spacing(2) },
  title: { fontSize: 20, fontWeight: '800', color: colors.primary },
  offlineTag: { color: colors.danger, backgroundColor: colors.dangerBg, fontWeight: '800', fontSize: 11, paddingHorizontal: spacing(2), paddingVertical: spacing(1), borderRadius: 8, overflow: 'hidden' },
  content: { padding: spacing(4), paddingTop: 0, paddingBottom: spacing(8) },
  label: { fontSize: 12, fontWeight: '600', color: colors.textMuted, marginBottom: spacing(1), marginTop: spacing(2) },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: spacing(3), paddingVertical: spacing(3), fontSize: 15, backgroundColor: colors.card, marginBottom: spacing(2) },
  search: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: spacing(3), paddingVertical: spacing(3), fontSize: 15, backgroundColor: colors.card, marginBottom: spacing(3) },
  addProductsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scanBtn: { backgroundColor: colors.primaryLight, borderRadius: 8, paddingHorizontal: spacing(3), paddingVertical: spacing(1.5) },
  scanBtnText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  productRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: spacing(3), marginBottom: spacing(2) },
  productName: { fontSize: 14, fontWeight: '600', color: colors.text },
  productMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  inCart: { fontSize: 12, fontWeight: '700', color: colors.primary, marginRight: spacing(2) },
  addBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: spacing(3), paddingVertical: spacing(2) },
  addBtnText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  empty: { textAlign: 'center', color: colors.textMuted, marginVertical: spacing(3) },
  section: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: spacing(4), marginBottom: spacing(2) },
  cartRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: spacing(3), marginBottom: spacing(2) },
  qtyBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  qtyBtnText: { fontSize: 18, fontWeight: '700', color: colors.primary },
  qty: { width: 32, textAlign: 'center', fontSize: 15, fontWeight: '700', color: colors.text },
  totalsCard: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: spacing(4), marginTop: spacing(4) },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(2) },
  totalLabel: { fontSize: 14, color: colors.textMuted },
  totalValue: { fontSize: 14, fontWeight: '600', color: colors.text },
  feeInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: spacing(2), paddingVertical: spacing(1), fontSize: 14, width: 90, textAlign: 'right', backgroundColor: colors.bg },
  grandTotalRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing(2), marginBottom: 0 },
  grandTotalLabel: { fontSize: 16, fontWeight: '800', color: colors.text },
  grandTotal: { fontSize: 20, fontWeight: '800', color: colors.primary },
  paymentRow: { flexDirection: 'row', gap: spacing(2), marginTop: spacing(3) },
  payBtn: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: spacing(2.5), alignItems: 'center' },
  payBtnActive: { borderColor: colors.primary, backgroundColor: '#e8f0fa' },
  payLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  payLabelActive: { color: colors.primary, fontWeight: '700' },
  completeBtn: { backgroundColor: colors.success, borderRadius: 12, paddingVertical: spacing(4), alignItems: 'center', marginTop: spacing(4) },
  completeText: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
