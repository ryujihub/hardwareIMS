import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Dimensions, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase, ephemeralClient } from '@/services/supabase';
import { useAuth } from '@/services/auth';
import {
  fetchProducts,
  fetchRecentOrders,
  fetchSettings,
  setOrderStatus,
  updateDeliveryFee,
  updatePayment,
} from '@/services/db';
import { fetchDailySales, exportSalesPdf, exportSalesCsv, type DailySalesRow } from '@/services/reports';
import { getQueue } from '@/store/cache';
import { peso, isSameLocalDay } from '@/utils/format';
import { colors, spacing } from '@/theme';
import type { Order, OrderStatus, PaymentStatus, Product, Profile } from '@/types';

const STATUS_OPTIONS: { key: OrderStatus; label: string; color: string }[] = [
  { key: 'completed', label: 'Completed', color: colors.success },
  { key: 'pending', label: 'Pending', color: colors.warning },
  { key: 'cancelled', label: 'Cancelled', color: colors.danger },
];

const PAYMENT_OPTIONS: { key: PaymentStatus; label: string }[] = [
  { key: 'paid', label: 'Paid' },
  { key: 'partial', label: 'Partial' },
  { key: 'unpaid', label: 'Unpaid' },
];

export function AdminScreen() {
  const { profile } = useAuth();
  const isWide = Dimensions.get('window').width >= 768;

  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [sales, setSales] = useState<DailySalesRow[]>([]);
  const [offline, setOffline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const load = useCallback(async () => {
    const [p, o, s] = await Promise.all([fetchProducts(), fetchRecentOrders(100), fetchDailySales(14)]);
    setProducts(p.data);
    setOffline(p.offline);
    setOrders(o.data);
    setSales(s);
    setStaff(await fetchProfilesSafe());
    const queue = await getQueue();
    setPendingCount(queue.length);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const staffName = useCallback(
    (id: string | null) => (id ? staff.find((s) => s.id === id)?.name ?? 'Unknown' : '—'),
    [staff]
  );

  const todayOrders = useMemo(() => orders.filter((o) => isSameLocalDay(o.created_at)), [orders]);
  const todaySales = todayOrders.reduce((s, o) => s + Number(o.total), 0);
  const receivables = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((s, o) => s + Math.max(Number(o.total) - Number(o.amount_paid ?? 0), 0), 0);
  const inventoryValue = products.reduce((s, p) => s + Number(p.price) * p.stock, 0);
  const lowStock = products.filter((p) => p.stock <= p.reorder_point);

  const staffLeaderboard = useMemo(() => {
    const map = new Map<string, { name: string; orders: number; sales: number }>();
    orders.forEach((o) => {
      if (!o.staff_id || o.status === 'cancelled') return;
      const entry = map.get(o.staff_id) ?? { name: staffName(o.staff_id), orders: 0, sales: 0 };
      entry.orders += 1;
      entry.sales += Number(o.total);
      map.set(o.staff_id, entry);
    });
    return [...map.values()].sort((a, b) => b.sales - a.sales);
  }, [orders, staffName]);

  if (!profile || (profile.role !== 'admin' && profile.role !== 'manager')) {
    return (
      <View style={styles.center}>
        <Text style={styles.lockedTitle}>🔒 Admin access only</Text>
        <Text style={styles.subEmpty}>Your role: {profile?.role ?? 'unknown'}</Text>
      </View>
    );
  }

  const metrics = (
    <>
      <View style={styles.card}>
        <Text style={styles.statLabel}>Today's Orders</Text>
        <Text style={styles.statValue}>{todayOrders.length}</Text>
        <Text style={styles.statSub}>{orders.length} recent</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.statLabel}>Today's Sales</Text>
        <Text style={styles.statValue}>{peso(todaySales)}</Text>
        <Text style={styles.statSub}>{lowStock.length} low-stock items</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.statLabel}>Inventory Value</Text>
        <Text style={styles.statValue}>{peso(inventoryValue)}</Text>
        <Text style={styles.statSub}>{products.length} products</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.statLabel}>Receivables</Text>
        <Text style={styles.statValue}>{peso(receivables)}</Text>
        <Text style={styles.statSub}>unpaid + partial</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.statLabel}>Pending Sync</Text>
        <Text style={styles.statValue}>{pendingCount}</Text>
        <Text style={styles.statSub}>offline orders</Text>
      </View>
    </>
  );

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>📊 Admin Dashboard</Text>
      {offline ? <Text style={styles.offline}>📴 Offline — cached data</Text> : null}

      {/* Responsive: single column on phones, metrics | reports side-by-side ≥768px */}
      <View style={isWide ? styles.wideRow : null}>
        <View style={isWide ? styles.wideCol : null}>
          <View style={styles.statsGrid}>{metrics}</View>

          <Text style={styles.section}>📈 Recent Orders — tap to change status / payment</Text>
          {orders.slice(0, 12).map((o) => (
            <OrderRow key={o.id} order={o} staffName={staffName(o.staff_id)} onChanged={load} />
          ))}
          {orders.length === 0 ? (
            <View style={styles.card}><Text style={styles.subEmpty}>No orders yet.</Text></View>
          ) : null}
        </View>

        <View style={isWide ? styles.wideCol : null}>
          <Text style={styles.section}>📉 Daily Sales (last 14 days)</Text>
          <DailySalesCard sales={sales} />

          <Text style={styles.section}>🏆 Top Staff (recent)</Text>
          {staffLeaderboard.slice(0, 5).map((s, i) => (
            <View key={s.name} style={styles.card}>
              <Text style={styles.orderName}>{i + 1}. {s.name} — {s.orders} orders · {peso(s.sales)}</Text>
            </View>
          ))}

          <Text style={styles.section}>⚙️ Settings</Text>
          <SettingsCard onSaved={load} />

          <Text style={styles.section}>👥 Roles</Text>
          <RolesCard />
        </View>
      </View>
    </ScrollView>
  );
}

