'use client';

import { Mentions, type MentionsProps as AntdMentionsProps } from 'antd';

export type PingMentionInputProps = AntdMentionsProps;

export function PingMentionInput(props: PingMentionInputProps) {
  return <Mentions data-testid="ping-mention-input" {...props} />;
}
