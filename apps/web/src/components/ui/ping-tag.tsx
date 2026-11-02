'use client';

import { Tag, type TagProps as AntdTagProps } from 'antd';

export type PingTagProps = AntdTagProps;

/**
 * TG.8: preset `green` của antd đặt chữ TRẮNG trên nền xanh sáng — dưới 4.5:1 (axe bắt
 * color-contrast serious ở tag "Đã xác minh"/"Phiên này"). Dùng cặp token `success-*` thay vì
 * preset (audit:design đo 4.84:1 nền sáng, 9.94:1 nền tối); màu đổi theo theme nên bỏ `dark:`.
 * Các preset khác giữ hành vi antd.
 */
const SUCCESS_CLASS = 'bg-success-background text-success-foreground border-transparent';

export function PingTag({ color, className, ...rest }: PingTagProps) {
  if (color === 'green') {
    return (
      <Tag data-testid="ping-tag" className={`${SUCCESS_CLASS} ${className ?? ''}`} {...rest} />
    );
  }
  return <Tag data-testid="ping-tag" color={color} className={className} {...rest} />;
}
