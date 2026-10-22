'use client';

import { Tabs, type TabsProps as AntdTabsProps } from 'antd';

export type PingTabsProps = AntdTabsProps;

export function PingTabs(props: PingTabsProps) {
  return <Tabs data-testid="ping-tabs" {...props} />;
}
