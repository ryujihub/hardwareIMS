import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '@/services/auth';
import { colors, spacing } from '@/theme';
import { HomeScreen } from '@/screens/staff/HomeScreen';
import { NewOrderScreen } from '@/screens/staff/NewOrderScreen';
import { StockScreen } from '@/screens/staff/StockScreen';
import { AdminScreen } from '@/screens/admin/AdminScreen';
import { LogsScreen } from '@/screens/admin/LogsScreen';
import { ReceiptScreen } from '@/screens/staff/ReceiptScreen';
import type { Order, OrderItem } from '@/types';

const TABS = [
  { key: 'home', label: 'Home', icon: '🏠', staffAllowed: true },
  { key: 'new', label: 'New Order', icon: '🛒', staffAllowed: true },
  { key: 'stock', label: 'Stock', icon: '📦', staffAllowed: true },
  { key: 'logs', label: 'Logs', icon: '📚', staffAllowed: false },
  { key: 'admin', label: 'Admin', icon: '📊', staffAllowed: false },
] as const;

export type TabKey = (typeof TABS)[number]['key'];

export function MainTabs() {
  const { profile } = useAuth();
  const isStaff = profile?.role === 'staff';

  // Staff: Home (check-in/out), New Order, Stock only. Manager/admin: everything.
  const visibleTabs = TABS.filter((t) => !isStaff || t.staffAllowed);

  const [rawTab, setTab] = useState<TabKey>('home');
  const [receipt, setReceipt] = useState<{ order: Order; items?: OrderItem[] } | null>(null);

  // Guard against a stale tab if role changed mid-session
  const tab: TabKey = visibleTabs.some((t) => t.key === rawTab) ? rawTab : 'home';

  // Receipt renders full-screen above the tabs until closed
  if (receipt) {
    return <ReceiptScreen order={receipt.order} items={receipt.items} onClose={() => setReceipt(null)} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1 }}>
        {tab === 'home' && (
          <HomeScreen onNewOrder={() => setTab('new')} onGoStock={() => setTab('stock')} />
        )}
        {tab === 'new' && (
          <NewOrderScreen
            onOrderPlaced={(order, items) => setReceipt({ order, items })}
          />
        )}
        {tab === 'stock' && <StockScreen />}
        {tab === 'logs' && <LogsScreen />}
        {tab === 'admin' && <AdminScreen />}
      </View>

      <View
        style={{
          flexDirection: 'row',
          backgroundColor: colors.white,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingBottom: spacing(2),
        }}
      >
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
