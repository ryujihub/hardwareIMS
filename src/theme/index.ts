// Design system — shared across every screen.
// The palette is dynamic: SettingsProvider calls applyPalette() with the
// admin's customization, and every screen re-renders with the new colors
// (screens consume the theme version via useStyles/useSettings).
export interface Palette {
  primary: string;
  primaryLight: string;
  accent: string;
  success: string;
  successBg: string;
  danger: string;
  dangerBg: string;
  warning: string;
  warningBg: string;
  bg: string;
  card: string;
  text: string;
  textMuted: string;
  border: string;
  white: string;
  // Text drawn on top of primary/success/danger-colored buttons.
  // White in light mode; adapts to the chosen primary in dark mode.
  onPrimary: string;
}

// ---------- color helpers ----------

function parseHex(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const num = parseInt(h, 16);
  if (Number.isNaN(num) || h.length !== 6) return { r: 30, g: 58, b: 95 }; // fallback: default primary
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function mix(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  const ch = (p: number, q: number) => Math.round(p + (q - p) * t);
  const to2 = (n: number) => n.toString(16).padStart(2, '0');
  return `#${to2(ch(x.r, y.r))}${to2(ch(x.g, y.g))}${to2(ch(x.b, y.b))}`;
}

// White or near-black depending on the background's luminance
export function readableText(bg: string): string {
  const { r, g, b } = parseHex(bg);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.65 ? '#0f172a' : '#ffffff';
}

// Same color with alpha, e.g. tinted selection backgrounds
export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---------- palettes ----------

function lightPalette(primary: string, accent: string): Palette {
  return {
    primary,
    // Match the original default exactly when the default primary is used
    primaryLight: primary.toLowerCase() === '#1e3a5f' ? '#2d5a8e' : mix(primary, '#ffffff', 0.25),
    accent,
    success: '#16a34a',
    successBg: '#dcfce7',
    danger: '#dc2626',
    dangerBg: '#fee2e2',
    warning: '#d97706',
    warningBg: '#fef3c7',
    bg: '#f1f5f9',
    card: '#ffffff',
    text: '#0f172a',
    textMuted: '#64748b',
    border: '#e2e8f0',
    white: '#ffffff',
    onPrimary: readableText(primary),
  };
}

function darkPalette(primary: string, accent: string): Palette {
  return {
    primary: mix(primary, '#ffffff', 0.12), // lift the brand color off the dark bg
    primaryLight: mix(primary, '#ffffff', 0.35),
    accent,
    success: '#22c55e',
    successBg: 'rgba(34,197,94,0.16)',
    danger: '#f87171',
    dangerBg: 'rgba(248,113,113,0.16)',
    warning: '#fbbf24',
    warningBg: 'rgba(251,191,36,0.16)',
    bg: '#0b1220',
    card: '#161e33',
    text: '#eef2f7',
    textMuted: '#8fa0b8',
    border: '#263250',
    white: '#f8fafc',
    onPrimary: readableText(mix(primary, '#ffffff', 0.12)),
  };
}

// ---------- mutable shared theme ----------

// The default light palette matches the pre-customization design exactly.
export const colors: Palette = lightPalette('#1e3a5f', '#f59e0b');

export const spacing = (n: number): number => n * 4;

export const cardShadow = {
  backgroundColor: colors.card,
  borderRadius: 12,
  padding: spacing(4),
  marginBottom: spacing(3),
  borderWidth: 1,
  borderColor: colors.border,
};

export const bigButton = {
  backgroundColor: colors.primary,
  borderRadius: 12,
  paddingVertical: spacing(4),
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

// Recolors the shared theme in place. Screens keep importing `colors`
// normally; on the next render they read the new values.
export function applyPalette(primary: string, accent: string, dark: boolean): void {
  const next = dark ? darkPalette(primary, accent) : lightPalette(primary, accent);
  Object.assign(colors, next);
  cardShadow.backgroundColor = colors.card;
  cardShadow.borderColor = colors.border;
  bigButton.backgroundColor = colors.primary;
}

// A drop-in replacement for StyleSheet.create that just returns the plain object.
// We use this instead of StyleSheet.create so React Native Web evaluates styles 
// at render time instead of statically caching them, enabling live theme toggle.
type NamedStyles<T> = import('react-native').StyleSheet.NamedStyles<T>;
export function createStyleSheet<T extends NamedStyles<T> | NamedStyles<any>>(styles: T | NamedStyles<T>): T {
  return styles as T;
}
