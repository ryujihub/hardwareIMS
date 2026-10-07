import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from '@/services/auth';
import { adjustStock, bulkAdjustStock, bulkDeleteProducts, fetchProducts, upsertProduct, uploadProductImage } from '@/services/db';
import { useSettings, useStyles } from '@/services/settings';
import { useSupabaseRealtime } from '@/services/useSupabaseRealtime';
import { peso } from '@/utils/format';
import { isLowStock } from '@/utils/stock';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, withAlpha, createStyleSheet } from '@/theme';
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
  const { settings } = useSettings();
  const styles = useStyles(makeStyles);
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
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
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
    void bulkAdjustStock(ids, delta, 'bulk', profile?.id ?? null).then(({ error }) => {
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
    const matched = products.filter((p) => {
      if (categoryFilter && p.category?.toLowerCase() !== categoryFilter.toLowerCase()) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q)
      );
    });

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
  }, [products, query, sortKey, sortAsc, categoryFilter]);

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

      <View style={styles.searchRow}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="🔍 Search name, SKU…"
          placeholderTextColor={colors.textMuted}
        />
        <Pressable style={styles.categoryDropdown} onPress={() => setCategoryModalVisible(true)}>
          <Text style={styles.categoryLabel}>{categoryFilter || 'All Categories'}</Text>
          <Ionicons name={categoryFilter ? 'chevron-down' : 'chevron-up'} size={18} color={colors.textMuted} />
        </Pressable>
        <Modal visible={categoryModalVisible} animationType="slide" transparent>
          <View style={styles.categoryModalBackdrop}>
            <View style={styles.categoryModalCard}>
              <Text style={styles.categoryModalTitle}>Filter by Category</Text>
              <ScrollView style={styles.categoryList}>
                <Pressable style={styles.categoryOption} onPress={() => { setCategoryFilter(null); setCategoryModalVisible(false); }}>
                  <Text style={styles.categoryOptionText}>All Categories</Text>
                  {categoryFilter === null && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                </Pressable>
                {settings.categories.map((cat) => (
                  <Pressable key={cat} style={styles.categoryOption} onPress={() => { setCategoryFilter(cat); setCategoryModalVisible(false); }}>
                    <Text style={styles.categoryOptionText}>{cat}</Text>
                    {categoryFilter === cat && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable style={styles.categoryModalClose} onPress={() => setCategoryModalVisible(false)}>
                <Text style={styles.categoryModalCloseText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>

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
            <Text style={[styles.bulkBtnText, { color: colors.onPrimary }]}>Delete</Text>
          </Pressable>
          <Pressable onPress={() => setSelected(new Set())}>
            <Text style={styles.bulkClear}>Clear</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.list}>
        {filtered.map((p) => {
          const low = isLowStock(p, settings.low_stock_threshold);
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
              <View style={styles.cardContent}>
                {p.image_url ? (
                  <View style={styles.thumbWrapper}>
                    <Image source={{ uri: p.image_url }} style={{ width: 48, height: 48, borderRadius: 8 }} onError={(e) => console.warn('Image failed:', p.image_url, e.nativeEvent.error)} />
                  </View>
                ) : (
                  <View style={styles.thumbPlaceholder}>
                    <Text style={styles.thumbPlaceholderText}>📦</Text>
                  </View>
                )}
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
  const { settings } = useSettings();
  const styles = useStyles(makeStyles);
  const [imageUrl, setImageUrl] = useState('');
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
  const [imageUploading, setImageUploading] = useState(false);
  const [lastUploadError, setLastUploadError] = useState<string | null>(null);

  // Category suggestions: the admin's list plus anything already on this product
  const categorySuggestions = useMemo(() => {
    const set = new Set<string>(settings.categories);
    if (product?.category) set.add(product.category);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [settings.categories, product]);

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images' as const,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    
    if (!result.canceled && result.assets?.[0]) {
      setImageUploading(true);
      setLastUploadError(null);
      try {
        const asset = result.assets[0];
        const ext = asset.mimeType?.split('/')[1]?.toLowerCase() || 'jpg';
        
        // Read image as base64, decode to ArrayBuffer for Supabase (RN Blob/FormData doesn't work)
        const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
        
        const { url, error: uploadErr } = await uploadProductImage(base64, ext) as { url: string | null; error: string | null };
        if (uploadErr) {
          setLastUploadError(uploadErr);
          setError(uploadErr);
        } else if (url) {
          setImageUrl(url);
          setLastUploadError(null);
          setError(null);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setLastUploadError(msg);
        setError(msg);
      }
      setImageUploading(false);
    }
  }

  useEffect(() => {
    if (product) {
      setName(product.name);
      setImageUrl(product.image_url ?? '');
      setSku(product.sku ?? '');
      setBarcode(product.barcode ?? '');
      setCategory(product.category ?? '');
      setPrice(String(product.price));
      setStock(String(product.stock));
      setReorder(String(product.reorder_point));
      setAdjust('0');
    } else {
      setName('');
      setImageUrl('');
      setSku('');
      setBarcode('');
      setCategory('');
      setPrice('');
      setStock('0');
      setReorder(String(settings.low_stock_threshold));
      setAdjust('0');
    }
    setError(null);
  }, [product, visible, settings.low_stock_threshold]);

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
      image_url: imageUrl.trim() || null,
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

          <View style={[styles.row, { alignItems: 'flex-end', marginBottom: spacing(3) }]}>
            <View style={{ flex: 1, marginRight: spacing(2) }}>
              <Text style={styles.label}>Image URL (optional)</Text>
              <TextInput style={[styles.input, { marginBottom: 0 }]} value={imageUrl} onChangeText={setImageUrl} placeholder="https://example.com/item.jpg" />
            </View>
            <Pressable style={[styles.uploadBtn, imageUploading && { opacity: 0.6 }]} onPress={() => void pickImage()} disabled={busy || imageUploading}>
              <Text style={styles.uploadBtnText}>{imageUploading ? 'Uploading…' : lastUploadError ? 'Retry' : 'Upload'}</Text>
            </Pressable>
            {lastUploadError != null ? <Text style={[styles.error, { fontSize: 11 }]} numberOfLines={2}>{String(lastUploadError)}</Text> : null}
          </View>

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

          {categorySuggestions.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {categorySuggestions.map((c) => {
                const active = category.trim().toLowerCase() === c.toLowerCase();
                return (
                  <Pressable
                    key={c}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setCategory(active ? '' : c)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          <Text style={styles.label}>Barcode (for scan-to-add)</Text>
          <TextInput style={styles.input} value={barcode} onChangeText={setBarcode} placeholder="Scan or type product barcode" keyboardType="numbers-and-punctuation" />

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: spacing(2) }}>
              <Text style={styles.label}>Price ({settings.currency_symbol})</Text>
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

function makeStyles(c: import('@/theme').Palette) {
  return createStyleSheet({
    root: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing(4), paddingBottom: spacing(2) },
    title: { fontSize: 20, fontWeight: '800', color: c.primary },
    addButton: { backgroundColor: c.primary, borderRadius: 8, paddingHorizontal: spacing(3), paddingVertical: spacing(2) },
    addText: { color: c.onPrimary, fontWeight: '700' },
    offline: { color: c.warning, fontSize: 12, fontWeight: '600', paddingHorizontal: spacing(4) },
    searchRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing(2),
      marginHorizontal: spacing(4), marginTop: spacing(2),
    },
    search: {
      backgroundColor: c.card, borderRadius: 10, borderWidth: 1, borderColor: c.border,
      flex: 1, paddingHorizontal: spacing(3), paddingVertical: spacing(3), fontSize: 15,
      color: c.text,
    },
    categoryDropdown: {
      flexDirection: 'row', alignItems: 'center', gap: spacing(1),
      backgroundColor: c.card, borderRadius: 10, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: spacing(3), paddingVertical: spacing(2.5),
    },
    categoryLabel: {
      fontSize: 14, color: c.text, fontWeight: '600',
      maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    },
    sortRow: { marginTop: spacing(2), flexGrow: 0 },
    sortRowContent: { paddingHorizontal: spacing(4), gap: spacing(2) },
    sortChip: {
      backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
      borderRadius: 20, paddingHorizontal: spacing(3), paddingVertical: spacing(1.5),
    },
    sortChipActive: { backgroundColor: c.primary, borderColor: c.primary },
    sortChipText: { fontSize: 13, color: c.textMuted, fontWeight: '600' },
    sortChipTextActive: { color: c.onPrimary, fontWeight: '700' },
    list: { padding: spacing(4) },
    card: { backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: spacing(4), marginBottom: spacing(3) },
    cardSelected: { borderColor: c.primary, backgroundColor: withAlpha(c.primary, 0.12) },
    cardContent: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
    thumbWrapper: { width: 48, height: 48, borderRadius: 8, overflow: 'hidden', backgroundColor: c.bg },
    thumbPlaceholder: { width: 48, height: 48, borderRadius: 8, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    thumbPlaceholderText: { fontSize: 20 },
    bulkBar: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), backgroundColor: c.card, marginHorizontal: spacing(4), marginTop: spacing(2), padding: spacing(2), borderRadius: 10, borderWidth: 1, borderColor: c.primary },
    bulkCount: { fontWeight: '700', color: c.primary, fontSize: 13 },
    bulkBtn: { backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: spacing(2.5), paddingVertical: spacing(1.5) },
    bulkBtnText: { fontSize: 12, fontWeight: '700', color: c.text },
    bulkDanger: { backgroundColor: c.danger, borderColor: c.danger },
    bulkClear: { fontSize: 12, color: c.textMuted },
    hintText: { fontSize: 12, color: c.textMuted, textAlign: 'center', marginTop: spacing(2) },
    categoryModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing(4) },
    categoryModalCard: { backgroundColor: c.card, borderRadius: 16, padding: spacing(4), maxHeight: '60%' },
    categoryModalTitle: { fontSize: 16, fontWeight: '700', color: c.text, marginBottom: spacing(3) },
    categoryList: { maxHeight: 300 },
    categoryOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing(2.5), borderBottomWidth: 1, borderBottomColor: c.border },
    categoryOptionText: { fontSize: 15, color: c.text, paddingHorizontal: spacing(2) },
    categoryModalClose: { marginTop: spacing(3), backgroundColor: c.primary, borderRadius: 10, paddingVertical: spacing(2.5), alignItems: 'center' },
    categoryModalCloseText: { color: c.onPrimary, fontWeight: '700', fontSize: 14 },
    name: { fontSize: 16, fontWeight: '700', color: c.text },
    meta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    badgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing(2) },
    badge: { fontSize: 12, fontWeight: '700', paddingHorizontal: spacing(2), paddingVertical: spacing(1), borderRadius: 8, overflow: 'hidden' },
    badgeOk: { color: c.success, backgroundColor: c.successBg },
    badgeLow: { color: c.danger, backgroundColor: c.dangerBg },
    price: { fontSize: 16, fontWeight: '800', color: c.primary },
    empty: { textAlign: 'center', color: c.textMuted, marginTop: spacing(6) },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing(5), maxHeight: '90%' },
    modalTitle: { fontSize: 18, fontWeight: '800', color: c.text, marginBottom: spacing(3) },
    label: { fontSize: 12, fontWeight: '600', color: c.textMuted, marginBottom: spacing(1) },
    input: { borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: spacing(3), paddingVertical: spacing(2.5), fontSize: 15, backgroundColor: c.bg, marginBottom: spacing(3), color: c.text },
    row: { flexDirection: 'row' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1.5), marginTop: -spacing(1.5), marginBottom: spacing(2) },
    chip: { paddingHorizontal: spacing(2.5), paddingVertical: spacing(1), borderRadius: 14, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border },
    chipActive: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { fontSize: 12, color: c.textMuted },
    chipTextActive: { color: c.onPrimary, fontWeight: '700' },
    error: { color: c.danger, fontSize: 13, marginBottom: spacing(2) },
    btn: { flex: 1, borderRadius: 10, paddingVertical: spacing(3), alignItems: 'center' },
    btnGhost: { backgroundColor: c.bg, marginRight: spacing(2) },
    btnGhostText: { color: c.textMuted, fontWeight: '700' },
    btnPrimary: { backgroundColor: c.primary },
    btnPrimaryText: { color: c.onPrimary, fontWeight: '700' },
    uploadBtn: { backgroundColor: c.primaryLight, paddingHorizontal: spacing(3), paddingVertical: spacing(2.5), borderRadius: 8, justifyContent: 'center' },
    uploadBtnText: { color: c.onPrimary, fontWeight: '700', fontSize: 13 },
  });
}
