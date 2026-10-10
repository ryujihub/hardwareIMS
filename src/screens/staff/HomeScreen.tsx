import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/services/auth';
import { fetchProducts, fetchRecentOrders } from '@/services/db';
import { useSettings, useStyles } from '@/services/settings';
import { useSupabaseRealtime } from '@/services/useSupabaseRealtime';
import { peso, isSameLocalDay } from '@/utils/format';
import { isLowStock } from '@/utils/stock';
import { colors, spacing, createStyleSheet } from '@/theme';
import type { Order, Product } from '@/types';

interface Props {
  onNewOrder: () => void;
  onGoStock: () => void;
}

export function HomeScreen({ onNewOrder, onGoStock }: Props) {
  const { profile, checkedIn, setCheckedIn, signOut } = useAuth();
  const { settings } = useSettings();
  const styles = useStyles(makeStyles);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const realtimeChanges = useSupabaseRealtime(['products', 'orders']);

  const load = useCallback(async () => {
    const [p, o] = await Promise.all([fetchProducts(), fetchRecentOrders(50)]);
    setProducts(p.data);
    setOrders(o.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Live updates: refetch whenever another device changes products or orders
  useEffect(() => {
    if (realtimeChanges > 0) void load();
  }, [realtimeChanges, load]);

  // Refresh when returning to this tab
  useEffect(() => {
    const interval = setInterval(() => void load(), 30000);
    return () => clearInterval(interval);
  }, [load]);

  const todayOrders = orders.filter((o) => isSameLocalDay(o.created_at));
  const todaySales = todayOrders.reduce((sum, o) => sum + Number(o.total), 0);
  const lowStock = products.filter((p) => isLowStock(p, settings.low_stock_threshold));

  async function toggleCheckIn() {
    const next = !checkedIn;
    await setCheckedIn(next);
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.brand}>🏢 {settings.store_name}</Text>
        <Pressable
          style={styles.signOutBtn}
          onPress={() => {
            Alert.alert('Sign out', 'End your shift and log out?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign Out', style: 'destructive', onPress: () => void signOut() },
            ]);
          }}
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      </View>

      {/* Check-in card */}
      <Pressable
        style={[styles.card, styles.checkInCard, checkedIn ? styles.checkedIn : styles.checkedOut]}
        onPress={toggleCheckIn}
      >
        <Text style={styles.checkInIcon}>{checkedIn ? '✅' : '👤'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.checkInName}>{profile?.name ?? 'Staff'}</Text>
          <Text style={styles.checkInStatus}>
            {checkedIn ? 'Checked In — tap to check out' : 'Checked Out — tap to check in'}
          </Text>
        </View>
      </Pressable>

      {/* Today's stats */}
      <View style={styles.statsRow}>
        <View style={[styles.card, styles.statCard]}>
          <Text style={styles.statLabel}>Today's Orders</Text>
          <Text style={styles.statValue}>{todayOrders.length}</Text>
        </View>
        <View style={[styles.card, styles.statCard]}>
          <Text style={styles.statLabel}>Today's Sales</Text>
          <Text style={styles.statValue}>{peso(todaySales)}</Text>
        </View>
      </View>

      {/* Quick actions */}
      <View style={styles.actionsRow}>
        <Pressable
          style={[styles.actionBtn, { backgroundColor: colors.primary, opacity: checkedIn ? 1 : 0.5 }]}
          onPress={() => {
            if (!checkedIn) {
              Alert.alert('Check in required', 'You must check in to create a new order.');
              return;
            }
            onNewOrder();
          }}
        >
          <Text style={styles.actionIcon}>🛒</Text>
          <Text style={styles.actionText}>New Order</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, { backgroundColor: colors.primaryLight }]} onPress={onGoStock}>
          <Text style={styles.actionIcon}>📦</Text>
          <Text style={styles.actionText}>Stock</Text>
        </Pressable>
      </View>

      {/* Low stock */}
      <Text style={styles.sectionTitle}>⚠️ Low Stock Alerts</Text>
      {lowStock.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyText}>All stock levels are healthy 👍</Text>
        </View>
      ) : (
        lowStock.slice(0, 5).map((p) => (
          <View key={p.id} style={styles.card}>
            <View style={styles.lowRow}>
              <Text style={styles.lowName}>{p.name}</Text>
              <Text style={[styles.lowBadge, p.stock === 0 ? styles.outBadge : null]}>
                {p.stock === 0 ? 'OUT OF STOCK' : `${p.stock} left`}
              </Text>
            </View>
            <Text style={styles.lowSub}>Reorder point: {p.reorder_point > 0 ? p.reorder_point : settings.low_stock_threshold}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function makeStyles(c: import('@/theme').Palette) {
  return createStyleSheet({
    root: { flex: 1, backgroundColor: c.bg },
    content: { padding: spacing(4), paddingBottom: spacing(8) },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(4) },
    brand: { fontSize: 20, fontWeight: '800', color: c.primary, flex: 1 },
    signOutBtn: { borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 8, paddingHorizontal: spacing(3), paddingVertical: spacing(1.5) },
    signOutText: { color: c.danger, fontWeight: '700', fontSize: 13 },
    card: { backgroundColor: c.card, borderRadius: 12, padding: spacing(4), marginBottom: spacing(3), borderWidth: 1, borderColor: c.border },
    checkInCard: { flexDirection: 'row', alignItems: 'center' },
    checkedIn: { backgroundColor: c.successBg, borderColor: c.success },
    checkedOut: { backgroundColor: c.dangerBg, borderColor: c.danger },
    checkInIcon: { fontSize: 32, marginRight: spacing(3) },
    checkInName: { fontSize: 17, fontWeight: '700', color: c.text },
    checkInStatus: { fontSize: 13, color: c.textMuted, marginTop: 2 },
    statsRow: { flexDirection: 'row', gap: spacing(3) },
    statCard: { flex: 1, alignItems: 'center' },
    statLabel: { fontSize: 12, color: c.textMuted },
    statValue: { fontSize: 20, fontWeight: '800', color: c.primary, marginTop: spacing(1) },
    actionsRow: { flexDirection: 'row', gap: spacing(3), marginBottom: spacing(3) },
    actionBtn: { flex: 1, borderRadius: 12, paddingVertical: spacing(4), alignItems: 'center' },
    actionIcon: { fontSize: 26 },
    actionText: { color: c.onPrimary, fontWeight: '700', marginTop: spacing(1) },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: c.text, marginTop: spacing(3), marginBottom: spacing(3) },
    lowRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    lowName: { fontSize: 15, fontWeight: '600', color: c.text, flex: 1 },
    lowBadge: { fontSize: 12, fontWeight: '700', color: c.warning, backgroundColor: c.warningBg, paddingHorizontal: spacing(2), paddingVertical: spacing(1), borderRadius: 8, overflow: 'hidden' },
    outBadge: { color: c.danger, backgroundColor: c.dangerBg },
    lowSub: { fontSize: 12, color: c.textMuted, marginTop: spacing(1) },
    emptyText: { color: c.textMuted, fontSize: 14, textAlign: 'center' },
  });
}
