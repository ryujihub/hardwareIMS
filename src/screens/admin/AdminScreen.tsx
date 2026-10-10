import React, { useEffect, useState } from 'react';
import { Dimensions, Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth } from '@/services/auth';
import { fetchProducts } from '@/services/db';
import { useSettings, useStyles } from '@/services/settings';
import { isLowStock } from '@/utils/stock';
import { peso } from '@/utils/format';
import { spacing, createStyleSheet } from '@/theme';
import type { Product } from '@/types';
import { RecentOrdersScreen } from './RecentOrdersScreen';
import { DailySalesScreen }   from './DailySalesScreen';
import { SettingsScreen }     from './SettingsScreen';

type AdminSubScreen = 'dashboard' | 'orders' | 'sales' | 'settings';

export function AdminScreen() {
  const { profile }   = useAuth();
  const { settings }  = useSettings();
  const styles        = useStyles(makeStyles);
  const isWide        = Dimensions.get('window').width >= 768;
  const [sub, setSub] = useState<AdminSubScreen>('dashboard');

  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    void fetchProducts().then((r) => setProducts(r.data));
  }, []);

  const inventoryValue = products.reduce((s, p) => s + Number(p.price) * p.stock, 0);
  const lowStock       = products.filter((p) => isLowStock(p, settings.low_stock_threshold));

  if (!profile || (profile.role !== 'admin' && profile.role !== 'manager')) {
    return (
      <View style={styles.center}>
        <Text style={styles.lockedTitle}>🔒 Admin access only</Text>
        <Text style={styles.subEmpty}>Your role: {profile?.role ?? 'unknown'}</Text>
      </View>
    );
  }

  if (sub === 'orders')   return <RecentOrdersScreen onBack={() => setSub('dashboard')} />;
  if (sub === 'sales')    return <DailySalesScreen  onBack={() => setSub('dashboard')} />;
  if (sub === 'settings') return <SettingsScreen    onBack={() => setSub('dashboard')} />;

  const NAV: { key: AdminSubScreen; icon: string; title: string; sub: string }[] = [
    { key: 'orders',   icon: '📋', title: 'Recent Orders',  sub: 'View, filter and manage orders' },
    { key: 'sales',    icon: '📉', title: 'Daily Sales',    sub: 'Revenue summary & export' },
    { key: 'settings', icon: '⚙️', title: 'Settings & Roles', sub: 'Branding, theme, users' },
  ];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>📊 Admin Dashboard</Text>

      {/* Metric cards */}
      <View style={styles.statsGrid}>
        <View style={styles.card}>
          <Text style={styles.statLabel}>Inventory Value</Text>
          <Text style={styles.statValue}>{peso(inventoryValue)}</Text>
          <Text style={styles.statSub}>{products.length} products</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.statLabel}>Low-stock Items</Text>
          <Text style={styles.statValue}>{lowStock.length}</Text>
          <Text style={styles.statSub}>need restocking</Text>
        </View>
      </View>

      {/* Nav cards */}
      <View style={isWide ? styles.wideGrid : undefined}>
        {NAV.map((n) => (
          <Pressable key={n.key} style={styles.navCard} onPress={() => setSub(n.key)}>
            <View style={styles.navCardInner}>
              <View style={styles.navLeft}>
                <Text style={styles.navIcon}>{n.icon}</Text>
                <View>
                  <Text style={styles.navTitle}>{n.title}</Text>
                  <Text style={styles.navSub}>{n.sub}</Text>
                </View>
              </View>
              <Text style={styles.navArrow}>›</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function makeStyles(c: import('@/theme').Palette) {
  return createStyleSheet({
    root:    { flex: 1, backgroundColor: c.bg },
    content: { padding: spacing(4), paddingBottom: spacing(8) },
    center:  { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },
    lockedTitle: { fontSize: 17, fontWeight: '700', color: c.text },
    subEmpty: { fontSize: 13, color: c.textMuted, textAlign: 'center' },
    title:   { fontSize: 20, fontWeight: '800', color: c.primary, marginBottom: spacing(3) },

    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(3), marginBottom: spacing(4) },
    card: {
      backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border,
      padding: spacing(4), flexGrow: 1, minWidth: '45%',
    },
    statLabel: { fontSize: 12, color: c.textMuted },
    statValue: { fontSize: 19, fontWeight: '800', color: c.primary, marginTop: spacing(1) },
    statSub:   { fontSize: 11, color: c.textMuted, marginTop: 2 },

    wideGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(3) },
    navCard: {
      backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border,
      padding: spacing(4), marginBottom: spacing(3), flexGrow: 1, minWidth: '45%',
    },
    navCardInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    navLeft:  { flexDirection: 'row', alignItems: 'center', gap: spacing(3), flex: 1 },
    navIcon:  { fontSize: 26 },
    navTitle: { fontSize: 15, fontWeight: '700', color: c.text },
    navSub:   { fontSize: 12, color: c.textMuted, marginTop: spacing(0.5) },
    navArrow: { fontSize: 26, color: c.primary, fontWeight: '700' },
  });
}
