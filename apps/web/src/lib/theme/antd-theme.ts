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
      Button: { borderRadius: radius.md, controlHeight: 36 },
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
