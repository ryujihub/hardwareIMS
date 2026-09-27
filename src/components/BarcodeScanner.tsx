import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, spacing } from '@/theme';

interface Props {
  visible: boolean;
  onScanned: (barcode: string) => void;
  onClose: () => void;
}

// Camera scanner with manual barcode entry fallback (web cameras often
// can't scan, so staff can always key the digits instead).
export function BarcodeScanner({ visible, onScanned, onClose }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [locked, setLocked] = useState<string | null>(null);

  // Re-allow scanning each time the modal opens
  useEffect(() => {
    if (visible) {
      setLocked(null);
      setManual('');
    }
  }, [visible]);

  function handleScan(data: string) {
    if (locked) return; // debounce multiple fires for the same code
    setLocked(data);
    onScanned(data);
  }

  if (!visible) return null;

  return (
    <View style={styles.backdrop}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>📷 Scan Barcode</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>

        {Platform.OS !== 'web' && permission?.granted ? (
          <View style={styles.cameraWrap}>
            <CameraView
              style={styles.camera}
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e', 'qr'] }}
              onBarcodeScanned={({ data }) => data && handleScan(data)}
            />
            <Text style={styles.hint}>Point the camera at the product barcode</Text>
          </View>
        ) : Platform.OS !== 'web' ? (
          <View style={styles.centerBlock}>
            <Text style={styles.hint}>Camera permission is needed to scan barcodes.</Text>
            <Pressable style={styles.primaryBtn} onPress={() => void requestPermission()}>
              <Text style={styles.primaryText}>Allow Camera</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.centerBlock}>
            <Text style={styles.hint}>Camera scanning isn't available in the browser — enter the barcode below.</Text>
          </View>
        )}

        <View style={styles.manualRow}>
          <TextInput
            style={styles.manualInput}
            value={manual}
            onChangeText={setManual}
            placeholder="…or type barcode digits"
            keyboardType="number-pad"
            onSubmitEditing={() => manual.trim() && handleScan(manual.trim())}
          />
          <Pressable
            style={styles.primaryBtn}
            onPress={() => manual.trim() && handleScan(manual.trim())}
          >
            <Text style={styles.primaryText}>Find</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: spacing(6), zIndex: 100 },
  sheet: { backgroundColor: colors.card, borderRadius: 16, padding: spacing(4) },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(3) },
  title: { fontSize: 16, fontWeight: '800', color: colors.text },
  close: { color: colors.danger, fontWeight: '600' },
  cameraWrap: { borderRadius: 12, overflow: 'hidden', marginBottom: spacing(3) },
  camera: { width: '100%', aspectRatio: 1.4 },
  hint: { fontSize: 13, color: colors.textMuted, textAlign: 'center', padding: spacing(2) },
  centerBlock: { marginBottom: spacing(3) },
  manualRow: { flexDirection: 'row', gap: spacing(2) },
  manualInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: spacing(3), paddingVertical: spacing(2.5), fontSize: 15, backgroundColor: colors.bg },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: spacing(4), justifyContent: 'center' },
  primaryText: { color: colors.white, fontWeight: '700' },
});
