import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/services/auth';
import { adjustStock, bulkAdjustStock, bulkDeleteProducts, fetchProducts, upsertProduct } from '@/services/db';
import { useSupabaseRealtime } from '@/services/useSupabaseRealtime';
import { peso } from '@/utils/format';
import { colors, spacing } from '@/theme';
import type { Product } from '@/types';

type SortKey = 'name' | 'stock' | 'price' | 'category';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'stock', label: 'Stock' },
  { key: 'price', label: 'Price' },
  { key: 'category', label: 'Category' },
];

export function StockScreen() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'manager';

  const [products, setProducts] = useState<Product[]>([]);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const realtimeChanges = useSupabaseRealtime(['products']);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  function confirmBulkDelete() {
    const ids = [...selected];
    Alert.alert('Delete products', `Delete ${ids.length} selected product(s)? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void bulkDeleteProducts(ids).then(({ error }) => {
            if (error) Alert.alert('Error', error);
            setSelected(new Set());
            void load();
          });
        },
      },
    ]);
  }

  function bulkAdjust(delta: number) {
    const ids = [...selected];
    if (delta === 0 || ids.length === 0) return;
    void bulkAdjustStock(ids, Math.abs(delta) * (delta > 0 ? 1 : -1), 'bulk', profile?.id ?? null).then(({ error }) => {
      if (error) Alert.alert('Error', error);
      setSelected(new Set());
      void load();
    });
  }

  const load = useCallback(async () => {
    const res = await fetchProducts();
    setProducts(res.data);
    setOffline(res.offline);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Live stock: refresh when another device adjusts or orders come in
  useEffect(() => {
    if (realtimeChanges > 0) void load();
  }, [realtimeChanges, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.sku ?? '').toLowerCase().includes(q) ||
            (p.category ?? '').toLowerCase().includes(q)
        )
      : products;

    const dir = sortAsc ? 1 : -1;
    const sorted = [...matched];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'stock':
          return (a.stock - b.stock) * dir || a.name.localeCompare(b.name);
        case 'price':
          return (Number(a.price) - Number(b.price)) * dir || a.name.localeCompare(b.name);
        case 'category': {
          const catA = (a.category ?? 'Uncategorized').toLowerCase();
          const catB = (b.category ?? 'Uncategorized').toLowerCase();
          return catA.localeCompare(catB) * dir || a.name.localeCompare(b.name);
        }
        default:
          return a.name.localeCompare(b.name) * dir;
      }
    });
    return sorted;
  }, [products, query, sortKey, sortAsc]);

  function onSortPress(key: SortKey) {
    if (key === sortKey) {
      setSortAsc((asc) => !asc); // same chip: flip direction
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>📦 Stock</Text>
        {isAdmin ? (
          <Pressable style={styles.addButton} onPress={() => setCreating(true)}>
            <Text style={styles.addText}>+ Add</Text>
          </Pressable>
        ) : null}
      </View>

      {offline ? (
        <Text style={styles.offline}>📴 Offline — cached stock levels</Text>
      ) : null}

      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder="🔍 Search name, SKU, category…"
        placeholderTextColor={colors.textMuted}
      />

      {/* Sort chips — tap active chip to flip direction */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sortRow} contentContainerStyle={styles.sortRowContent}>
        {SORT_OPTIONS.map((opt) => {
          const active = sortKey === opt.key;
          return (
            <Pressable key={opt.key} style={[styles.sortChip, active && styles.sortChipActive]} onPress={() => onSortPress(opt.key)}>
              <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>
                {opt.label} {active ? (sortAsc ? '↑' : '↓') : ''}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Bulk action bar (admins, when items selected) */}
      {isAdmin && selected.size > 0 ? (
        <View style={styles.bulkBar}>
          <Text style={styles.bulkCount}>{selected.size} selected</Text>
          <Pressable style={styles.bulkBtn} onPress={() => bulkAdjust(+10)}>
            <Text style={styles.bulkBtnText}>+10</Text>
          </Pressable>
          <Pressable style={styles.bulkBtn} onPress={() => bulkAdjust(-1)}>
            <Text style={styles.bulkBtnText}>−1</Text>
          </Pressable>
          <Pressable style={[styles.bulkBtn, styles.bulkDanger]} onPress={confirmBulkDelete}>
            <Text style={[styles.bulkBtnText, { color: colors.white }]}>Delete</Text>
          </Pressable>
          <Pressable onPress={() => setSelected(new Set())}>
            <Text style={styles.bulkClear}>Clear</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.list}>
        {filtered.map((p) => {
          const low = p.stock <= p.reorder_point;
          const isSelected = selected.has(p.id);
          return (
            <Pressable
              key={p.id}
              style={[styles.card, isSelected && styles.cardSelected]}
              onPress={() =>
                isAdmin
                  ? selected.size > 0
                    ? toggleSelect(p.id)
                    : setEditing(p)
                  : undefined
              }
              onLongPress={() => isAdmin && toggleSelect(p.id)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{p.name}</Text>
                <Text style={styles.meta}>
                  {p.sku ?? '—'} · {p.category ?? 'Uncategorized'}
                </Text>
                <View style={styles.badgeRow}>
                  <Text style={[styles.badge, low ? styles.badgeLow : styles.badgeOk]}>
                    {p.stock === 0 ? 'OUT OF STOCK' : low ? `LOW · ${p.stock} left` : `In stock: ${p.stock}`}
                  </Text>
                  <Text style={styles.price}>{peso(Number(p.price))}</Text>
                </View>
              </View>
            </Pressable>
          );
        })}
        {filtered.length === 0 ? <Text style={styles.empty}>No products match "{query}"</Text> : null}
        {isAdmin ? (
          <Text style={styles.hintText}>Tip: long-press a product to enter bulk selection.</Text>
        ) : null}
      </ScrollView>

      <EditProductModal
        visible={creating || editing !== null}
        product={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          void load();
        }}
      />
    </View>
  );
}

function EditProductModal({
  visible,
  product,
  onClose,
  onSaved,
}: {
  visible: boolean;
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [reorder, setReorder] = useState('');
  const [adjust, setAdjust] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (product) {
      setName(product.name);
      setSku(product.sku ?? '');
      setBarcode(product.barcode ?? '');
      setCategory(product.category ?? '');
      setPrice(String(product.price));
      setStock(String(product.stock));
      setReorder(String(product.reorder_point));
      setAdjust('0');
    } else {
      setName('');
      setSku('');
      setBarcode('');
      setCategory('');
      setPrice('');
      setStock('0');
      setReorder('10');
      setAdjust('0');
    }
    setError(null);
  }, [product, visible]);

  async function save() {
    setBusy(true);
    setError(null);
    const priceNum = parseFloat(price);
    if (!name.trim() || Number.isNaN(priceNum)) {
      setError('Name and a valid price are required.');
      setBusy(false);
      return;
    }
    const { error: err } = await upsertProduct({
      ...(product ? { id: product.id } : {}),
      name: name.trim(),
      sku: sku.trim() || null,
      barcode: barcode.trim() || null,
      category: category.trim() || null,
      price: priceNum,
      stock: product ? product.stock : parseInt(stock, 10) || 0,
      reorder_point: parseInt(reorder, 10) || 0,
    });
    if (err) {
      setError(err);
      setBusy(false);
      return;
    }
    // Separate stock adjustment so it lands in the audit trail
    const delta = parseInt(adjust, 10) || 0;
    if (product && delta !== 0 && profile) {
      await adjustStock(product.id, delta, 'manual', profile.id);
    }
    setBusy(false);
    onSaved();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{product ? 'Edit Product' : 'New Product'}</Text>

          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Cement 40kg" />

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: spacing(2) }}>
              <Text style={styles.label}>SKU</Text>
              <TextInput style={styles.input} value={sku} onChangeText={setSku} placeholder="CEM-40-001" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Category</Text>
              <TextInput style={styles.input} value={category} onChangeText={setCategory} placeholder="Cement" />
            </View>
          </View>

          <Text style={styles.label}>Barcode (for scan-to-add)</Text>
          <TextInput style={styles.input} value={barcode} onChangeText={setBarcode} placeholder="Scan or type product barcode" keyboardType="numbers-and-punctuation" />

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: spacing(2) }}>
              <Text style={styles.label}>Price (₱)</Text>
              <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Reorder point</Text>
              <TextInput style={styles.input} value={reorder} onChangeText={setReorder} keyboardType="number-pad" />
            </View>
          </View>

          {product ? (
            <>
              <Text style={styles.label}>Adjust stock (current: {product.stock})</Text>
              <TextInput style={styles.input} value={adjust} onChangeText={setAdjust} keyboardType="number-pad" placeholder="+10 or -5" />
            </>
          ) : (
            <>
              <Text style={styles.label}>Initial stock</Text>
              <TextInput style={styles.input} value={stock} onChangeText={setStock} keyboardType="number-pad" />
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.row}>
            <Pressable style={[styles.btn, styles.btnGhost]} onPress={onClose}>
              <Text style={styles.btnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnPrimary, busy && { opacity: 0.6 }]} onPress={save} disabled={busy}>
              <Text style={styles.btnPrimaryText}>{busy ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing(4), paddingBottom: spacing(2) },
  title: { fontSize: 20, fontWeight: '800', color: colors.primary },
  addButton: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: spacing(3), paddingVertical: spacing(2) },
  addText: { color: colors.white, fontWeight: '700' },
  offline: { color: colors.warning, fontSize: 12, fontWeight: '600', paddingHorizontal: spacing(4) },
  search: {
    backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
    marginHorizontal: spacing(4), marginTop: spacing(2), paddingHorizontal: spacing(3), paddingVertical: spacing(3), fontSize: 15,
  },
  sortRow: { marginTop: spacing(2), flexGrow: 0 },
  sortRowContent: { paddingHorizontal: spacing(4), gap: spacing(2) },
  sortChip: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: 20, paddingHorizontal: spacing(3), paddingVertical: spacing(1.5),
  },
  sortChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  sortChipText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  sortChipTextActive: { color: colors.white, fontWeight: '700' },
  list: { padding: spacing(4) },
  card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: spacing(4), marginBottom: spacing(3) },
  cardSelected: { borderColor: colors.primary, backgroundColor: '#e8f0fa' },
  bulkBar: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), backgroundColor: colors.card, marginHorizontal: spacing(4), marginTop: spacing(2), padding: spacing(2), borderRadius: 10, borderWidth: 1, borderColor: colors.primary },
  bulkCount: { fontWeight: '700', color: colors.primary, fontSize: 13 },
  bulkBtn: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: spacing(2.5), paddingVertical: spacing(1.5) },
  bulkBtnText: { fontSize: 12, fontWeight: '700', color: colors.text },
  bulkDanger: { backgroundColor: colors.danger, borderColor: colors.danger },
  bulkClear: { fontSize: 12, color: colors.textMuted },
  hintText: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: spacing(2) },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  badgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing(2) },
  badge: { fontSize: 12, fontWeight: '700', paddingHorizontal: spacing(2), paddingVertical: spacing(1), borderRadius: 8, overflow: 'hidden' },
  badgeOk: { color: colors.success, backgroundColor: colors.successBg },
  badgeLow: { color: colors.danger, backgroundColor: colors.dangerBg },
  price: { fontSize: 16, fontWeight: '800', color: colors.primary },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing(6) },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing(5), maxHeight: '90%' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: spacing(3) },
  label: { fontSize: 12, fontWeight: '600', color: colors.textMuted, marginBottom: spacing(1) },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: spacing(3), paddingVertical: spacing(2.5), fontSize: 15, backgroundColor: colors.bg, marginBottom: spacing(3) },
  row: { flexDirection: 'row' },
  error: { color: colors.danger, fontSize: 13, marginBottom: spacing(2) },
  btn: { flex: 1, borderRadius: 10, paddingVertical: spacing(3), alignItems: 'center' },
  btnGhost: { backgroundColor: colors.bg, marginRight: spacing(2) },
  btnGhostText: { color: colors.textMuted, fontWeight: '700' },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { color: colors.white, fontWeight: '700' },
});
