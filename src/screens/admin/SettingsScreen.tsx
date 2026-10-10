import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { supabase, ephemeralClient } from '@/services/supabase';
import { useAuth } from '@/services/auth';
import { fetchProfiles } from '@/services/db';
import { useSettings, useStyles } from '@/services/settings';
import { colors, spacing, createStyleSheet } from '@/theme';
import type { PaymentMethod, PaymentStatus, Profile, Settings } from '@/types';

interface Props { onBack: () => void }

// ── Helpers ──────────────────────────────────────────────────────────────────

const PRIMARY_PRESETS = ['#1e3a5f', '#0f766e', '#7c3aed', '#be123c', '#15803d', '#1d4ed8', '#b45309', '#334155'];
const ACCENT_PRESETS  = ['#f59e0b', '#22c55e', '#06b6d4', '#ec4899', '#84cc16', '#f43f5e', '#eab308', '#8b5cf6'];
const ALL_PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'gcash'];

interface SettingsForm {
  store_name: string;
  tagline: string;
  currency_symbol: string;
  receipt_footer: string;
  deliveryFeeText: string;
  thresholdText: string;
  primary_color: string;
  accent_color: string;
  dark_mode: boolean;
  payment_methods: PaymentMethod[];
  categories: string[];
}

function formFromSettings(s: Settings): SettingsForm {
  return {
    store_name: s.store_name,
    tagline: s.tagline,
    currency_symbol: s.currency_symbol,
    receipt_footer: s.receipt_footer,
    deliveryFeeText: String(s.delivery_fee),
    thresholdText: String(s.low_stock_threshold),
    primary_color: s.primary_color,
    accent_color: s.accent_color,
    dark_mode: s.dark_mode,
    payment_methods: [...s.payment_methods],
    categories: [...s.categories],
  };
}

function isValidHex(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex.trim());
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function SettingsScreen({ onBack }: Props) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={onBack} hitSlop={12}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <Text style={styles.title}>⚙️ Settings & Roles</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsPanel />
        <RolesCard />
      </ScrollView>
    </View>
  );
}

// ── Settings panel ────────────────────────────────────────────────────────────

