import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { startOfDay, endOfDay } from '@/utils/dates';
import { useAuth } from '@/services/auth';
import { useStyles } from '@/services/settings';
import { fetchProfiles, fetchRecentOrdersInRange, setOrderStatus, updatePayment, getOrderItems, deleteOrder } from '@/services/db';
import { peso } from '@/utils/format';
import { colors, spacing, createStyleSheet } from '@/theme';
import type { Order, OrderItem, OrderStatus, PaymentMethod, PaymentStatus, Profile } from '@/types';

const PAGE = 10;

const STATUS_OPTIONS: { key: OrderStatus; label: string; color: string }[] = [
  { key: 'completed', label: 'Completed', color: colors.success },
  { key: 'pending',   label: 'Pending',   color: colors.warning },
  { key: 'cancelled', label: 'Cancelled', color: colors.danger  },
];

const PAYMENT_OPTIONS: { key: PaymentStatus; label: string }[] = [
  { key: 'paid',    label: 'Paid' },
  { key: 'partial', label: 'Partial' },
  { key: 'unpaid',  label: 'Unpaid' },
];

interface Props {
  onBack: () => void;
}

export function RecentOrdersScreen({ onBack }: Props) {
  const { profile } = useAuth();
  const styles  = useStyles(makeStyles);

  const [from, setFrom]   = useState(() => startOfDay(new Date(Date.now() - 7 * 86400000)).toISOString());
  const [to,   setTo]     = useState(() => endOfDay(new Date()).toISOString());
  const [orders, setOrders] = useState<Order[]>([]);
  const [staff,  setStaff]  = useState<Profile[]>([]);
  const [visible, setVisible] = useState(PAGE);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const staffName = useCallback(
    (id: string | null) => (id ? staff.find((s) => s.id === id)?.name ?? 'Unknown' : '—'),
    [staff]
  );

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [o, p] = await Promise.all([
        fetchRecentOrdersInRange(from, to, 200),
        fetchProfiles(),
      ]);
      setOrders(o.data);
      setStaff(p);
      setVisible(PAGE);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  // Summary stats
  const totalRevenue  = orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + Number(o.total), 0);
  const completedCount = orders.filter(o => o.status === 'completed').length;
  const pendingCount   = orders.filter(o => o.status === 'pending').length;

  if (!profile || (profile.role !== 'admin' && profile.role !== 'manager')) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>🔒 Admin access only</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={onBack} hitSlop={12}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <Text style={styles.title}>📋 Recent Orders</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Date range filter */}
        <View style={styles.filterCard}>
          <Text style={styles.filterLabel}>Date Range</Text>
          <View style={styles.filterRow}>
            <View style={styles.filterField}>
              <Text style={styles.fieldLabel}>From</Text>
              <TextInput
                style={styles.dateInput}
                value={from.slice(0, 10)}
                onChangeText={(t) => setFrom(startOfDay(new Date(t)).toISOString())}
                placeholder="YYYY-MM-DD"
                autoCapitalize="none"
              />
            </View>
            <View style={styles.filterField}>
              <Text style={styles.fieldLabel}>To</Text>
              <TextInput
                style={styles.dateInput}
                value={to.slice(0, 10)}
                onChangeText={(t) => setTo(endOfDay(new Date(t)).toISOString())}
                placeholder="YYYY-MM-DD"
                autoCapitalize="none"
              />
            </View>
            <Pressable
              style={styles.quickBtn}
              onPress={() => {
                setFrom(startOfDay(new Date(Date.now() - 7 * 86400000)).toISOString());
                setTo(endOfDay(new Date()).toISOString());
              }}
            >
              <Text style={styles.quickBtnText}>Last 7d</Text>
            </Pressable>
            <Pressable
              style={styles.quickBtn}
              onPress={() => {
                setFrom(startOfDay(new Date(Date.now() - 30 * 86400000)).toISOString());
                setTo(endOfDay(new Date()).toISOString());
              }}
            >
              <Text style={styles.quickBtnText}>Last 30d</Text>
            </Pressable>
          </View>
        </View>

        {/* Summary strip */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{orders.length}</Text>
            <Text style={styles.statLbl}>Total</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: colors.success }]}>{completedCount}</Text>
            <Text style={styles.statLbl}>Done</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: colors.warning }]}>{pendingCount}</Text>
            <Text style={styles.statLbl}>Pending</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{peso(totalRevenue)}</Text>
            <Text style={styles.statLbl}>Revenue</Text>
          </View>
        </View>

        {loading ? (
          <Text style={styles.empty}>Loading…</Text>
        ) : error ? (
          <View style={styles.card}>
            <Text style={styles.errText}>Could not load orders: {error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => void load()}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : orders.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.empty}>No orders in this date range.</Text>
          </View>
        ) : (
          <>
            {orders.slice(0, visible).map((o) => (
              <OrderRow key={o.id} order={o} staffName={staffName(o.staff_id)} onChanged={load} />
            ))}

            {visible < orders.length ? (
              <Pressable style={styles.seeMoreBtn} onPress={() => setVisible((v) => Math.min(v + PAGE, orders.length))}>
                <Text style={styles.seeMoreText}>▼ Load More ({orders.length - visible} remaining)</Text>
              </Pressable>
            ) : orders.length > PAGE ? (
              <Pressable style={styles.seeMoreBtn} onPress={() => setVisible(PAGE)}>
                <Text style={styles.seeMoreText}>▲ Show Less</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Order row (expand to edit status / payment) ──────────────────────────────

function OrderRow({ order, staffName, onChanged }: { order: Order; staffName: string; onChanged: () => void }) {
  const styles = useStyles(makeStyles);
  const [expanded, setExpanded] = useState(false);
  const [amountPaid, setAmountPaid] = useState(String(order.amount_paid ?? 0));
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const statusMeta   = STATUS_OPTIONS.find((s) => s.key === order.status);
  const payStatus: PaymentStatus = order.payment_status ?? 'unpaid';

  useEffect(() => {
    if (expanded && items.length === 0) {
      setLoadingItems(true);
      void getOrderItems(order.id).then((res) => {
        setItems(res);
        setLoadingItems(false);
      });
    }
  }, [expanded, order.id, items.length]);

  async function changeStatus(status: OrderStatus) {
    const { error } = await setOrderStatus(order.id, status);
    if (error) Alert.alert('Error', error);
    setExpanded(false);
    onChanged();
  }

  async function savePayment(ps: PaymentStatus) {
    const { error } = await updatePayment(order.id, ps, parseFloat(amountPaid) || 0);
    if (error) Alert.alert('Error', error);
    onChanged();
  }

  function confirmDelete() {
    Alert.alert(
      'Delete Order',
      'Are you sure you want to completely remove this order? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await deleteOrder(order.id);
            if (error) Alert.alert('Error', error);
            else {
              setExpanded(false);
              onChanged();
            }
          },
        },
      ]
    );
  }

  const statusColor = statusMeta?.color ?? colors.textMuted;

  return (
    <View style={styles.card}>
      <Pressable onPress={() => setExpanded((e) => !e)}>
        <View style={styles.rowHeader}>
          {/* Left: name + meta */}
          <View style={{ flex: 1 }}>
            <Text style={styles.custName}>{order.customer_name}</Text>
            <Text style={styles.meta}>{staffName} · {new Date(order.created_at).toLocaleString()}</Text>
            <View style={styles.badgeRow}>
              <Text style={[styles.badge, { backgroundColor: `${statusColor}22`, color: statusColor }]}>
                {statusMeta?.label ?? order.status}
              </Text>
              {order.payment_status !== 'paid' && (
                <Text style={[styles.badge, { backgroundColor: colors.warningBg, color: colors.warning }]}>
                  {(order.payment_status ?? 'unpaid').toUpperCase()}
                </Text>
              )}
            </View>
          </View>

          {/* Right: total + chevron */}
          <View style={styles.rowRight}>
            <Text style={styles.total}>{peso(Number(order.total))}</Text>
            <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
          </View>
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.expandBox}>
          {/* Status chips */}
          <Text style={styles.fieldLabel}>Order Status</Text>
          <View style={styles.chipRow}>
            {STATUS_OPTIONS.map((s) => (
              <Pressable
                key={s.key}
                style={[styles.chip, order.status === s.key && { backgroundColor: s.color, borderColor: s.color }]}
                onPress={() => void changeStatus(s.key)}
              >
                <Text style={[styles.chipText, order.status === s.key && styles.chipTextActive]}>{s.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Payment */}
          <Text style={styles.fieldLabel}>Amount Received (₱)</Text>
          <TextInput
            style={styles.amtInput}
            value={amountPaid}
            onChangeText={setAmountPaid}
            keyboardType="decimal-pad"
          />
          <View style={styles.chipRow}>
            {PAYMENT_OPTIONS.map((p) => (
              <Pressable
                key={p.key}
                style={[styles.chip, payStatus === p.key && styles.chipActive]}
                onPress={() => void savePayment(p.key)}
              >
                <Text style={[styles.chipText, payStatus === p.key && styles.chipTextActive]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Order Items */}
          <Text style={styles.fieldLabel}>Items Purchased</Text>
          <View style={styles.itemsBox}>
            {loadingItems ? (
              <Text style={styles.emptyItems}>Loading items…</Text>
            ) : items.length === 0 ? (
              <Text style={styles.emptyItems}>No items recorded.</Text>
            ) : (
              items.map((i) => (
                <View key={i.id} style={styles.itemRow}>
                  <Text style={styles.itemQty}>{i.quantity}x</Text>
                  <Text style={styles.itemName}>{i.name}</Text>
                  <Text style={styles.itemPrice}>{peso(i.price * i.quantity)}</Text>
                </View>
              ))
            )}
          </View>

          {/* Delete Action */}
          <View style={styles.deleteRow}>
            <Pressable style={styles.deleteBtn} onPress={confirmDelete}>
              <Text style={styles.deleteBtnText}>Delete Order</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: import('@/theme').Palette) {
  return createStyleSheet({
    root:    { flex: 1, backgroundColor: c.bg },
    center:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header:  {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: spacing(4), paddingTop: spacing(5), paddingBottom: spacing(3),
      borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.card,
    },
    backBtn:  { marginRight: spacing(3) },
    backIcon: { fontSize: 22, color: c.primary, fontWeight: '700' },
    title:    { fontSize: 18, fontWeight: '800', color: c.text },

    content: { padding: spacing(4), paddingBottom: spacing(8) },

    filterCard: {
      backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border,
      padding: spacing(4), marginBottom: spacing(3),
    },
    filterLabel: { fontSize: 12, fontWeight: '700', color: c.textMuted, marginBottom: spacing(2), textTransform: 'uppercase', letterSpacing: 0.5 },
    filterRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), alignItems: 'flex-end' },
    filterField: { flex: 1, minWidth: 110 },
    fieldLabel: { fontSize: 11, fontWeight: '600', color: c.textMuted, marginBottom: spacing(1) },
    dateInput: {
      borderWidth: 1, borderColor: c.border, borderRadius: 8,
      paddingHorizontal: spacing(3), paddingVertical: spacing(2),
      fontSize: 13, backgroundColor: c.bg, color: c.text,
    },
    quickBtn: {
      borderWidth: 1, borderColor: c.border, borderRadius: 8,
      paddingHorizontal: spacing(3), paddingVertical: spacing(2),
      backgroundColor: c.bg, alignSelf: 'flex-end',
    },
    quickBtnText: { fontSize: 12, fontWeight: '700', color: c.primary },

    statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginBottom: spacing(3) },
    statBox: {
      flex: 1, minWidth: 70,
      backgroundColor: c.card, borderRadius: 10, borderWidth: 1, borderColor: c.border,
      padding: spacing(3), alignItems: 'center',
    },
    statNum: { fontSize: 15, fontWeight: '800', color: c.primary },
    statLbl: { fontSize: 10, color: c.textMuted, marginTop: 2 },

    card: {
      backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border,
      padding: spacing(4), marginBottom: spacing(2),
    },
    rowHeader:  { flexDirection: 'row', alignItems: 'flex-start' },
    rowRight:   { alignItems: 'flex-end', gap: spacing(1) },
    custName:   { fontSize: 14, fontWeight: '700', color: c.text },
    meta:       { fontSize: 12, color: c.textMuted, marginTop: 2 },
    badgeRow:   { flexDirection: 'row', gap: spacing(1), marginTop: spacing(1) },
    badge:      { fontSize: 10, fontWeight: '800', paddingHorizontal: spacing(1.5), paddingVertical: 2, borderRadius: 6, overflow: 'hidden', textTransform: 'uppercase' },
    total:      { fontSize: 15, fontWeight: '800', color: c.primary },
    chevron:    { fontSize: 11, color: c.textMuted },

    expandBox: { borderTopWidth: 1, borderTopColor: c.border, marginTop: spacing(3), paddingTop: spacing(3) },
    chipRow:   { flexDirection: 'row', gap: spacing(2), marginBottom: spacing(3), flexWrap: 'wrap' },
    chip:      { paddingHorizontal: spacing(3), paddingVertical: spacing(1.5), borderRadius: 20, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border },
    chipActive: { backgroundColor: c.primary, borderColor: c.primary },
    chipText:   { fontSize: 12, color: c.textMuted },
    chipTextActive: { color: c.onPrimary, fontWeight: '700' },
    amtInput: {
      borderWidth: 1, borderColor: c.border, borderRadius: 8,
      paddingHorizontal: spacing(3), paddingVertical: spacing(2),
      fontSize: 14, backgroundColor: c.bg, color: c.text, marginBottom: spacing(3),
    },

    itemsBox: { backgroundColor: c.bg, borderRadius: 8, padding: spacing(3), marginBottom: spacing(4), borderWidth: 1, borderColor: c.border },
    itemRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: spacing(1) },
    itemQty: { fontSize: 13, fontWeight: '700', color: c.textMuted, width: 32 },
    itemName: { flex: 1, fontSize: 13, color: c.text },
    itemPrice: { fontSize: 13, fontWeight: '600', color: c.text, textAlign: 'right', minWidth: 60 },
    emptyItems: { fontSize: 13, color: c.textMuted, fontStyle: 'italic' },
    
    deleteRow: { marginTop: spacing(-1), borderTopWidth: 1, borderTopColor: c.border, paddingTop: spacing(3), alignItems: 'center' },
    deleteBtn: { backgroundColor: c.dangerBg, paddingHorizontal: spacing(3), paddingVertical: spacing(2), borderRadius: 8, borderWidth: 1, borderColor: c.danger },
    deleteBtnText: { color: c.danger, fontWeight: '700', fontSize: 12 },

    errText:   { color: c.danger, fontSize: 13, marginBottom: spacing(2) },
    retryBtn:  { alignSelf: 'flex-start', paddingHorizontal: spacing(3), paddingVertical: spacing(2), borderRadius: 8, backgroundColor: c.primary },
    retryText: { color: c.onPrimary, fontWeight: '700', fontSize: 13 },
    empty:     { color: c.textMuted, textAlign: 'center', padding: spacing(4), fontSize: 13 },

    seeMoreBtn: {
      alignItems: 'center', paddingVertical: spacing(3), marginBottom: spacing(3),
      borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg,
    },
    seeMoreText: { fontSize: 13, fontWeight: '700', color: c.primary },
  });
}
