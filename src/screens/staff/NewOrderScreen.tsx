import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/services/auth';
import { fetchProducts, findProductByBarcode, placeOrder } from '@/services/db';
import { useSettings, useStyles } from '@/services/settings';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { peso } from '@/utils/format';
import { isLowStock } from '@/utils/stock';
import { colors, spacing, withAlpha, createStyleSheet } from '@/theme';
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
  const { settings } = useSettings();
  const styles = useStyles(makeStyles);
  const scrollView = useRef<ScrollView>(null);
  const rowLayouts = useRef<Record<string, { y: number; h: number }>>({});
  const scrollOffset = useRef(0);
  const viewportHeight = useRef(0);
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
  const [lastTouchedProductId, setLastTouchedProductId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetchProducts();
    setProducts(res.data);
    setOffline(res.offline);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Delivery fee + payment selection follow the admin's ordering rules
  useEffect(() => {
    setDeliveryFee(String(settings.delivery_fee));
  }, [settings.delivery_fee]);

  const enabledMethods = useMemo(() => {
    const enabled = PAYMENT_OPTIONS.filter((o) => settings.payment_methods.includes(o.key));
    return enabled.length > 0 ? enabled : PAYMENT_OPTIONS;
  }, [settings.payment_methods]);

  // If the saved choice was disabled in settings, fall back to the first enabled one
  useEffect(() => {
    const first = enabledMethods[0];
    if (first && !enabledMethods.some((o) => o.key === payment)) {
      setPayment(first.key);
    }
  }, [enabledMethods, payment]);

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
      return [...prev, { productId: p.id, name: p.name, price: Number(p.price), quantity: 1, image_url: p.image_url }];
    });
    // After the next render, scroll the touched product row into view.
    setLastTouchedProductId(p.id);
  }

  function changeQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) => (i.productId === productId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0)
    );
  }

  // After each render, scroll the last-touched product row into view if it's off-screen.
  useEffect(() => {
    if (lastTouchedProductId == null) return;
    const layout = rowLayouts.current[lastTouchedProductId];
    if (!layout) return;
    const { y, h } = layout;
    if (h <= 0 || viewportHeight.current <= 0) return;

    const offsetY = scrollOffset.current;
    // If the row is fully within the viewport, skip.
    if (y >= offsetY && y + h <= offsetY + viewportHeight.current) {
      return;
    }

    // Otherwise scroll the row's top into view.
    const target = Math.max(0, y);
    scrollView.current?.scrollTo({ animated: true, y: target });
  }, [lastTouchedProductId]);

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

    const actingStaffId = profile?.id ?? null;
    const actingStaffName = profile?.name ?? 'Demo Staff';

    const order: Order = {
      id: result.offline ? result.queued.localId : result.orderId,
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim() || null,
      staff_id: result.offline ? actingStaffId : profile?.id ?? null,
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
      const who = actingStaffName ?? 'Demo Staff';
      Alert.alert('Saved offline 📴', `No connection right now — ${who} order is queued and will sync automatically.`);
    }
    onOrderPlaced?.(order, items);
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>🛒 New Order</Text>
        {offline ? <Text style={styles.offlineTag}>OFFLINE</Text> : null}
      </View>

      <ScrollView
        ref={scrollView}
        contentContainerStyle={styles.content}
        scrollEventThrottle={16}
        onScroll={(e) => {
          scrollOffset.current = e.nativeEvent.contentOffset.y;
        }}
        onLayout={(e) => {
          viewportHeight.current = e.nativeEvent.layout.height;
        }}
      >
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
          const low = isLowStock(p, settings.low_stock_threshold);
          const inCart = cart.find((i) => i.productId === p.id);
          return (
            <ProductRow
              key={p.id}
              product={p}
              low={low}
              inCart={inCart}
              onAdd={() => addToCart(p)}
              onLayout={(y: number, h: number) => {
                rowLayouts.current[p.id] = { y, h };
              }}
              styles={styles}
            />
          );
        })}
        {filtered.length === 0 ? <Text style={styles.empty}>No products found.</Text> : null}

        {/* Cart */}
        {cart.length > 0 ? (
          <>
            <Text style={styles.section}>🧾 Cart</Text>
            {cart.map((i) => (
              <View key={i.productId} style={styles.cartRow}>
                {i.image_url ? (
                  <View style={[styles.thumbWrapper, { marginRight: spacing(2) }]}>
                    <Image source={{ uri: i.image_url }} style={{ width: 36, height: 36, borderRadius: 6 }} onError={(e) => console.warn('Image failed:', i.image_url, e.nativeEvent.error)} />
                  </View>
                ) : (
                  <View style={[styles.thumbWrapper, { marginRight: spacing(2), backgroundColor: colors.bg }]} />
                )}
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

        {/* Payment — only the methods enabled by the admin */}
        <View style={styles.paymentRow}>
          {enabledMethods.map((opt) => (
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

function ProductRow({
  product,
  low,
  inCart,
  onAdd,
  onLayout,
  styles,
}: {
  product: Product;
  low: boolean;
  inCart: CartItem | undefined;
  onAdd: () => void;
  onLayout: (y: number, h: number) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View
      style={styles.productRow}
      onLayout={(e) => {
        const { y, height } = e.nativeEvent.layout;
        onLayout(y, height);
      }}
    >
      {product.image_url ? (
        <View style={styles.thumbWrapper}>
          <Image
            source={{ uri: product.image_url }}
            style={{ width: 40, height: 40, borderRadius: 6 }}
            onError={(e) => console.warn('Image failed:', product.image_url, e.nativeEvent.error)}
          />
        </View>
      ) : (
        <View style={[styles.thumbWrapper, { backgroundColor: colors.bg }]} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.productName}>{product.name}</Text>
        <Text style={[styles.productMeta, low && { color: colors.danger }]}>
          {product.stock === 0 ? 'Out of stock' : `In stock: ${product.stock}`} · {peso(Number(product.price))}
        </Text>
      </View>
      {inCart ? <Text style={styles.inCart}>×{inCart.quantity}</Text> : null}
      <Pressable
        style={[styles.addBtn, product.stock === 0 && { opacity: 0.4 }]}
        onPress={onAdd}
        disabled={product.stock === 0}
      >
        <Text style={styles.addBtnText}>+ Add</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(c: import('@/theme').Palette) {
  return createStyleSheet({
    root: { flex: 1, backgroundColor: c.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing(4), paddingBottom: spacing(2) },
    title: { fontSize: 20, fontWeight: '800', color: c.primary },
    offlineTag: { color: c.danger, backgroundColor: c.dangerBg, fontWeight: '800', fontSize: 11, paddingHorizontal: spacing(2), paddingVertical: spacing(1), borderRadius: 8, overflow: 'hidden' },
    content: { padding: spacing(4), paddingTop: 0, paddingBottom: spacing(8) },
    label: { fontSize: 12, fontWeight: '600', color: c.textMuted, marginBottom: spacing(1), marginTop: spacing(2) },
    input: { borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: spacing(3), paddingVertical: spacing(3), fontSize: 15, backgroundColor: c.card, marginBottom: spacing(2), color: c.text },
    search: { borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: spacing(3), paddingVertical: spacing(3), fontSize: 15, backgroundColor: c.card, marginBottom: spacing(3), color: c.text },
    addProductsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    scanBtn: { backgroundColor: c.primaryLight, borderRadius: 8, paddingHorizontal: spacing(3), paddingVertical: spacing(1.5) },
    scanBtnText: { color: c.onPrimary, fontWeight: '700', fontSize: 13 },
    productRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 10, borderWidth: 1, borderColor: c.border, padding: spacing(3), marginBottom: spacing(2) },
    thumbWrapper: { width: 40, height: 40, borderRadius: 6, overflow: 'hidden', backgroundColor: c.bg, marginRight: spacing(3) },
    productName: { fontSize: 14, fontWeight: '600', color: c.text },
    productMeta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    inCart: { fontSize: 12, fontWeight: '700', color: c.primary, marginRight: spacing(2) },
    addBtn: { backgroundColor: c.primary, borderRadius: 8, paddingHorizontal: spacing(3), paddingVertical: spacing(2) },
    addBtnText: { color: c.onPrimary, fontWeight: '700', fontSize: 13 },
    empty: { textAlign: 'center', color: c.textMuted, marginVertical: spacing(3) },
    section: { fontSize: 15, fontWeight: '700', color: c.text, marginTop: spacing(4), marginBottom: spacing(2) },
    cartRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 10, borderWidth: 1, borderColor: c.border, padding: spacing(3), marginBottom: spacing(2) },
    qtyBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border },
    qtyBtnText: { fontSize: 18, fontWeight: '700', color: c.primary },
    qty: { width: 32, textAlign: 'center', fontSize: 15, fontWeight: '700', color: c.text },
    totalsCard: { backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: spacing(4), marginTop: spacing(4) },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(2) },
    totalLabel: { fontSize: 14, color: c.textMuted },
    totalValue: { fontSize: 14, fontWeight: '600', color: c.text },
    feeInput: { borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: spacing(2), paddingVertical: spacing(1), fontSize: 14, width: 90, textAlign: 'right', backgroundColor: c.bg, color: c.text },
    grandTotalRow: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: spacing(2), marginBottom: 0 },
    grandTotalLabel: { fontSize: 16, fontWeight: '800', color: c.text },
    grandTotal: { fontSize: 20, fontWeight: '800', color: c.primary },
    paymentRow: { flexDirection: 'row', gap: spacing(2), marginTop: spacing(3) },
    payBtn: { flex: 1, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingVertical: spacing(2.5), alignItems: 'center' },
    payBtnActive: { borderColor: c.primary, backgroundColor: withAlpha(c.primary, 0.12) },
    payLabel: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    payLabelActive: { color: c.primary, fontWeight: '700' },
    completeBtn: { backgroundColor: c.success, borderRadius: 12, paddingVertical: spacing(4), alignItems: 'center', marginTop: spacing(4) },
    completeText: { color: c.onPrimary, fontWeight: '800', fontSize: 15 },
  });
}
