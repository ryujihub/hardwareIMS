import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/services/auth';
import { useStyles } from '@/services/settings';
import { colors, spacing, createStyleSheet } from '@/theme';
import { HomeScreen } from '@/screens/staff/HomeScreen';
import { ProductSelectionScreen } from '@/screens/staff/ProductSelectionScreen';
import { CheckoutScreen } from '@/screens/staff/CheckoutScreen';
import { StockScreen } from '@/screens/staff/StockScreen';
import { AdminScreen } from '@/screens/admin/AdminScreen';
import { LogsScreen } from '@/screens/admin/LogsScreen';
import { ReceiptScreen } from '@/screens/staff/ReceiptScreen';
import { setReceiptNav } from '@/navigation/useReceipt';
import { NewOrderProvider } from '@/hooks/useNewOrder';
import { setNewOrderNav } from './useNewOrderNav';
import type { Order, OrderItem } from '@/types';

const TABS = [
  { key: 'home', label: 'Home', icon: '🏠', staffAllowed: true },
  { key: 'new', label: 'New Order', icon: '🛒', staffAllowed: true },
  { key: 'stock', label: 'Stock', icon: '📦', staffAllowed: true },
  { key: 'logs', label: 'Logs', icon: '📚', staffAllowed: false },
  { key: 'admin', label: 'Admin', icon: '📊', staffAllowed: false },
] as const;

export type TabKey = (typeof TABS)[number]['key'];

type NewOrderScreen = 'selection' | 'checkout';

export function MainTabs() {
  const { profile } = useAuth();
  const styles = useStyles(makeStyles);
  const isStaff = profile?.role === 'staff';

  // Staff: Home (check-in/out), New Order, Stock only. Manager/admin: everything.
  // Also: staff cannot access New Order unless checked in.
  const visibleTabs = TABS.filter((t) => {
    if (!isStaff) return true;
    if (!t.staffAllowed) return false;
    if (t.key === 'new') return profile?.checked_in === true;
    return true;
  });

  const [rawTab, setTab] = useState<TabKey>('home');
  const [receipt, setReceipt] = useState<{ order: Order; items?: OrderItem[] } | null>(null);
  const [newOrderScreen, setNewOrderScreen] = useState<NewOrderScreen>('selection');

  // Guard against a stale tab if role changed mid-session
  const tab: TabKey = visibleTabs.some((t) => t.key === rawTab) ? rawTab : 'home';

  // Receipt renders full-screen above the tabs until closed
  if (receipt) {
    return <ReceiptScreen order={receipt.order} items={receipt.items} onClose={() => setReceipt(null)} />;
  }

  // Let any screen open the receipt (checkout does this once an order is saved).
  setReceiptNav({ show: (order, items) => setReceipt({ order, items }) });

  // Keep the shared navigation singleton in sync so the screens can navigate.
  setNewOrderNav({
    screen: newOrderScreen,
    navigate: (target: NewOrderScreen) => {
      setNewOrderScreen(target);
    },
    goBack: () => {
      setNewOrderScreen('selection');
    },
    canGoBack: newOrderScreen === 'checkout',
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1 }}>
        {tab === 'home' && (
          <HomeScreen onNewOrder={() => setTab('new')} onGoStock={() => setTab('stock')} />
        )}
        {tab === 'new' && (
          <NewOrderProvider>
            {newOrderScreen === 'checkout' ? (
              <CheckoutScreen />
            ) : (
              <ProductSelectionScreen />
            )}
          </NewOrderProvider>
        )}
        {tab === 'stock' && <StockScreen />}
        {tab === 'logs' && <LogsScreen />}
        {tab === 'admin' && <AdminScreen />}
      </View>

      <View style={styles.tabBar}>
        {visibleTabs.map((t) => {
          const focused = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={{ flex: 1, alignItems: 'center', paddingTop: spacing(2) }}
            >
              <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{t.icon}</Text>
              <Text
                style={{
                  fontSize: 11,
                  marginTop: 2,
                  color: focused ? colors.primary : colors.textMuted,
                  fontWeight: focused ? '700' : '400',
                }}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(c: import('@/theme').Palette) {
  return createStyleSheet({
    tabBar: {
      flexDirection: 'row',
      backgroundColor: c.card,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingBottom: spacing(2),
    },
  });
}
