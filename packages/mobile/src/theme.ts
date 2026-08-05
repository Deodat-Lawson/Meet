/** Design tokens, kept in step with the web client's CSS custom properties. */
export const colors = {
  bg: '#0e1014',
  surface: '#16191f',
  surface2: '#1d2129',
  surface3: '#262b35',
  border: '#2c313b',
  text: '#eef1f6',
  textDim: '#9aa3b2',
  textFaint: '#6b7382',
  accent: '#2d8cff',
  accentHover: '#4a9dff',
  danger: '#e8503a',
  success: '#22c55e',
  warn: '#f59e0b',
  black: '#000000',
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

export const qualityColor: Record<string, string> = {
  excellent: colors.success,
  good: '#86c440',
  poor: colors.warn,
  critical: colors.danger,
  disconnected: colors.textFaint,
};

/**
 * React Native dropped `StyleSheet.absoluteFillObject` from its public types, so
 * this is the spreadable equivalent for use inside `StyleSheet.create`.
 */
export const absoluteFill = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
} as const;
