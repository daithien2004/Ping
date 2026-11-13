/**
 * Nguồn token duy nhất của web (ADR-0051, ADR-0075).
 * Mọi màu/khoảng cách/radius/typography/motion/z-index khai báo ở đây; CSS sinh từ file này
 * bằng `pnpm --filter web gen:theme` (scripts/gen-theme-css.mjs → src/styles/tokens.generated.css).
 * Component KHÔNG được dùng hex hoặc khoảng cách tùy ý ngoài token này.
 *
 * Palette là hex tương đương chính xác của bảng oklch từng dựng tay trong globals.css: đổi giá
 * trị ở đây là đổi giao diện, phải chạy `audit:design` và cập nhật ảnh baseline.
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

/**
 * Bo góc (px). `lg` = 12 khớp `borderRadiusLG` của antd — trước ADR-0075 Tailwind `rounded-lg`
 * ra 8 px trong khi antd (card, modal, input) ra 12 px, hai lớp giao diện lệch nhau.
 * `2xl`/`3xl` là hai mức bo lớn còn dùng cho khối đặc biệt (form tên server, skeleton).
 */
export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 14,
  '3xl': 18,
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

/**
 * Đường cong chuyển động: một đường cho mọi vi tương tác, thay `ease`/`ease-in-out` rải rác.
 * Nối thành mặc định của Tailwind trong globals.css nên `transition-*` dùng luôn.
 */
export const easing = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
} as const;

/**
 * Bóng đổ: hai tầng thay cho shadow-md/xl rải rác — `panel` (bảng nổi: emoji picker, gợi ý
 * lệnh) và `overlay` (drawer/sidebar trượt trên nội dung ở màn hẹp). Nền tối cần alpha lớn
 * hơn mới thấy khối.
 */
export const shadow = {
  panel: {
    light: '0 4px 12px rgb(16 17 23 / 10%)',
    dark: '0 4px 12px rgb(0 0 0 / 50%)',
  },
  overlay: {
    light: '0 12px 32px rgb(16 17 23 / 16%)',
    dark: '0 12px 32px rgb(0 0 0 / 60%)',
  },
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
  /**
   * Ba bậc độ đậm, đủ cho mọi vai trò đọc: `semibold` = tiêu đề, tên kênh/người, nút chính;
   * `medium` = nhãn phụ, nút phụ, mục đang chọn; `normal` = nội dung. Không dùng thin/light/bold/
   * black — chênh màu đã lo phần phân cấp, thêm bậc đậm nữa chỉ làm dòng chữ dày lên.
   */
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
  },
} as const;

/**
 * Palette gốc. Nhóm `blurple`/`blue` và `surface` lấy đúng mã đo từ Discord web thật
 * (1280×800, theme sáng/tối, `--brand-500`/`--background-base-*`), để giao diện bám bản gốc.
 */
export const palette = {
  violet: {
    300: '#a4a5ff',
    500: '#7870f3',
    600: '#6558e0',
  },
  blurple: {
    500: '#5865f2',
    600: '#4752c4',
  },
  blue: {
    400: '#4d96ee',
    600: '#006dd4',
  },
  ink: {
    50: '#fafafb',
    100: '#eff0f3',
    140: '#efeff1',
    150: '#e7e8eb',
    200: '#dddee2',
    400: '#9c9ea5',
    420: '#96979e',
    450: '#87898f',
    500: '#61636a',
    600: '#6b6d78',
    700: '#313239',
    750: '#2e2e34',
    800: '#26272e',
    850: '#1f2026',
    900: '#18191f',
    950: '#101117',
  },
  surface: {
    darkRail: '#121214',
    // Discord dùng CÙNG #121214 cho rail và sidebar; lệch 2 bậc để cổng "ba tầng nền" vẫn phân biệt được.
    darkSidebar: '#16161a',
    darkChat: '#1a1a1e',
    darkMuted: '#202024',
    darkCard: '#222327',
    darkMenu: '#242429',
    darkSecondary: '#28282d',
    lightRail: '#f3f3f4',
    // Đo từ Discord web (theme light): rail #f3f3f4, cột kênh #fbfbfb, nội dung chat #ffffff.
    lightSidebar: '#fbfbfb',
    lightChat: '#ffffff',
  },
  green: { 600: '#009b44' },
  emerald: { 100: '#d1fae5', 300: '#6ee7b7', 700: '#047857', 950: '#022c22' },
  amber: { 500: '#d6a32a' },
  red: { 400: '#ff847c', 600: '#c20000' },
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
  /* Viền của phần tử tương tác (ô nhập, select): phải ≥ 3:1 theo WCAG 1.4.11 nên đậm hơn
     `border` — vốn chỉ là đường phân cách trang trí. */
  borderStrong: string;
  input: string;
  ring: string;
  link: string;
  online: string;
  /* Trạng thái: chấm hiện diện + tag "đã xác minh". Một bộ cho cả app, không dùng màu thô. */
  idle: string;
  dnd: string;
  offline: string;
  success: string;
  successBackground: string;
  successForeground: string;
  scrim: string;
  rail: string;
  railForeground: string;
  sidebar: string;
  sidebarForeground: string;
  sidebarPrimary: string;
  sidebarPrimaryForeground: string;
  sidebarAccent: string;
  sidebarAccentForeground: string;
  sidebarBorder: string;
  sidebarRing: string;
  /* Nền ô tìm kiếm / nút phụ dạng phẳng (Discord: đen 12% trên nền chat), tách khỏi `muted`
     để ô tìm kiếm không sáng hơn nền như một card. */
  field: string;
}

