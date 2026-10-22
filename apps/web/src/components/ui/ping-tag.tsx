'use client';

import { Tag, type TagProps as AntdTagProps } from 'antd';

export type PingTagProps = AntdTagProps;

export function PingTag(props: PingTagProps) {
  return <Tag data-testid="ping-tag" {...props} />;
}
