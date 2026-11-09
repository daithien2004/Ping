'use client';

import { Tag, type TagProps as AntdTagProps } from 'antd';

export type PingTagProps = AntdTagProps;

/** Preset `green` của antd cho chữ trắng trên nền sáng (< 4.5:1); dùng cặp token success thay thế. */
const SUCCESS_CLASS = 'bg-success-background text-success-foreground border-transparent';

export function PingTag({ color, className, ...rest }: PingTagProps) {
  if (color === 'green') {
    return (
      <Tag data-testid="ping-tag" className={`${SUCCESS_CLASS} ${className ?? ''}`} {...rest} />
    );
  }
  return <Tag data-testid="ping-tag" color={color} className={className} {...rest} />;
}
