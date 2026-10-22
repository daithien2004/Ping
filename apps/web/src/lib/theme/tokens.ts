/**
 * Nguồn token duy nhất của web (ADR-0051, T0.7/TF.3).
 * Mọi màu/khoảng cách/radius/typography/motion/z-index đều khai báo ở đây.
 * Component KHÔNG được dùng hex hoặc khoảng cách tùy ý ngoài token này.
 */

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

/**
 * Thời lượng chuyển động (ms). Trần 200 ms cho hiệu ứng vào/ra của vi tương tác (TF.9): antd dùng
 * `slow` cho modal/drawer, nên đặt bằng `normal` thay vì để 320 ms như mặc định.
 */
export const motion = {
  fast: 120,
  normal: 200,
  slow: 200,
} as const;

export const zIndex = {
  base: 0,
  dropdown: 1000,
  sticky: 1020,
  modal: 1050,
  toast: 1100,
  tooltip: 1200,
} as const;

export const typography = {
  fontFamily: {
    sans: 'var(--font-geist-sans), system-ui, sans-serif',
    mono: 'var(--font-geist-mono), ui-monospace, monospace',
  },
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.7,
  },
} as const;

/** Palette cơ sở (oklch-ish hex gần đúng cho antd). */
export const palette = {
  violet: {
    300: '#b8a3ff',
    500: '#7c5cff',
    600: '#6a4cff',
  },
  ink: {
    50: '#f7f7fb',
    100: '#eeeef5',
    150: '#e4e4ee',
    200: '#d6d6e4',
    400: '#a8a8bc',
    500: '#7a7a92',
    700: '#4a4a5e',
    800: '#33334a',
    850: '#2a2a3d',
    900: '#212133',
    950: '#171726',
  },
  green: { 600: '#2f9e6a' },
  red: { 400: '#f07a6a', 600: '#d63b2a' },
  white: '#ffffff',
} as const;

export type ThemeMode = 'light' | 'dark';

export interface SemanticColors {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  border: string;
  input: string;
  link: string;
  rail: string;
  railForeground: string;
}

export const lightColors: SemanticColors = {
  background: palette.ink[50],
  foreground: palette.ink[950],
  card: palette.white,
  cardForeground: palette.ink[950],
  popover: palette.white,
  popoverForeground: palette.ink[950],
  primary: palette.violet[600],
  primaryForeground: palette.white,
  secondary: palette.ink[150],
  secondaryForeground: palette.ink[950],
  muted: palette.ink[100],
  mutedForeground: palette.ink[500],
  accent: palette.ink[150],
  accentForeground: palette.ink[950],
  destructive: palette.red[600],
  border: palette.ink[200],
  input: palette.ink[200],
  link: palette.violet[600],
  rail: palette.ink[950],
  railForeground: palette.ink[50],
};

export const darkColors: SemanticColors = {
  background: palette.ink[950],
  foreground: palette.ink[50],
  card: palette.ink[900],
  cardForeground: palette.ink[50],
  popover: palette.ink[900],
  popoverForeground: palette.ink[50],
  primary: palette.violet[500],
  primaryForeground: palette.white,
  secondary: palette.ink[800],
  secondaryForeground: palette.ink[50],
  muted: palette.ink[850],
  mutedForeground: palette.ink[400],
  accent: palette.ink[800],
  accentForeground: palette.ink[50],
  destructive: palette.red[400],
  border: palette.ink[800],
  input: palette.ink[800],
  link: palette.violet[300],
  rail: palette.ink[900],
  railForeground: palette.ink[50],
};

export function semanticColors(mode: ThemeMode): SemanticColors {
  return mode === 'dark' ? darkColors : lightColors;
}

/** CSS variables (--ping-*) cho component tự dựng. */
export function cssVariables(mode: ThemeMode): Record<string, string> {
  const c = semanticColors(mode);
  return {
    '--ping-color-bg': c.background,
    '--ping-color-fg': c.foreground,
    '--ping-color-card': c.card,
    '--ping-color-primary': c.primary,
    '--ping-color-primary-fg': c.primaryForeground,
    '--ping-color-muted': c.muted,
    '--ping-color-muted-fg': c.mutedForeground,
    '--ping-color-border': c.border,
    '--ping-color-destructive': c.destructive,
    '--ping-color-link': c.link,
    '--ping-radius-sm': `${radius.sm}px`,
    '--ping-radius-md': `${radius.md}px`,
    '--ping-radius-lg': `${radius.lg}px`,
    '--ping-radius-xl': `${radius.xl}px`,
    '--ping-space-1': `${spacing[1]}px`,
    '--ping-space-2': `${spacing[2]}px`,
    '--ping-space-3': `${spacing[3]}px`,
    '--ping-space-4': `${spacing[4]}px`,
    '--ping-font-sans': typography.fontFamily.sans,
    '--ping-font-mono': typography.fontFamily.mono,
    '--ping-motion-fast': `${motion.fast}ms`,
    '--ping-motion-normal': `${motion.normal}ms`,
  };
}
