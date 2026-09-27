import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  fetchAttendanceLogs,
  fetchSalesLogs,
  fetchStockLogs,
  matchesQuery,
  type AttendanceLogRow,
  type SalesLogRow,
  type StockLogRow,
} from '@/services/logs';
import { useSupabaseRealtime } from '@/services/useSupabaseRealtime';
import { peso, formatDateTime } from '@/utils/format';
import { colors, spacing } from '@/theme';

type LogTab = 'sales' | 'stock' | 'attendance';

const TABS: { key: LogTab; label: string; icon: string }[] = [
  { key: 'sales', label: 'Sales', icon: '🧾' },
  { key: 'stock', label: 'Stock', icon: '📦' },
  { key: 'attendance', label: 'Attendance', icon: '🕒' },
];

export function LogsScreen() {
  const [tab, setTab] = useState<LogTab>('sales');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<SalesLogRow[]>([]);
  const [stock, setStock] = useState<StockLogRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceLogRow[]>([]);
  const realtimeChanges = useSupabaseRealtime(['orders', 'products']);

  const load = useCallback(async () => {
    const [s, st, a] = await Promise.all([fetchSalesLogs(), fetchStockLogs(), fetchAttendanceLogs()]);
    setSales(s);
    setStock(st);
    setAttendance(a);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // New orders / stock changes appear here live
  useEffect(() => {
    if (realtimeChanges > 0) void load();
  }, [realtimeChanges, load]);

  const filteredSales = useMemo(
    () => sales.filter((r) => matchesQuery(query, r.customer_name, r.staff_name, r.payment_method, r.status)),
    [sales, query]
  );
  const filteredStock = useMemo(
    () => stock.filter((r) => matchesQuery(query, r.product_name, r.staff_name, r.reason)),
    [stock, query]
  );
  const filteredAttendance = useMemo(
    () => attendance.filter((r) => matchesQuery(query, r.staff_name, r.action)),
    [attendance, query]
  );

  return (
    <View style={styles.root}>
      <Text style={styles.title}>📚 Logs</Text>

      {/* Segmented tabs */}
      <View style={styles.tabsRow}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
              {t.icon} {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder="🔍 Search logs…"
        placeholderTextColor={colors.textMuted}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {tab === 'sales' && (
            <>
              {filteredSales.map((r) => (
                <View key={r.id} style={styles.card}>
                  <View style={styles.rowTop}>
                    <Text style={styles.primaryText}>{r.customer_name}</Text>
                    <Text style={[styles.amount, r.status === 'cancelled' && styles.cancelled]}>
                      {r.status === 'cancelled' ? 'CANCELLED' : peso(r.total)}
                    </Text>
                  </View>
                  <Text style={styles.subText}>
                    {r.staff_name} · {r.payment_method.toUpperCase()} · {r.payment_status.toUpperCase()}
                  </Text>
                  <Text style={styles.timeText}>{formatDateTime(r.created_at)}</Text>
                </View>
              ))}
              {filteredSales.length === 0 && <EmptyNote />}
            </>
          )}

          {tab === 'stock' && (
            <>
              {filteredStock.map((r) => (
                <View key={r.id} style={styles.card}>
                  <View style={styles.rowTop}>
                    <Text style={styles.primaryText}>{r.product_name}</Text>
                    <Text style={[styles.amount, r.delta >= 0 ? styles.stockUp : styles.stockDown]}>
                      {r.delta >= 0 ? '+' : ''}
                      {r.delta}
                    </Text>
                  </View>
                  <Text style={styles.subText}>
                    {r.staff_name} · {r.reason ?? 'manual'}
                  </Text>
                  <Text style={styles.timeText}>{formatDateTime(r.created_at)}</Text>
                </View>
              ))}
              {filteredStock.length === 0 && <EmptyNote />}
            </>
          )}

          {tab === 'attendance' && (
            <>
              {filteredAttendance.map((r) => (
                <View key={r.id} style={styles.card}>
                  <View style={styles.rowTop}>
                    <Text style={styles.primaryText}>{r.staff_name}</Text>
                    <Text
                      style={[
                        styles.badge,
                        r.action === 'check_in' ? styles.badgeIn : styles.badgeOut,
                      ]}
                    >
                      {r.action === 'check_in' ? '✅ CHECK IN' : '🏁 CHECK OUT'}
                    </Text>
                  </View>
                  <Text style={styles.timeText}>{formatDateTime(r.at)}</Text>
                </View>
              ))}
              {filteredAttendance.length === 0 && <EmptyNote />}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function EmptyNote() {
  return <Text style={styles.empty}>No log entries yet.</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: colors.primary, padding: spacing(4), paddingBottom: spacing(2) },
  tabsRow: { flexDirection: 'row', gap: spacing(2), paddingHorizontal: spacing(4), marginBottom: spacing(3) },
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: spacing(2),
    borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: colors.white, fontWeight: '700' },
  search: {
    backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
    marginHorizontal: spacing(4), marginBottom: spacing(3),
    paddingHorizontal: spacing(3), paddingVertical: spacing(2.5), fontSize: 14,
  },
  list: { padding: spacing(4), paddingTop: 0, paddingBottom: spacing(8) },
  card: {
    backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    padding: spacing(3.5), marginBottom: spacing(2.5),
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  primaryText: { fontSize: 14, fontWeight: '700', color: colors.text, flex: 1 },
  amount: { fontSize: 14, fontWeight: '800', color: colors.primary },
  cancelled: { color: colors.danger, fontSize: 12 },
  stockUp: { color: colors.success },
  stockDown: { color: colors.danger },
  subText: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  timeText: { fontSize: 11, color: colors.textMuted, marginTop: spacing(1) },
  badge: { fontSize: 11, fontWeight: '800', paddingHorizontal: spacing(2), paddingVertical: spacing(1), borderRadius: 8, overflow: 'hidden' },
  badgeIn: { color: colors.success, backgroundColor: colors.successBg },
  badgeOut: { color: colors.warning, backgroundColor: colors.warningBg },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing(6), fontSize: 14 },
});