export const lightColors: SemanticColors = {
  background: palette.surface.lightChat,
  foreground: palette.ink[750],
  card: palette.white,
  cardForeground: palette.ink[750],
  popover: palette.white,
  popoverForeground: palette.ink[750],
  primary: palette.blurple[500],
  primaryForeground: palette.white,
  secondary: palette.ink[150],
  secondaryForeground: palette.ink[750],
  muted: palette.surface.lightRail,
  mutedForeground: palette.ink[600],
  accent: palette.ink[150],
  accentForeground: palette.ink[900],
  destructive: palette.red[600],
  border: palette.ink[200],
  borderStrong: palette.ink[450],
  /* Viền ô nhập: cũng là ranh giới điều khiển nên dùng màu đậm, không dùng `border` trang trí. */
  input: palette.ink[450],
  ring: palette.blurple[500],
  link: palette.blue[600],
  online: palette.green[600],
  idle: palette.amber[500],
  dnd: palette.red[600],
  offline: palette.ink[400],
  success: palette.emerald[700],
  successBackground: palette.emerald[100],
  successForeground: palette.emerald[700],
  scrim: '#00000073',
  rail: palette.surface.lightRail,
  railForeground: palette.ink[750],
  sidebar: palette.surface.lightSidebar,
  sidebarForeground: palette.ink[750],
  sidebarPrimary: palette.blurple[500],
  sidebarPrimaryForeground: palette.white,
  sidebarAccent: palette.ink[200],
  sidebarAccentForeground: palette.ink[950],
  sidebarBorder: palette.ink[200],
  sidebarRing: palette.blurple[500],
  field: '#0000000f',
};

export const darkColors: SemanticColors = {
  background: palette.surface.darkChat,
  foreground: palette.ink[140],
  card: palette.surface.darkCard,
  cardForeground: palette.ink[140],
  popover: palette.surface.darkMenu,
  popoverForeground: palette.ink[140],
  // #5865F2 với chữ trắng = 4,61:1 (AA); đậm hơn brand-600 của Discord làm lệch màu thương hiệu.
  primary: palette.blurple[500],
  primaryForeground: palette.white,
  secondary: palette.surface.darkSecondary,
  secondaryForeground: palette.ink[140],
  muted: palette.surface.darkMuted,
  mutedForeground: palette.ink[420],
  accent: palette.surface.darkMuted,
  accentForeground: palette.ink[50],
  destructive: palette.red[400],
  border: '#96979e1f',
  borderStrong: palette.ink[600],
  input: palette.ink[600],
  ring: palette.blurple[500],
  link: palette.blue[400],
  online: palette.green[600],
  idle: palette.amber[500],
  dnd: palette.red[400],
  offline: palette.ink[500],
  success: palette.emerald[300],
  successBackground: palette.emerald[950],
  successForeground: palette.emerald[300],
  scrim: '#00000073',
  rail: palette.surface.darkRail,
  railForeground: palette.ink[140],
  sidebar: palette.surface.darkSidebar,
  sidebarForeground: palette.ink[140],
  sidebarPrimary: palette.blurple[500],
  sidebarPrimaryForeground: palette.white,
  sidebarAccent: palette.surface.darkSecondary,
  sidebarAccentForeground: palette.ink[50],
  sidebarBorder: '#96979e1f',
  sidebarRing: palette.blurple[500],
  field: '#0000001f',
};

export function semanticColors(mode: ThemeMode): SemanticColors {
  return mode === 'dark' ? darkColors : lightColors;
}
