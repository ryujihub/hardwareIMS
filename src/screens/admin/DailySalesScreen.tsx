import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useStyles } from '@/services/settings';
import { fetchDailySales, exportSalesPdf, exportSalesCsv, type DailySalesRow } from '@/services/reports';
import { peso } from '@/utils/format';
import { colors, spacing, createStyleSheet } from '@/theme';

interface Props { onBack: () => void }

export function DailySalesScreen({ onBack }: Props) {
  const styles = useStyles(makeStyles);
  const [sales, setSales]     = useState<DailySalesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setSales(await fetchDailySales(30));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Summary totals
  const totalRevenue = sales.reduce((s, r) => s + Number(r.total_revenue), 0);
  const totalCost    = sales.reduce((s, r) => s + Number(r.total_cost || 0), 0);
  const totalProfit  = totalRevenue - totalCost;
  const totalOrders  = sales.reduce((s, r) => s + r.total_orders, 0);
  const bestDay      = sales.reduce<DailySalesRow | null>(
    (best, r) => (!best || Number(r.total_revenue) > Number(best.total_revenue) ? r : best),
    null
  );

  async function exportPdf() {
    if (sales.length === 0) return Alert.alert('No data', 'No sales recorded yet.');
    try {
      await exportSalesPdf(sales, 'Daily Sales Report');
    } catch (err) {
      Alert.alert('PDF export failed', err instanceof Error ? err.message : String(err));
    }
  }

  async function exportCsv() {
    if (sales.length === 0) return Alert.alert('No data', 'No sales recorded yet.');
    try {
      await exportSalesCsv(sales, 'daily_sales');
    } catch (err) {
      Alert.alert('CSV export failed', err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={onBack} hitSlop={12}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <Text style={styles.title}>📉 Daily Sales</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Summary strip */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{totalOrders}</Text>
            <Text style={styles.statLbl}>Total Orders</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{peso(totalRevenue)}</Text>
            <Text style={styles.statLbl}>Total Revenue</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: colors.success }]}>{peso(totalProfit)}</Text>
            <Text style={styles.statLbl}>Total Profit</Text>
          </View>
          {bestDay ? (
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{peso(Number(bestDay.total_revenue))}</Text>
              <Text style={styles.statLbl}>Best Day ({bestDay.day.slice(0, 10)})</Text>
            </View>
          ) : null}
        </View>

        {/* Export buttons */}
        <View style={styles.exportRow}>
          <Pressable style={[styles.exportBtn, { backgroundColor: colors.primary }]} onPress={exportPdf}>
            <Text style={styles.exportText}>⬇ Export PDF</Text>
          </Pressable>
          <Pressable style={[styles.exportBtn, { backgroundColor: colors.success }]} onPress={exportCsv}>
            <Text style={styles.exportText}>⬇ Export CSV</Text>
          </Pressable>
        </View>

        {/* Table */}
        {loading ? (
          <Text style={styles.empty}>Loading…</Text>
        ) : error ? (
          <View style={styles.card}>
            <Text style={styles.errText}>Could not load: {error}</Text>
          </View>
        ) : sales.length === 0 ? (
          <Text style={styles.empty}>No sales recorded yet.</Text>
        ) : (
          <View style={styles.card}>
            {/* Column headers */}
            <View style={[styles.row, styles.headerRow]}>
              <Text style={[styles.colDate, styles.colHead]}>Date</Text>
              <Text style={[styles.colOrders, styles.colHead]}>Orders</Text>
              <Text style={[styles.colRevenue, styles.colHead]}>Revenue</Text>
              <Text style={[styles.colProfit, styles.colHead]}>Profit</Text>
            </View>

            {sales.map((r, i) => {
              const profit = Number(r.total_revenue) - Number(r.total_cost || 0);
              return (
                <View key={r.day} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
                  <Text style={styles.colDate}>{r.day.slice(0, 10)}</Text>
                  <Text style={styles.colOrders}>{r.total_orders}</Text>
                  <Text style={styles.colRevenue}>{peso(Number(r.total_revenue))}</Text>
                  <Text style={styles.colProfit}>{peso(profit)}</Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(c: import('@/theme').Palette) {
  return createStyleSheet({
    root:    { flex: 1, backgroundColor: c.bg },
    header:  {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: spacing(4), paddingTop: spacing(5), paddingBottom: spacing(3),
      borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.card,
    },
    backBtn:  { marginRight: spacing(3) },
    backIcon: { fontSize: 22, color: c.primary, fontWeight: '700' },
    title:    { fontSize: 18, fontWeight: '800', color: c.text },

    content: { padding: spacing(4), paddingBottom: spacing(8) },

    statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginBottom: spacing(3) },
    statBox: {
      flex: 1, minWidth: 100,
      backgroundColor: c.card, borderRadius: 10, borderWidth: 1, borderColor: c.border,
      padding: spacing(3), alignItems: 'center',
    },
    statNum: { fontSize: 15, fontWeight: '800', color: c.primary },
    statLbl: { fontSize: 10, color: c.textMuted, marginTop: 2, textAlign: 'center' },

    exportRow: { flexDirection: 'row', gap: spacing(2), marginBottom: spacing(3) },
    exportBtn: { flex: 1, borderRadius: 8, paddingVertical: spacing(2.5), alignItems: 'center' },
    exportText: { color: c.onPrimary, fontWeight: '700', fontSize: 13 },

    card: {
      backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border,
      overflow: 'hidden', marginBottom: spacing(3),
    },
    headerRow: { backgroundColor: c.primary },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing(2), paddingHorizontal: spacing(3) },
    rowAlt: { backgroundColor: c.bg },
    colHead: { fontWeight: '700', color: c.onPrimary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
    colDate: { flex: 1, fontSize: 13, color: c.text },
    colOrders: { width: 56, textAlign: 'center', fontSize: 13, color: c.textMuted },
    colRevenue: { width: 85, textAlign: 'right', fontSize: 13, fontWeight: '700', color: c.primary },
    colProfit: { width: 85, textAlign: 'right', fontSize: 13, fontWeight: '700', color: c.success },

    errText: { color: c.danger, fontSize: 13, padding: spacing(3) },
    empty:   { color: c.textMuted, textAlign: 'center', padding: spacing(6), fontSize: 13 },
  });
}
