'use client';

import { Mentions, type MentionsProps as AntdMentionsProps } from 'antd';

export type PingMentionInputProps = Omit<AntdMentionsProps, 'size'>;

export function PingMentionInput(props: PingMentionInputProps) {
  return <Mentions data-testid="ping-mention-input" {...props} />;
}
