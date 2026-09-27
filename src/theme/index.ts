// Design system — shared across every screen
export const colors = {
  primary: '#1e3a5f',
  primaryLight: '#2d5a8e',
  accent: '#f59e0b',
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
};

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
