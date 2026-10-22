'use client';

import { Dropdown, type DropdownProps as AntdDropdownProps } from 'antd';

export type PingDropdownProps = AntdDropdownProps;

export function PingDropdown(props: PingDropdownProps) {
  return <Dropdown data-testid="ping-dropdown" {...props} />;
}
