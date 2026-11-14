'use client';

import { Tag, type TagProps as AntdTagProps } from 'antd';
import { cn } from '@/lib/utils';

export type PingTagProps = AntdTagProps;

const SUCCESS_CLASS = 'bg-success-background text-success-foreground border-transparent';

export function PingTag({ color, className, ...rest }: PingTagProps) {
  if (color === 'green') {
    return <Tag data-testid="ping-tag" className={cn(SUCCESS_CLASS, className)} {...rest} />;
  }
  return <Tag data-testid="ping-tag" color={color} className={className} {...rest} />;
}
