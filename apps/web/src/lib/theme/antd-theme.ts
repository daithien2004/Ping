import { theme as antdTheme } from 'antd';
import type { ThemeConfig } from 'antd';
import { semanticColors, spacing, radius, typography, motion } from './tokens';
import type { ThemeMode } from './tokens';

export function buildAntdTheme(mode: ThemeMode): ThemeConfig {
  const c = semanticColors(mode);
  const isDark = mode === 'dark';
  const corner = (step: keyof typeof radius) => radius[step];
  return {
    token: {
      colorPrimary: c.primary,
      colorBgBase: c.background,
      colorTextBase: c.foreground,
      // Viền ô nhập/select: WCAG 1.4.11 đòi ≥ 3:1 vì viền chính là ranh giới điều khiển;
      colorBorder: c.borderStrong,
      colorBgContainer: c.card,
      colorBgElevated: c.popover,
      colorText: c.foreground,
      colorTextSecondary: c.mutedForeground,
      // của palette (đã đạt AA ở cả hai nền) thay vì alpha.
      colorTextDescription: c.mutedForeground,
      colorLink: c.link,
      colorError: c.destructive,
      borderRadius: corner('md'),
      borderRadiusLG: corner('lg'),
      borderRadiusSM: corner('sm'),
      fontFamily: typography.fontFamily.sans,
      fontSize: typography.fontSize.base,
      motionDurationMid: `${motion.normal}ms`,
      motionDurationSlow: `${motion.slow}ms`,
      motionDurationFast: `${motion.fast}ms`,
    },
    components: {
      Button: {
        borderRadius: corner('md'),
        controlHeight: 36,
        colorError: c.destructive,
      },
      Input: { borderRadius: corner('md'), controlHeight: 36 },
      Modal: { borderRadiusLG: corner('xl') },
      Card: { borderRadiusLG: corner('lg') },
      Segmented: { itemColor: c.foreground, itemHoverColor: c.foreground },
      Tag: { defaultColor: c.foreground, defaultBg: c.muted },
      // thương hiệu truyền qua `style` ở nơi dùng vì CSS của antd nằm ngoài layer Tailwind.
      Avatar: { colorTextPlaceholder: c.muted, colorTextLightSolid: c.foreground },
    },
    hashed: true,
    cssVar: { key: 'ping' },
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
  };
}

export { spacing, radius, typography, motion };
