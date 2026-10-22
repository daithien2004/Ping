'use client';

import { Menu, type MenuProps as AntdMenuProps } from 'antd';

export type PingMenuProps = AntdMenuProps;

export function PingMenu(props: PingMenuProps) {
  return <Menu data-testid="ping-menu" {...props} />;
}