async function fetchProfilesSafe(): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select('*');
  return error || !data ? [] : (data as Profile[]);
}

// ---- Order row with status + payment editing ----
function OrderRow({ order, staffName, onChanged }: { order: Order; staffName: string; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [amountPaid, setAmountPaid] = useState(String(order.amount_paid ?? 0));
  const statusMeta = STATUS_OPTIONS.find((s) => s.key === order.status);
  const paymentStatus: PaymentStatus = order.payment_status ?? 'unpaid';

  async function changeStatus(status: OrderStatus) {
    const { error } = await setOrderStatus(order.id, status);
    if (error) Alert.alert('Error', error);
    setExpanded(false);
    onChanged();
  }

  async function savePayment(paymentStatus: PaymentStatus) {
    const { error } = await updatePayment(order.id, paymentStatus, parseFloat(amountPaid) || 0);
    if (error) Alert.alert('Error', error);
    onChanged();
  }

  return (
    <View style={styles.card}>
      <Pressable onPress={() => setExpanded((e) => !e)}>
        <View style={styles.orderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderName}>{order.customer_name}</Text>
            <Text style={styles.orderSub}>{staffName} · {new Date(order.created_at).toLocaleString()}</Text>
            <View style={styles.badgeRow}>
              <Text style={[styles.statusBadge, { backgroundColor: `${statusMeta?.color ?? colors.textMuted}22`, color: statusMeta?.color ?? colors.textMuted }]}>
                {statusMeta?.label ?? order.status}
              </Text>
              {order.payment_status !== 'paid' ? (
                <Text style={[styles.statusBadge, { backgroundColor: colors.warningBg, color: colors.warning }]}>
                  {(order.payment_status ?? 'unpaid').toUpperCase()}
                </Text>
              ) : null}
            </View>
          </View>
          <Text style={styles.orderTotal}>{peso(Number(order.total))}</Text>
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.expandBox}>
          <Text style={styles.label}>Status</Text>
          <View style={styles.btnRow}>
            {STATUS_OPTIONS.map((s) => (
              <Pressable
                key={s.key}
                style={[styles.chip, order.status === s.key && styles.chipActive]}
                onPress={() => void changeStatus(s.key)}
              >
                <Text style={[styles.chipText, order.status === s.key && styles.chipTextActive]}>{s.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Payment — amount received (₱)</Text>
          <TextInput style={styles.input} value={amountPaid} onChangeText={setAmountPaid} keyboardType="decimal-pad" />
          <View style={styles.btnRow}>
            {PAYMENT_OPTIONS.map((p) => (
              <Pressable
                key={p.key}
                style={[styles.chip, paymentStatus === p.key && styles.chipActive]}
                onPress={() => void savePayment(p.key)}
              >
                <Text style={[styles.chipText, paymentStatus === p.key && styles.chipTextActive]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ---- Daily sales summary with exports ----
function DailySalesCard({ sales }: { sales: DailySalesRow[] }) {
  function exportPdf() {
    if (sales.length === 0) return Alert.alert('No data', 'No sales recorded yet.');
    void exportSalesPdf(sales, 'Daily Sales Report');
  }
  function exportCsv() {
    if (sales.length === 0) return Alert.alert('No data', 'No sales recorded yet.');
    void exportSalesCsv(sales, 'daily_sales');
  }

  return (
    <View style={styles.card}>
      {sales.slice(0, 7).map((r) => (
        <View key={r.day} style={styles.salesRow}>
          <Text style={styles.salesDay}>{r.day.slice(0, 10)}</Text>
          <Text style={styles.salesOrders}>{r.total_orders} orders</Text>
          <Text style={styles.salesRevenue}>{peso(Number(r.total_revenue))}</Text>
        </View>
      ))}
      {sales.length === 0 ? <Text style={styles.subEmpty}>No sales recorded yet.</Text> : null}
      <View style={styles.btnRow}>
        <Pressable style={[styles.exportBtn, { backgroundColor: colors.primary }]} onPress={exportPdf}>
          <Text style={styles.exportText}>⬇ PDF</Text>
        </Pressable>
        <Pressable style={[styles.exportBtn, { backgroundColor: colors.success }]} onPress={exportCsv}>
          <Text style={styles.exportText}>⬇ CSV (Excel)</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---- Settings ----
function SettingsCard({ onSaved }: { onSaved: () => void }) {
  const [fee, setFee] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void fetchSettings().then((s) => setFee(String(s.data.delivery_fee)));
  }, []);

  async function save() {
    setBusy(true);
    setMsg(null);
    const feeNum = parseFloat(fee);
    if (Number.isNaN(feeNum) || feeNum < 0) {
      setMsg('Enter a valid delivery fee.');
      setBusy(false);
      return;
    }
    const { error } = await updateDeliveryFee(feeNum);
    setMsg(error ? `Error: ${error}` : 'Delivery fee updated ✓');
    setBusy(false);
    if (!error) onSaved();
  }

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Default delivery fee (₱)</Text>
      <TextInput style={styles.input} value={fee} onChangeText={setFee} keyboardType="decimal-pad" />
      {msg ? <Text style={msg.startsWith('Error') ? styles.errText : styles.msg}>{msg}</Text> : null}
      <Pressable style={styles.saveBtn} onPress={save} disabled={busy}>
        <Text style={styles.saveText}>{busy ? 'Saving…' : 'Save Fee'}</Text>
      </Pressable>
    </View>
  );
}

// ---- Roles ----
function RolesCard() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setUsers(await fetchProfilesSafe());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setRole(userId: string, role: string) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
    if (error) setMsg(`Error: ${error.message}`);
    else {
      setMsg(null);
      void load();
    }
  }

  function confirmDelete(userId: string, userName: string) {
    Alert.alert(
      'Delete account',
      `Permanently delete ${userName}'s account? Their attendance and order history stay, but they can no longer log in.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const { error } = await supabase.rpc('delete_user', { p_user_id: userId });
              if (error) setMsg(`Error: ${error.message}`);
              else {
                setMsg(`✓ ${userName}'s account deleted`);
                void load();
              }
            })();
          },
        },
      ]
    );
  }

  if (profile?.role !== 'admin') {
    return (
      <View style={styles.card}>
        <Text style={styles.msg}>Only admins can change roles.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <AddAccountForm onCreated={load} />

      {users.map((u) => (
        <View key={u.id} style={styles.userRow}>
          <Text style={styles.userName}>
            {u.name}
            {u.id === profile.id ? ' (you)' : ''}
          </Text>
          <View style={styles.roleBtns}>
            {(['staff', 'manager', 'admin'] as const).map((r) => (
              <Pressable
                key={r}
                style={[styles.roleBtn, u.role === r && styles.roleBtnActive]}
                onPress={() => setRole(u.id, r)}
              >
                <Text style={[styles.roleBtnText, u.role === r && styles.roleBtnTextActive]}>{r}</Text>
              </Pressable>
            ))}
            {u.id !== profile.id ? (
              <Pressable style={styles.deleteBtn} onPress={() => confirmDelete(u.id, u.name)}>
                <Text style={styles.deleteBtnText}>Delete</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}
      {users.length === 0 ? <Text style={styles.msg}>No users visible yet.</Text> : null}
      {msg ? <Text style={msg.startsWith('Error') ? styles.errText : styles.msg}>{msg}</Text> : null}
    </View>
  );
}

// ---- Add Account: admin creates a user and assigns their role ----
function AddAccountForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'staff' | 'manager'>('staff');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function createAccount() {
    setMsg(null);
    if (!name.trim() || !email.trim() || password.length < 6) {
      setMsg('Fill in name, email, and a password of at least 6 characters.');
      return;
    }
    setBusy(true);

    // Sign up on the throwaway client so the admin's own session is untouched
    const { data, error } = await ephemeralClient.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim() } },
    });

    if (error) {
      setMsg(`Error: ${error.message}`);
      setBusy(false);
      return;
    }
    if (!data.user) {
      setMsg('Signup succeeded but no user returned — check email confirmation settings.');
      setBusy(false);
      return;
    }

    // The signup trigger creates a 'staff' profile; elevate/adjust the role now.
    // Wait briefly so the trigger's insert lands first.
    await new Promise((r) => setTimeout(r, 500));
    const { error: roleError } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', data.user.id);

    setBusy(false);
    if (roleError) {
      setMsg(`Account created, but setting ${role} failed: ${roleError.message}`);
    } else {
      setMsg(`✓ ${name.trim()} created as ${role}`);
      setName('');
      setEmail('');
      setPassword('');
      setRole('staff');
      setOpen(false);
      onCreated();
    }
  }

  if (!open) {
    return (
      <Pressable style={styles.addAccountBtn} onPress={() => setOpen(true)}>
        <Text style={styles.addAccountText}>+ Add Account</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.addAccountForm}>
      <Text style={styles.label}>Full name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Juan Dela Cruz" />

      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="juan@mmhills.com"
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <Text style={styles.label}>Password (min 6 characters)</Text>
      <View style={styles.passwordRow}>
        <TextInput
          style={[styles.input, { flex: 1, marginBottom: spacing(3) }]}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
        />
        <Pressable
          style={styles.eyeBtn}
          onPress={() => setShowPassword((s) => !s)}
          accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
        >
          <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁️'}</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Role</Text>
      <View style={styles.btnRow}>
        {(['staff', 'manager'] as const).map((r) => (
          <Pressable
            key={r}
            style={[styles.chip, role === r && styles.chipActive, styles.roleChip]}
            onPress={() => setRole(r)}
          >
            <Text style={[styles.chipText, role === r && styles.chipTextActive]}>
              {r === 'staff' ? '👤 Staff — check-in, orders, stock' : '🔑 Manager — full access'}
            </Text>
          </Pressable>
        ))}
      </View>

      {msg ? <Text style={msg.startsWith('Error') || msg.startsWith('Account') ? styles.errText : styles.msg}>{msg}</Text> : null}

      <View style={styles.btnRow}>
        <Pressable style={[styles.exportBtn, { backgroundColor: colors.textMuted }]} onPress={() => setOpen(false)}>
          <Text style={styles.exportText}>Cancel</Text>
        </Pressable>
        <Pressable style={[styles.exportBtn, { backgroundColor: colors.success, opacity: busy ? 0.6 : 1 }]} onPress={() => void createAccount()} disabled={busy}>
          <Text style={styles.exportText}>{busy ? 'Creating…' : 'Create Account'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing(4), paddingBottom: spacing(8) },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  title: { fontSize: 20, fontWeight: '800', color: colors.primary, marginBottom: spacing(3) },
  lockedTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  offline: { color: colors.warning, fontSize: 12, fontWeight: '600', marginBottom: spacing(3) },
  wideRow: { flexDirection: 'row', gap: spacing(5), alignItems: 'flex-start' },
  wideCol: { flex: 1, minWidth: 0 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(3), marginBottom: spacing(2) },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(4),
    marginBottom: spacing(3),
    flexGrow: 1,
    minWidth: '45%',
  },
  statLabel: { fontSize: 12, color: colors.textMuted },
  statValue: { fontSize: 19, fontWeight: '800', color: colors.primary, marginTop: spacing(1) },
  statSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  section: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: spacing(4), marginBottom: spacing(2) },
  orderRow: { flexDirection: 'row', alignItems: 'center' },
  orderName: { fontSize: 14, fontWeight: '600', color: colors.text },
  orderSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: spacing(1), marginTop: spacing(1) },
  statusBadge: { fontSize: 10, fontWeight: '800', paddingHorizontal: spacing(1.5), paddingVertical: 2, borderRadius: 6, overflow: 'hidden', textTransform: 'uppercase' },
  orderTotal: { fontSize: 15, fontWeight: '800', color: colors.primary },
  expandBox: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing(3), paddingTop: spacing(3) },
  label: { fontSize: 12, fontWeight: '600', color: colors.textMuted, marginBottom: spacing(1) },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    paddingHorizontal: spacing(3), paddingVertical: spacing(2.5),
    fontSize: 15, backgroundColor: colors.bg, marginBottom: spacing(3),
  },
  btnRow: { flexDirection: 'row', gap: spacing(2), marginBottom: spacing(3), flexWrap: 'wrap' },
  chip: { paddingHorizontal: spacing(3), paddingVertical: spacing(1.5), borderRadius: 20, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.textMuted },
  chipTextActive: { color: colors.white, fontWeight: '700' },
  salesRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing(1.5) },
  salesDay: { fontSize: 13, color: colors.text, flex: 1 },
  salesOrders: { fontSize: 12, color: colors.textMuted, width: 80, textAlign: 'center' },
  salesRevenue: { fontSize: 13, fontWeight: '700', color: colors.primary, width: 100, textAlign: 'right' },
  exportBtn: { flex: 1, borderRadius: 8, paddingVertical: spacing(2.5), alignItems: 'center' },
  exportText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  msg: { color: colors.success, fontSize: 13, marginBottom: spacing(2) },
  errText: { color: colors.danger, fontSize: 13, marginBottom: spacing(2) },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: spacing(2.5), alignItems: 'center' },
  saveText: { color: colors.white, fontWeight: '700' },
  addAccountBtn: {
    backgroundColor: colors.successBg, borderWidth: 1, borderColor: colors.success,
    borderRadius: 8, paddingVertical: spacing(2.5), alignItems: 'center', marginBottom: spacing(3),
  },
  addAccountText: { color: colors.success, fontWeight: '800' },
  addAccountForm: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    padding: spacing(3), marginBottom: spacing(3), backgroundColor: colors.bg,
  },
  roleChip: { flexGrow: 1 },
  passwordRow: { flexDirection: 'row', alignItems: 'center' },
  eyeBtn: {
    marginLeft: spacing(2), width: 44, height: 44, borderRadius: 8,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  eyeText: { fontSize: 18 },
  deleteBtn: {
    backgroundColor: colors.dangerBg, borderWidth: 1, borderColor: colors.danger,
    borderRadius: 8, paddingHorizontal: spacing(2.5), paddingVertical: spacing(1.5),
  },
  deleteBtnText: { color: colors.danger, fontWeight: '700', fontSize: 12 },
  userRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(3) },
  userName: { fontSize: 14, fontWeight: '600', color: colors.text, flex: 1 },
  roleBtns: { flexDirection: 'row', gap: spacing(1) },
  roleBtn: {
    paddingHorizontal: spacing(2), paddingVertical: spacing(1), borderRadius: 8,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
  },
  roleBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  roleBtnText: { fontSize: 12, color: colors.textMuted, textTransform: 'capitalize' },
  roleBtnTextActive: { color: colors.white, fontWeight: '700' },
  subEmpty: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
});
