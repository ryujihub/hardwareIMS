import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth';
import { fetchSettings, updateSettings } from './db';
import { applyPalette, colors, type Palette } from '@/theme';
import { setCurrencySymbol } from '@/utils/format';
import { DEFAULT_SETTINGS, type Settings } from '@/types';

const CACHE_KEY = 'cache.settings';

interface SettingsState {
  settings: Settings;
  /** Bumps whenever the palette/settings change — screens memoize styles on it */
  version: number;
  /** Live snapshot of the current Palette — changes on every applyPalette/applyLive call */
  palette: Palette;
  offline: boolean;
  saveSettings: (next: Settings) => Promise<string | null>;
  reload: () => Promise<void>;
  /** Applies the theme in place and bumps the style version for live preview (not persisted). */
  applyLive: (primary: string, accent: string, dark: boolean) => void;
}

const SettingsContext = createContext<SettingsState | null>(null);

// Latest settings for non-React code (PDF/CSV report builders)
let currentSettings: Settings = DEFAULT_SETTINGS;
export function getSettings(): Settings {
  return currentSettings;
}

// Whole-settings diff → only changed columns are written to the settings row
function diffSettings(a: Settings, b: Settings): Partial<Settings> {
  const diff: Partial<Settings> = {};
  const keys = Object.keys(a) as (keyof Settings)[];
  for (const k of keys) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
      (diff as Record<string, unknown>)[k] = b[k];
    }
  }
  return diff;
}

function mergeDefaults(raw: Partial<Settings> | null | undefined, base: Settings): Settings {
  return {
    ...base,
    ...raw,
    payment_methods:
      Array.isArray(raw?.payment_methods) && raw!.payment_methods!.length > 0
        ? raw!.payment_methods!
        : base.payment_methods,
    categories: Array.isArray(raw?.categories) ? raw!.categories! : base.categories,
  };
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [offline, setOffline] = useState(false);
  const [version, setVersion] = useState(0);
  // Live palette snapshot: updated on every apply/applyLive so useStyles gets fresh colors.
  const [palette, setPalette] = useState<Palette>({ ...colors });

  const apply = useCallback((next: Settings) => {
    currentSettings = next;
    setSettings(next);
    applyPalette(next.primary_color, next.accent_color, next.dark_mode);
    setCurrencySymbol(next.currency_symbol);
    // Snapshot current colors into React state so every useStyles consumer re-renders
    setPalette({ ...colors });
    setVersion((v) => v + 1);
  }, []);

  const reload = useCallback(async () => {
    // Serve the cached snapshot instantly, then refresh from the server
    const cachedRaw = await AsyncStorage.getItem(CACHE_KEY);
    if (cachedRaw) {
      try {
        apply(mergeDefaults(JSON.parse(cachedRaw) as Partial<Settings>, DEFAULT_SETTINGS));
      } catch {
        // Corrupt cache — ignore and wait for the server copy
      }
    }
    const res = await fetchSettings();
    setOffline(res.offline);
    // Only overwrite the applied/cached settings when the server answered —
    // a failed fetch returns defaults and must not wipe the store's branding.
    if (!res.offline) {
      apply(res.data);
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(res.data));
    }
  }, [apply]);

  // Load customization on launch and again once the user signs in
  // (RLS blocks reads before login, so the first pass may be defaults).
  useEffect(() => {
    void reload();
  }, [session, reload]);

  const saveSettings = useCallback(
    async (next: Settings): Promise<string | null> => {
      const patch = diffSettings(settings, next);
      if (Object.keys(patch).length === 0) return null;
      const { error } = await updateSettings(patch);
      if (error) return error;
      apply(next);
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next));
      return null;
    },
    [settings, apply]
  );

  // Live preview for the Settings panel switch/colors without persisting yet.
  // Currency is intentionally left unchanged — only a real save mutates it.
  const applyLive = useCallback(
    (primary: string, accent: string, dark: boolean) => {
      applyPalette(primary, accent, dark);
      setPalette({ ...colors });
      setVersion((v) => v + 1);
    },
    []
  );

  const value = useMemo(
    () => ({ settings, version, palette, offline, saveSettings, reload, applyLive }),
    [settings, version, palette, offline, saveSettings, reload, applyLive]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsState {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}

// Rebuilds a StyleSheet whenever the customization (theme) changes.
// makeStyles receives the live Palette so each version bump gets fresh color values,
// bypassing the RNW StyleSheet class-name cache.
// Usage:  const styles = useStyles(makeStyles);
export function useStyles<T>(make: (p: Palette) => T): T {
  const { version, palette } = useSettings();
  return useMemo(() => make(palette), [version]); // eslint-disable-line react-hooks/exhaustive-deps
}
