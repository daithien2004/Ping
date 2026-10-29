'use client';

import { Tag, type TagProps as AntdTagProps } from 'antd';

export type PingTagProps = AntdTagProps;

/**
 * TG.8: preset `green` của antd đặt chữ TRẮNG trên nền xanh sáng — dưới 4.5:1 (axe bắt
 * color-contrast serious ở tag "Đã xác minh"/"Phiên này"). Map sang cặp emerald của Tailwind
 * (700 trên 100 / 300 trên 950 — đủ 4.5:1 cả sáng lẫn tối), không dùng preset nữa. Các preset
 * khác giữ hành vi antd.
 */
const GREEN_CONTRAST_CLASS =
  'bg-emerald-100 text-emerald-700 border-transparent dark:bg-emerald-950 dark:text-emerald-300';

export function PingTag({ color, className, ...rest }: PingTagProps) {
  if (color === 'green') {
    return (
      <Tag
        data-testid="ping-tag"
        className={`${GREEN_CONTRAST_CLASS} ${className ?? ''}`}
        {...rest}
      />
    );
  }
  return <Tag data-testid="ping-tag" color={color} className={className} {...rest} />;
}
