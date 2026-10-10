import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import type { Profile } from '@/types';

const CHECKIN_KEY = 'mmh.checkedIn';

interface AuthState {
  session: boolean;
  loading: boolean;
  profile: Profile | null;
  checkedIn: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  setCheckedIn: (checkedIn: boolean) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checkedIn, setCheckedInState] = useState(false);

  useEffect(() => {
    let active = true;
    let unsub: (() => void) | undefined;

    // Restore persisted session and profile
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setSession(!!data.session);
      if (data.session) await loadProfile(data.session.user.id);
      setLoading(false);
    })();

    // Subscribe to auth changes for the lifetime of the provider
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(!!sess);
      if (!sess) {
        setProfile(null);
        setCheckedInState(false);
        AsyncStorage.removeItem(CHECKIN_KEY);
      }
    });
    unsub = () => listener.subscription.unsubscribe();

    return () => {
      active = false;
      unsub?.();
    };
  }, []);

  async function loadProfile(userId: string) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) {
      const row = data as Profile;
      setProfile(row);
      // The server's shift state is the source of truth so every device agrees
      // (check in on the phone, the browser knows too). The on-device copy is
      // only a fallback for rows that predate the `checked_in` column.
      const stored = await AsyncStorage.getItem(CHECKIN_KEY);
      setCheckedInState(typeof row.checked_in === 'boolean' ? row.checked_in : stored === 'true');
    }
  }

  async function signIn(email: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return error.message;
    const { data } = await supabase.auth.getUser();
    if (data.user) await loadProfile(data.user.id);
    return null;
  }

  async function signOut(): Promise<void> {
    // Mark the shift ended before the session is destroyed (best-effort)
    if (profile) {
      await supabase
        .from('profiles')
        .update({ checked_in: false })
        .eq('id', profile.id);
      if (checkedIn) {
        await supabase.from('attendance_logs').insert({
          staff_id: profile.id,
          action: 'check_out',
        });
      }
    }
    await supabase.auth.signOut();
    setProfile(null);
    setCheckedInState(false);
    await AsyncStorage.removeItem(CHECKIN_KEY);
  }

  async function setCheckedIn(value: boolean): Promise<void> {
    setCheckedInState(value);
    // Keep the in-memory profile in step so anything reading `profile.checked_in`
    // sees the new value immediately rather than a stale login-time snapshot.
    setProfile((p) => (p ? { ...p, checked_in: value } : p));
    await AsyncStorage.setItem(CHECKIN_KEY, value ? 'true' : 'false');
    if (profile) {
      await supabase
        .from('profiles')
        .update({ checked_in: value, last_check_in: new Date().toISOString() })
        .eq('id', profile.id);
      // Attendance history entry (best-effort — table may predate migration)
      await supabase.from('attendance_logs').insert({
        staff_id: profile.id,
        action: value ? 'check_in' : 'check_out',
      });
    }
  }

  async function refreshProfile(): Promise<void> {
    const { data } = await supabase.auth.getUser();
    if (data.user) await loadProfile(data.user.id);
  }

  const value = useMemo(
    () => ({ session, loading, profile, checkedIn, signIn, signOut, setCheckedIn, refreshProfile }),
    [session, loading, profile, checkedIn]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
