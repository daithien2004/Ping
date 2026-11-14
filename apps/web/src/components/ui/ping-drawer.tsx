'use client';

import { Drawer, type DrawerProps } from 'antd';

export type PingDrawerProps = Pick<
  DrawerProps,
  'open' | 'onClose' | 'title' | 'children' | 'footer'
> & { size?: number | string };

export function PingDrawer(props: PingDrawerProps) {
  return <Drawer data-testid="ping-drawer" {...props} />;
}
