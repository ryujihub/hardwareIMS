import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@/navigation/useNewOrderNav';
import { useNewOrder } from '@/hooks/useNewOrder';
import { useStyles } from '@/services/settings';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { isLowStock } from '@/utils/stock';
import { colors, spacing, createStyleSheet } from '@/theme';
import type { CartItem, Product } from '@/types';

export function ProductSelectionScreen() {
  const navigation = useNavigation();
  const styles = useStyles(makeStyles);
  const {
    settings,
    query,
    filtered,
    cart,
    offline,
    scanning,
    load,
    setQuery,
    setScanning,
    addToCart,
    handleBarcode,
  } = useNewOrder();

  const scrollView = useRef<ScrollView>(null);
  const rowLayouts = useRef<Record<string, { y: number; h: number }>>({});
  const scrollOffset = useRef(0);
  const viewportHeight = useRef(0);
  const [lastTouchedProductId, setLastTouchedProductId] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const reviewDisabled = cart.length === 0;

  function onAdd(p: Product) {
    addToCart(p);
    setLastTouchedProductId(p.id);
  }

  // Scroll the last-touched product row into view when it's off-screen.
  useEffect(() => {
    if (lastTouchedProductId == null) return;
    const layout = rowLayouts.current[lastTouchedProductId];
    if (!layout) return;
    const { y, h } = layout;
    if (h <= 0 || viewportHeight.current <= 0) return;

    const offsetY = scrollOffset.current;
    if (y >= offsetY && y + h <= offsetY + viewportHeight.current) return;

    scrollView.current?.scrollTo({ animated: true, y: Math.max(0, y) });
  }, [lastTouchedProductId]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>🛒 Add products</Text>
        {offline ? <Text style={styles.offlineTag}>OFFLINE</Text> : null}
      </View>

      <ScrollView
        ref={scrollView}
        contentContainerStyle={styles.content}
        scrollEventThrottle={16}
        onScroll={(e) => {
          scrollOffset.current = e.nativeEvent.contentOffset.y;
        }}
        onLayout={(e) => {
          viewportHeight.current = e.nativeEvent.layout.height;
        }}
      >
        <View style={styles.addProductsHeader}>
          <Text style={styles.label}>Add products</Text>
          <Pressable style={styles.scanBtn} onPress={() => setScanning(true)}>
            <Text style={styles.scanBtnText}>📷 Scan</Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="🔍 Search products…"
          placeholderTextColor={colors.textMuted}
        />

        {filtered.map((p) => {
          const low = isLowStock(p, settings.low_stock_threshold);
          const inCart: CartItem | undefined = cart.find((i) => i.productId === p.id);
          return (
            <ProductRow
              key={p.id}
              product={p}
              low={low}
              inCart={inCart}
              onAdd={() => onAdd(p)}
              onLayout={(y: number, h: number) => {
                rowLayouts.current[p.id] = { y, h };
              }}
              styles={styles}
            />
          );
        })}

        {filtered.length === 0 ? <Text style={styles.empty}>No products found.</Text> : null}

        {/* Cart preview */}
        {cart.length > 0 ? (
          <View style={styles.cartPreview}>
            <Text style={styles.section}>🧾 Cart ({cart.length})</Text>
            {cart.map((i) => (
              <View key={i.productId} style={styles.cartRow}>
                {i.image_url ? (
                  <View style={[styles.thumbWrapper, { width: 36, height: 36, marginRight: spacing(2) }]}>
                    <Image source={{ uri: i.image_url }} style={{ width: 36, height: 36, borderRadius: 6 }} onError={(e) => console.warn('Image failed:', i.image_url, e.nativeEvent.error)} />
                  </View>
                ) : (
                  <View style={[styles.thumbWrapper, { width: 36, height: 36, marginRight: spacing(2), backgroundColor: colors.bg }]} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.productName}>{i.name}</Text>
                  <Text style={styles.productMeta}>{i.quantity} item{i.quantity === 1 ? '' : 's'}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* Review order button — pushes the checkout screen */}
        <Pressable
          style={[styles.reviewBtn, reviewDisabled && { opacity: 0.5 }]}
          onPress={() => {
            if (reviewDisabled) {
              Alert.alert('Empty cart', 'Add at least one product first.');
              return;
            }
            navigation.navigate('checkout');
          }}
          disabled={reviewDisabled}
        >
          <Text style={styles.reviewBtnText}>Review order →</Text>
        </Pressable>

        <View style={{ height: spacing(2) }} />
      </ScrollView>

      <BarcodeScanner
        visible={scanning}
        onScanned={(code) => void handleBarcode(code, { addToCart })}
        onClose={() => setScanning(false)}
      />
    </View>
  );
}

function ProductRow({
  product,
  low,
  inCart,
  onAdd,
  onLayout,
  styles,
}: {
  product: Product;
  low: boolean;
  inCart: CartItem | undefined;
  onAdd: () => void;
  onLayout: (y: number, h: number) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View
      style={styles.productRow}
      onLayout={(e) => {
        const { y, height } = e.nativeEvent.layout;
        onLayout(y, height);
      }}
    >
      {product.image_url ? (
        <View style={styles.thumbWrapper}>
          <Image
            source={{ uri: product.image_url }}
            style={{ width: 40, height: 40, borderRadius: 6 }}
            onError={(e) => console.warn('Image failed:', product.image_url, e.nativeEvent.error)}
          />
        </View>
      ) : (
        <View style={[styles.thumbWrapper, { backgroundColor: colors.bg }]} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.productName}>{product.name}</Text>
        <Text style={[styles.productMeta, low && { color: colors.danger }]}>
          {product.stock === 0 ? 'Out of stock' : `In stock: ${product.stock}`} · {product.price != null ? `₱${Number(product.price).toFixed(2)}` : '—'}
        </Text>
      </View>
      {inCart ? <Text style={styles.inCart}>×{inCart.quantity}</Text> : null}
      <Pressable
        style={[styles.addBtn, product.stock === 0 && { opacity: 0.4 }]}
        onPress={onAdd}
        disabled={product.stock === 0}
      >
        <Text style={styles.addBtnText}>+ Add</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(c: import('@/theme').Palette) {
  return createStyleSheet({
    root: { flex: 1, backgroundColor: c.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing(4), paddingBottom: spacing(2) },
    title: { fontSize: 20, fontWeight: '800', color: c.primary },
    offlineTag: { color: c.danger, backgroundColor: c.dangerBg, fontWeight: '800', fontSize: 11, paddingHorizontal: spacing(2), paddingVertical: spacing(1), borderRadius: 8, overflow: 'hidden' },
    content: { padding: spacing(4), paddingTop: 0, paddingBottom: spacing(8) },
    label: { fontSize: 12, fontWeight: '600', color: c.textMuted, marginBottom: spacing(1), marginTop: spacing(2) },
    search: { borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: spacing(3), paddingVertical: spacing(3), fontSize: 15, backgroundColor: c.card, marginBottom: spacing(3), color: c.text },
    addProductsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    scanBtn: { backgroundColor: c.primaryLight, borderRadius: 8, paddingHorizontal: spacing(3), paddingVertical: spacing(1.5) },
    scanBtnText: { color: c.onPrimary, fontWeight: '700', fontSize: 13 },
    productRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 10, borderWidth: 1, borderColor: c.border, padding: spacing(3), marginBottom: spacing(2) },
    thumbWrapper: { width: 40, height: 40, borderRadius: 6, overflow: 'hidden', backgroundColor: c.bg, marginRight: spacing(3) },
    productName: { fontSize: 14, fontWeight: '600', color: c.text },
    productMeta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    inCart: { fontSize: 12, fontWeight: '700', color: c.primary, marginRight: spacing(2) },
    addBtn: { backgroundColor: c.primary, borderRadius: 8, paddingHorizontal: spacing(3), paddingVertical: spacing(2) },
    addBtnText: { color: c.onPrimary, fontWeight: '700', fontSize: 13 },
    empty: { textAlign: 'center', color: c.textMuted, marginVertical: spacing(3) },
    cartPreview: { marginTop: spacing(2) },
    section: { fontSize: 15, fontWeight: '700', color: c.text, marginBottom: spacing(2) },
    cartRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 10, borderWidth: 1, borderColor: c.border, padding: spacing(3), marginBottom: spacing(2) },
    reviewBtn: { backgroundColor: c.primary, borderRadius: 12, paddingVertical: spacing(4), alignItems: 'center', marginTop: spacing(4), marginBottom: spacing(2) },
    reviewBtnText: { color: c.onPrimary, fontWeight: '800', fontSize: 15 },
  });
}
