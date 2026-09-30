import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// EXPO_PUBLIC_ vars are available in local `expo start` via .env,
// but EAS cloud builds require them to be set on the server OR hardcoded.
// These are public anon keys — safe to embed in the bundle.
const url =
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  'https://sbxjobepecuyhkmbfysw.supabase.co';
const anonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNieGpvYmVwZWN1eWhrbWJmeXN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0Nzc1NzksImV4cCI6MjEwNjA1MzU3OX0.YApgBQR9JQlbaCCiIfOtiRo0cpGNA7tTMtYFAt3qVWc';

// Single Supabase client for the whole app.
// Sessions persist to AsyncStorage so staff stay logged in across restarts.
export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Throwaway client used only by admins creating accounts. Auth events on this
// instance don't touch the main client, so signing up a new user never
// replaces the admin's own session.
export const ephemeralClient = createClient(url, anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
