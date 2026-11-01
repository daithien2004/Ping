import { theme as antdTheme } from 'antd';
import type { ThemeConfig } from 'antd';
import { semanticColors, spacing, radius, typography, motion } from './tokens';
import type { ThemeMode } from './tokens';

export function buildAntdTheme(mode: ThemeMode): ThemeConfig {
  const c = semanticColors(mode);
  const isDark = mode === 'dark';
  return {
    token: {
      colorPrimary: c.primary,
      colorBgBase: c.background,
      colorTextBase: c.foreground,
      colorBorder: c.border,
      colorBgContainer: c.card,
      colorBgElevated: c.popover,
      colorText: c.foreground,
      colorTextSecondary: c.mutedForeground,
      // antd tự suy colorTextDescription từ colorTextBase pha alpha (~45%) → dưới 4.5:1 trên
      // nền card (axe bắt color-contrast ở mô tả Empty của bảng vai trò, T6.9). Dùng màu phụ
      // của palette (đã đạt AA ở cả hai nền) thay vì alpha.
      colorTextDescription: c.mutedForeground,
      colorLink: c.link,
      colorError: c.destructive,
      borderRadius: radius.md,
      borderRadiusLG: radius.lg,
      borderRadiusSM: radius.sm,
      fontFamily: typography.fontFamily.sans,
      fontSize: typography.fontSize.base,
      motionDurationMid: `${motion.normal}ms`,
      motionDurationSlow: `${motion.slow}ms`,
      motionDurationFast: `${motion.fast}ms`,
    },
    components: {
      // Nút "danger" kiểu viền lấy chữ từ colorError; antd suy palette[6] từ seed nên nền tối
      // thành #cf6b5d, chỉ ~4.4:1 trên card. Ghim về đúng destructive của palette (5.8:1 tối,
      // 4.7:1 sáng) — axe color-contrast (serious) ở mục Thu hồi phiên (T6.9).
      Button: { borderRadius: radius.md, controlHeight: 36, colorError: c.destructive },
      Input: { borderRadius: radius.md, controlHeight: 36 },
      Modal: { borderRadiusLG: radius.xl },
      Card: { borderRadiusLG: radius.lg },
      // Mặc định antd dùng colorTextLabel (text pha alpha) cho mục chưa chọn — trên nền
      // ink-50/ink-950 của palette này tụt dưới 4.5:1 (axe bắt ở trang cài đặt TG.13).
      Segmented: { itemColor: c.foreground, itemHoverColor: c.foreground },
      // Tag preset 'default' của antd cũng dùng chữ pha alpha trên nền xám nhẹ — axe bắt
      // color-contrast (serious) ở tag "Chưa xác minh"/"Phiên này" của TG.8. Text đậm màu
      // foreground, nền giữ neutralFill (vẫn phân biệt được với nền card).
      Tag: { defaultColor: c.foreground, defaultBg: c.muted },
    },
    hashed: true,
    cssVar: { key: 'ping' },
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
  };
}

export { spacing, radius, typography, motion };
