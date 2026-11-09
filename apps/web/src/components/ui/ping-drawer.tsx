'use client';

import { Drawer, type DrawerProps } from 'antd';

/** API đóng: `size` ở đây là bề rộng (px hoặc CSS), không phải bậc `PingSize`. */
export type PingDrawerProps = Pick<
  DrawerProps,
  'open' | 'onClose' | 'title' | 'children' | 'footer'
> & { size?: number | string };

export function PingDrawer(props: PingDrawerProps) {
  return <Drawer data-testid="ping-drawer" {...props} />;
}