function SettingsPanel() {
  const { settings, saveSettings, applyLive } = useSettings();
  const styles = useStyles(makeStyles);
  const [form, setForm]             = useState<SettingsForm>(() => formFromSettings(settings));
  const [newCategory, setNewCategory] = useState('');
  const [busy, setBusy]             = useState(false);
  const [msg, setMsg]               = useState<string | null>(null);

  useEffect(() => setForm(formFromSettings(settings)), [settings]);

  const update = (patch: Partial<SettingsForm>) => setForm((f) => ({ ...f, ...patch }));

  function togglePayment(m: PaymentMethod) {
    const next = form.payment_methods.includes(m)
      ? form.payment_methods.filter((x) => x !== m)
      : [...form.payment_methods, m];
    if (next.length === 0) { setMsg('Keep at least one payment method enabled.'); return; }
    setMsg(null);
    update({ payment_methods: next });
  }

  function addCategory() {
    const c = newCategory.trim();
    if (!c) return;
    if (!form.categories.some((x) => x.toLowerCase() === c.toLowerCase())) {
      update({ categories: [...form.categories, c] });
    }
    setNewCategory('');
  }

  async function save() {
    setMsg(null);
    if (!form.store_name.trim())       return setMsg('Store name cannot be empty.');
    if (!isValidHex(form.primary_color)) return setMsg('Primary color must be a hex code like #1e3a5f.');
    if (!isValidHex(form.accent_color))  return setMsg('Accent color must be a hex code like #f59e0b.');
    const fee       = parseFloat(form.deliveryFeeText);
    const threshold = parseInt(form.thresholdText, 10);
    if (Number.isNaN(fee) || fee < 0)          return setMsg('Enter a valid delivery fee.');
    if (Number.isNaN(threshold) || threshold < 0) return setMsg('Enter a valid low-stock threshold.');
    setBusy(true);
    const error = await saveSettings({
      ...settings,
      store_name: form.store_name.trim(),
      tagline: form.tagline,
      currency_symbol: form.currency_symbol.trim() || '₱',
      receipt_footer: form.receipt_footer,
      delivery_fee: fee,
      low_stock_threshold: threshold,
      primary_color: form.primary_color.trim(),
      accent_color: form.accent_color.trim(),
      dark_mode: form.dark_mode,
      payment_methods: form.payment_methods,
      categories: form.categories,
    });
    setBusy(false);
    setForm(formFromSettings(settings));
    setMsg(error ? `Error: ${error}` : 'Saved ✓ — branding, theme & rules applied across the app.');
  }

  return (
    <View style={styles.card}>
      <Text style={styles.panelHeading}>🏷️ Branding</Text>
      <Text style={styles.label}>Store name</Text>
      <TextInput style={styles.input} value={form.store_name} onChangeText={(t) => update({ store_name: t })} placeholder="Metro Manila Hills" />
      <Text style={styles.label}>Tagline (login + receipts)</Text>
      <TextInput style={styles.input} value={form.tagline} onChangeText={(t) => update({ tagline: t })} placeholder="Construction Supply & Trading" />
      <Text style={styles.label}>Currency symbol</Text>
      <TextInput style={styles.input} value={form.currency_symbol} onChangeText={(t) => update({ currency_symbol: t })} maxLength={4} />
      <Text style={styles.label}>Receipt footer</Text>
      <TextInput style={styles.input} value={form.receipt_footer} onChangeText={(t) => update({ receipt_footer: t })} placeholder="Salamat po! 🙏" />

      <Text style={styles.panelHeading}>🎨 Appearance</Text>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Dark mode</Text>
        <Switch
          value={form.dark_mode}
          onValueChange={(v) => { applyLive(settings.primary_color, settings.accent_color, v); update({ dark_mode: v }); }}
          trackColor={{ true: colors.primary, false: colors.border }}
          thumbColor={colors.card}
        />
      </View>
      <Text style={styles.label}>Primary color</Text>
      <View style={styles.swatchRow}>
        {PRIMARY_PRESETS.map((c) => (
          <Pressable key={c} style={[styles.swatch, { backgroundColor: c }, form.primary_color.toLowerCase() === c && styles.swatchActive]}
            onPress={() => update({ primary_color: c })} accessibilityLabel={`Primary color ${c}`} />
        ))}
      </View>
      <TextInput style={styles.input} value={form.primary_color} onChangeText={(t) => update({ primary_color: t })} placeholder="#1e3a5f" autoCapitalize="none" />
      <Text style={styles.label}>Accent color</Text>
      <View style={styles.swatchRow}>
        {ACCENT_PRESETS.map((c) => (
          <Pressable key={c} style={[styles.swatch, { backgroundColor: c }, form.accent_color.toLowerCase() === c && styles.swatchActive]}
            onPress={() => update({ accent_color: c })} accessibilityLabel={`Accent color ${c}`} />
        ))}
      </View>
      <TextInput style={styles.input} value={form.accent_color} onChangeText={(t) => update({ accent_color: t })} placeholder="#f59e0b" autoCapitalize="none" />

      <Text style={styles.panelHeading}>🛒 Ordering Rules</Text>
      <Text style={styles.label}>Default delivery fee ({form.currency_symbol || settings.currency_symbol})</Text>
      <TextInput style={styles.input} value={form.deliveryFeeText} onChangeText={(t) => update({ deliveryFeeText: t })} keyboardType="decimal-pad" />
      <Text style={styles.label}>Accepted payment methods</Text>
      <View style={styles.payChipRow}>
        {ALL_PAYMENT_METHODS.map((m) => {
          const on = form.payment_methods.includes(m);
          return (
            <Pressable key={m} style={[styles.chip, on && styles.chipActive, styles.roleChip]} onPress={() => togglePayment(m)}>
              <Text style={[styles.chipText, on && styles.chipTextActive]}>
                {m === 'cash' ? '💵 Cash' : m === 'card' ? '💳 Card' : '📱 GCash'}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.label}>Low-stock alert threshold</Text>
      <TextInput style={styles.input} value={form.thresholdText} onChangeText={(t) => update({ thresholdText: t })} keyboardType="number-pad" />
      <Text style={styles.sectionNote}>Used when a product has no reorder point set.</Text>

      <Text style={styles.panelHeading}>🗂️ Product Categories</Text>
      {form.categories.length > 0 ? (
        <View style={styles.catChipsWrap}>
          {form.categories.map((c) => (
            <View key={c} style={styles.catChip}>
              <Text style={styles.catChipText}>{c}</Text>
              <Pressable hitSlop={8} onPress={() => update({ categories: form.categories.filter((x) => x !== c) })}>
                <Text style={styles.catRemove}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.sectionNote}>No categories yet — add one below.</Text>
      )}
      <View style={styles.catRow}>
        <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} value={newCategory} onChangeText={setNewCategory}
          placeholder="e.g. Paint" onSubmitEditing={addCategory} />
        <Pressable style={styles.saveBtn} onPress={addCategory}>
          <Text style={styles.saveText}>Add</Text>
        </Pressable>
      </View>

      {msg ? <Text style={msg.startsWith('Error') ? styles.errText : styles.msg}>{msg}</Text> : null}
      <Pressable style={[styles.saveBtn, busy && { opacity: 0.6 }]} onPress={() => void save()} disabled={busy}>
        <Text style={styles.saveText}>{busy ? 'Saving…' : 'Save Settings'}</Text>
      </Pressable>
    </View>
  );
}

// ── Roles card ────────────────────────────────────────────────────────────────

function RolesCard() {
  const { profile } = useAuth();
  const styles = useStyles(makeStyles);
  const [users, setUsers] = useState<Profile[]>([]);
  const [msg,   setMsg]   = useState<string | null>(null);

  const load = useCallback(async () => { setUsers(await fetchProfiles()); }, []);
  useEffect(() => { void load(); }, [load]);

  async function setRole(userId: string, role: string) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
    if (error) setMsg(`Error: ${error.message}`);
    else { setMsg(null); void load(); }
  }

  function confirmDelete(userId: string, userName: string) {
    Alert.alert(
      'Delete account',
      `Permanently delete ${userName}'s account? Their attendance and order history stay, but they can no longer log in.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: () => void (async () => {
            const { error } = await supabase.rpc('delete_user', { p_user_id: userId });
            if (error) setMsg(`Cannot delete: ${error.message}`);
            else { setMsg(`✓ ${userName}'s account deleted`); void load(); }
          })(),
        },
      ]
    );
  }

  if (profile?.role !== 'admin') {
    return <View style={styles.card}><Text style={styles.msg}>Only admins can change roles.</Text></View>;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.panelHeading}>👥 User Roles</Text>
      <AddAccountForm onCreated={load} />
      {users.map((u) => (
        <View key={u.id} style={styles.userRow}>
          <Text style={styles.userName}>{u.name}{u.id === profile.id ? ' (you)' : ''}</Text>
          <View style={styles.roleBtns}>
            {(['staff', 'manager', 'admin'] as const).map((r) => (
              <Pressable key={r} style={[styles.roleBtn, u.role === r && styles.roleBtnActive]} onPress={() => setRole(u.id, r)}>
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

// ── Add account form ──────────────────────────────────────────────────────────

function AddAccountForm({ onCreated }: { onCreated: () => void }) {
  const styles = useStyles(makeStyles);
  const [open, setOpen]               = useState(false);
  const [name, setName]               = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [role, setRole]               = useState<'staff' | 'manager'>('staff');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy]               = useState(false);
  const [msg, setMsg]                 = useState<string | null>(null);

  async function createAccount() {
    setMsg(null);
    if (!name.trim() || !email.trim() || password.length < 6) {
      setMsg('Fill in name, email, and a password of at least 6 characters.');
      return;
    }
    setBusy(true);
    const { data, error } = await ephemeralClient.auth.signUp({
      email: email.trim(), password,
      options: { data: { name: name.trim() } },
    });
    if (error) { setMsg(`Error: ${error.message}`); setBusy(false); return; }
    if (!data.user) { setMsg('Signup succeeded but no user returned — check email confirmation settings.'); setBusy(false); return; }

    await new Promise((r) => setTimeout(r, 500));
    const { error: roleError } = await supabase.from('profiles').update({ role }).eq('id', data.user.id);
    setBusy(false);
    if (roleError) {
      setMsg(`Account created, but setting ${role} failed: ${roleError.message}`);
    } else {
      setMsg(`✓ ${name.trim()} created as ${role}`);
      setName(''); setEmail(''); setPassword(''); setRole('staff'); setOpen(false);
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
      <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="juan@mmhills.com" autoCapitalize="none" keyboardType="email-address" />
      <Text style={styles.label}>Password (min 6 characters)</Text>
      <View style={styles.passwordRow}>
        <TextInput style={[styles.input, { flex: 1, marginBottom: spacing(3) }]} value={password} onChangeText={setPassword}
          placeholder="••••••" secureTextEntry={!showPassword} autoCapitalize="none" />
        <Pressable style={styles.eyeBtn} onPress={() => setShowPassword((s) => !s)}
          accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
          <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁️'}</Text>
        </Pressable>
      </View>
      <Text style={styles.label}>Role</Text>
      <View style={styles.btnRow}>
        {(['staff', 'manager'] as const).map((r) => (
          <Pressable key={r} style={[styles.chip, role === r && styles.chipActive, styles.roleChip]} onPress={() => setRole(r)}>
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
        <Pressable style={[styles.exportBtn, { backgroundColor: colors.success, opacity: busy ? 0.6 : 1 }]}
          onPress={() => void createAccount()} disabled={busy}>
          <Text style={styles.exportText}>{busy ? 'Creating…' : 'Create Account'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
    content:  { padding: spacing(4), paddingBottom: spacing(8) },

    card: {
      backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border,
      padding: spacing(4), marginBottom: spacing(3),
    },
    panelHeading: { fontSize: 14, fontWeight: '800', color: c.text, marginTop: spacing(2), marginBottom: spacing(2) },
    label: { fontSize: 12, fontWeight: '600', color: c.textMuted, marginBottom: spacing(1) },
    input: {
      borderWidth: 1, borderColor: c.border, borderRadius: 8,
      paddingHorizontal: spacing(3), paddingVertical: spacing(2.5),
      fontSize: 15, backgroundColor: c.bg, marginBottom: spacing(3), color: c.text,
    },
    switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(3) },
    switchLabel: { fontSize: 13, fontWeight: '600', color: c.text },
    swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginBottom: spacing(3) },
    swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'transparent' },
    swatchActive: { borderColor: c.text },
    payChipRow: { flexDirection: 'row', gap: spacing(2), marginBottom: spacing(3) },
    chip: { paddingHorizontal: spacing(3), paddingVertical: spacing(1.5), borderRadius: 20, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border },
    chipActive: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { fontSize: 12, color: c.textMuted },
    chipTextActive: { color: c.onPrimary, fontWeight: '700' },
    roleChip: { flexGrow: 1 },
    sectionNote: { fontSize: 11, color: c.textMuted, marginTop: -spacing(1), marginBottom: spacing(3) },
    catChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1.5), marginBottom: spacing(3) },
    catChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing(2.5), paddingVertical: spacing(1.5), borderRadius: 14, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border },
    catChipText: { fontSize: 12, color: c.text },
    catRemove: { color: c.danger, fontWeight: '800', marginLeft: spacing(1.5), fontSize: 12 },
    catRow: { flexDirection: 'row', gap: spacing(2), alignItems: 'center', marginBottom: spacing(3) },
    saveBtn: { backgroundColor: c.primary, borderRadius: 8, paddingVertical: spacing(2.5), paddingHorizontal: spacing(4), alignItems: 'center' },
    saveText: { color: c.onPrimary, fontWeight: '700' },
    msg: { color: c.success, fontSize: 13, marginBottom: spacing(2) },
    errText: { color: c.danger, fontSize: 13, marginBottom: spacing(2) },

    // Roles
    userRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(3) },
    userName: { fontSize: 14, fontWeight: '600', color: c.text, flex: 1 },
    roleBtns: { flexDirection: 'row', gap: spacing(1) },
    roleBtn: { paddingHorizontal: spacing(2), paddingVertical: spacing(1), borderRadius: 8, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border },
    roleBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
    roleBtnText: { fontSize: 12, color: c.textMuted, textTransform: 'capitalize' },
    roleBtnTextActive: { color: c.onPrimary, fontWeight: '700' },
    deleteBtn: { backgroundColor: c.dangerBg, borderWidth: 1, borderColor: c.danger, borderRadius: 8, paddingHorizontal: spacing(2.5), paddingVertical: spacing(1.5) },
    deleteBtnText: { color: c.danger, fontWeight: '700', fontSize: 12 },

    // Add account
    addAccountBtn: { backgroundColor: c.successBg, borderWidth: 1, borderColor: c.success, borderRadius: 8, paddingVertical: spacing(2.5), alignItems: 'center', marginBottom: spacing(3) },
    addAccountText: { color: c.success, fontWeight: '800' },
    addAccountForm: { borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: spacing(3), marginBottom: spacing(3), backgroundColor: c.bg },
    passwordRow: { flexDirection: 'row', alignItems: 'center' },
    eyeBtn: { marginLeft: spacing(2), width: 44, height: 44, borderRadius: 8, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    eyeText: { fontSize: 18 },
    btnRow: { flexDirection: 'row', gap: spacing(2), marginBottom: spacing(3), flexWrap: 'wrap' },
    exportBtn: { flex: 1, borderRadius: 8, paddingVertical: spacing(2.5), alignItems: 'center' },
    exportText: { color: c.onPrimary, fontWeight: '700', fontSize: 13 },
  });
}
