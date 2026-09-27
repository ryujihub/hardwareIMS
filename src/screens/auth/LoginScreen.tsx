import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/services/auth';
import { colors, spacing } from '@/theme';

export function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setBusy(true);
    setError(null);
    const err = await signIn(email.trim(), password);
    if (err) setError(err);
    setBusy(false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.logo}>🏢</Text>
        <Text style={styles.title}>Metro Manila Hills</Text>
        <Text style={styles.subtitle}>Construction Supply & Trading — Inventory System</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@mmhills.com"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />

        <Text style={styles.label}>Password</Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
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

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={[styles.button, busy && { opacity: 0.6 }]} onPress={handleSignIn} disabled={busy}>
          {busy ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </Pressable>
      </View>

      <Text style={styles.footer}>First time? Ask an admin to create your account.</Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primary, justifyContent: 'center', padding: spacing(6) },
  header: { alignItems: 'center', marginBottom: spacing(8) },
  logo: { fontSize: 48, marginBottom: spacing(2) },
  title: { fontSize: 26, fontWeight: '800', color: colors.white },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: spacing(1), textAlign: 'center' },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: spacing(6) },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: spacing(1) },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(3),
    fontSize: 16,
    marginBottom: spacing(4),
    backgroundColor: colors.bg,
  },
  error: { color: colors.danger, fontSize: 13, marginBottom: spacing(3) },
  passwordRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing(4) },
  eyeBtn: {
    marginLeft: spacing(2), width: 48, height: 48, borderRadius: 10,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  eyeText: { fontSize: 20 },
  button: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: spacing(3.5), alignItems: 'center' },
  buttonText: { color: colors.white, fontWeight: '700', fontSize: 16 },
  footer: { color: 'rgba(255,255,255,0.6)', fontSize: 12, textAlign: 'center', marginTop: spacing(6) },
});
