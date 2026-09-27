import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/services/auth';
import { MainTabs } from '@/navigation';
import { LoginScreen } from '@/screens/auth/LoginScreen';
import { syncQueuedOrders } from '@/services/db';
import { colors } from '@/theme';

function Root() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return session ? <MainTabs /> : <LoginScreen />;
}

// Phone-width column that respects the status bar and gesture navbar
function AppShell() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.appColumn, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Root />
    </View>
  );
}

export default function App() {
  // Offline-first: whenever connectivity returns (or at launch), flush queued orders
  useEffect(() => {
    void syncQueuedOrders();
    const unsub = NetInfo.addEventListener((state) => {
      if (state.isConnected) void syncQueuedOrders();
    });
    return () => unsub();
  }, []);

  return (
    <AuthProvider>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {/* Phone-width column: fills the screen on phones, centers on web/desktop */}
        <View style={styles.shell}>
          <AppShell />
        </View>
      </SafeAreaProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#0b1220', alignItems: 'center' },
  appColumn: { width: '100%', maxWidth: 480, flex: 1, backgroundColor: colors.bg },
});
