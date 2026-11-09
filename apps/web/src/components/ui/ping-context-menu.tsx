'use client';

import { Dropdown, type DropdownProps } from 'antd';

export type PingContextMenuProps = Omit<DropdownProps, 'trigger'>;

export function PingContextMenu(props: PingContextMenuProps) {
  return <Dropdown trigger={['contextMenu']} data-testid="ping-context-menu" {...props} />;
}
