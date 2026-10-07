import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/services/auth';
import { SettingsProvider, useStyles, useSettings } from '@/services/settings';
import { MainTabs } from '@/navigation';
import { LoginScreen } from '@/screens/auth/LoginScreen';
import { syncQueuedOrders } from '@/services/db';
import { colors } from '@/theme';

function Root() {
  const { session, loading } = useAuth();

  if (loading) {
    const styles = useStyles(makeStyles);
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return session ? <MainTabs /> : <LoginScreen />;
}

// Status bar adapts to dark mode (light icons on dark backgrounds)
function ThemedStatusBar() {
  const { settings } = useSettings();
  return <StatusBar style={settings.dark_mode ? 'light' : 'dark'} />;
}

// Phone-width column that respects the status bar and gesture navbar
function AppShell() {
  const insets = useSafeAreaInsets();
  const styles = useStyles(makeStyles);
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
      <SettingsProvider>
        <SafeAreaProvider>
          <ThemedStatusBar />
          {/* Phone-width column: fills the screen on phones, centers on web/desktop */}
          <View style={shellStyles.shell}>
            <AppShell />
          </View>
        </SafeAreaProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}

const shellStyles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#0b1220', alignItems: 'center' },
});

function makeStyles() {
  return StyleSheet.create({
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
    appColumn: { width: '100%', maxWidth: 480, flex: 1, backgroundColor: colors.bg },
  });
}
