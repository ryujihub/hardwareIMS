import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@/navigation/useNewOrderNav';
import { useReceipt } from '@/navigation/useReceipt';
import { useNewOrder } from '@/hooks/useNewOrder';
import { useStyles } from '@/services/settings';
import { peso } from '@/utils/format';
import { colors, spacing, withAlpha, createStyleSheet } from '@/theme';
import type { CartItem } from '@/types';

export function CheckoutScreen() {
  const navigation = useNavigation();
  const receipt = useReceipt();
  const styles = useStyles(makeStyles);
  const {
    settings,
    cart,
    customerName,
    customerPhone,
    deliveryFee,
    payment,
    busy,
    enabledMethods,
    subtotal,
    feeNum,
    total,
    setCustomerName,
    setCustomerPhone,
    setDeliveryFee,
    setPayment,
    setBusy,
    changeQty,
    completeOrder,
  } = useNewOrder();

  const [localBusy, setLocalBusy] = useState(false);

  const handleComplete = useCallback(async () => {
    setLocalBusy(true);
    const ok = await completeOrder((order, items) => {
      // Show the printable receipt, then return to product selection behind it.
      receipt.show(order, items);
      navigation.goBack();
    });
    setLocalBusy(false);
    if (!ok) {
      // completeOrder already showed its own alert; stay on checkout.
    }
  }, [completeOrder, navigation, receipt]);

  return (
    <View style={styles.root}>
      {/* Header with back button */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name={navigation.canGoBack ? 'chevron-back' : 'close'} size={22} color={colors.onPrimary} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Checkout</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        {/* Customer details */}
        <Text style={styles.label}>Customer name *</Text>
        <TextInput
          style={styles.input}
          value={customerName}
          onChangeText={setCustomerName}
          placeholder="e.g. Juan Dela Cruz"
          autoFocus
        />

        <Text style={styles.label}>Phone</Text>
        <TextInput
          style={styles.input}
          value={customerPhone}
          onChangeText={setCustomerPhone}
          placeholder="09XX-XXX-XXXX"
          keyboardType="phone-pad"
        />

        {/* Cart summary (editable) */}
        {cart.length > 0 ? (
          <View style={styles.cartSection}>
            <Text style={styles.section}>🧾 Cart</Text>
            {cart.map((i) => (
              <View key={i.productId} style={styles.cartRow}>
                {i.image_url ? (
                  <View style={[styles.thumbWrapper, { width: 36, height: 36, marginRight: spacing(2) }]}>
                    <Image source={{ uri: i.image_url }} style={{ width: 36, height: 36, borderRadius: 6 }} onError={(e) => console.warn('Image failed:', i.image_url, e.nativeEvent.error)} />
                  </View>
                ) : (
                  <View style={[styles.thumbWrapper, { width: 36, height: 36, marginRight: spacing(2), backgroundColor: colors.bg }]} />
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
          </View>
        ) : (
          <View style={styles.emptyCartBanner}>
            <Text style={styles.emptyCartText}>Your cart is empty.</Text>
            <Pressable onPress={() => navigation.goBack()} style={styles.emptyCartLink}>
              <Text style={styles.emptyCartLinkText}>Add products ←</Text>
            </Pressable>
          </View>
        )}

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
        <Text style={styles.label}>Payment</Text>
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

        {/* Complete order */}
        <Pressable
          style={[styles.completeBtn, (busy || localBusy || cart.length === 0) && { opacity: 0.5 }]}
          onPress={handleComplete}
          disabled={busy || localBusy || cart.length === 0}
        >
          <Text style={styles.completeText}>
            {busy || localBusy ? 'Saving…' : `✓ COMPLETE ORDER — ${peso(total)}`}
          </Text>
        </Pressable>

        <View style={{ height: spacing(2) }} />
      </ScrollView>
    </View>
  );
}

function makeStyles(c: import('@/theme').Palette) {
  return createStyleSheet({
    root: { flex: 1, backgroundColor: c.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing(4), paddingBottom: spacing(2), borderBottomWidth: 1, borderBottomColor: c.border },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing(1), padding: spacing(1) },
    backText: { fontSize: 14, fontWeight: '600', color: c.onPrimary },
    title: { fontSize: 20, fontWeight: '800', color: c.primary },
    content: { padding: spacing(4), paddingTop: spacing(2), paddingBottom: spacing(8) },
    label: { fontSize: 12, fontWeight: '600', color: c.textMuted, marginBottom: spacing(1), marginTop: spacing(3) },
    input: { borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: spacing(3), paddingVertical: spacing(3), fontSize: 15, backgroundColor: c.card, marginBottom: spacing(2), color: c.text },
    cartSection: { marginTop: spacing(2) },
    section: { fontSize: 15, fontWeight: '700', color: c.text, marginBottom: spacing(2) },
    cartRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 10, borderWidth: 1, borderColor: c.border, padding: spacing(3), marginBottom: spacing(2) },
    thumbWrapper: { width: 40, height: 40, borderRadius: 6, overflow: 'hidden', backgroundColor: c.bg, marginRight: spacing(3) },
    productName: { fontSize: 14, fontWeight: '600', color: c.text },
    productMeta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    qtyBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border },
    qtyBtnText: { fontSize: 18, fontWeight: '700', color: c.primary },
    qty: { width: 32, textAlign: 'center', fontSize: 15, fontWeight: '700', color: c.text },
    emptyCartBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.card, borderRadius: 10, borderWidth: 1, borderColor: c.border, padding: spacing(3), marginTop: spacing(2) },
    emptyCartText: { fontSize: 14, color: c.textMuted },
    emptyCartLink: { padding: spacing(1) },
    emptyCartLinkText: { fontSize: 13, fontWeight: '600', color: c.primary },
    totalsCard: { backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: spacing(4), marginTop: spacing(4) },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(2) },
    totalLabel: { fontSize: 14, color: c.textMuted },
    totalValue: { fontSize: 14, fontWeight: '600', color: c.text },
    feeInput: { borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: spacing(2), paddingVertical: spacing(1), fontSize: 14, width: 90, textAlign: 'right', backgroundColor: c.bg, color: c.text },
    grandTotalRow: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: spacing(2), marginBottom: 0 },
    grandTotalLabel: { fontSize: 16, fontWeight: '800', color: c.text },
    grandTotal: { fontSize: 20, fontWeight: '800', color: c.primary },
    paymentRow: { flexDirection: 'row', gap: spacing(2), marginTop: spacing(2) },
    payBtn: { flex: 1, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingVertical: spacing(2.5), alignItems: 'center' },
    payBtnActive: { borderColor: c.primary, backgroundColor: withAlpha(c.primary, 0.12) },
    payLabel: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    payLabelActive: { color: c.primary, fontWeight: '700' },
    completeBtn: { backgroundColor: c.success, borderRadius: 12, paddingVertical: spacing(4), alignItems: 'center', marginTop: spacing(4) },
    completeText: { color: c.onPrimary, fontWeight: '800', fontSize: 15 },
  });
}
