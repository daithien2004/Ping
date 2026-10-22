'use client';

import { Drawer, type DrawerProps as AntdDrawerProps } from 'antd';

export type PingDrawerProps = AntdDrawerProps;

export function PingDrawer(props: PingDrawerProps) {
  return <Drawer data-testid="ping-drawer" {...props} />;
}
