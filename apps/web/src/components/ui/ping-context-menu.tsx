'use client';

import { Dropdown } from 'antd';
import type { DropdownProps } from 'antd';

export interface PingContextMenuProps extends Omit<DropdownProps, 'trigger'> {
  trigger?: 'contextMenu';
}

export function PingContextMenu({ trigger: _trigger, ...rest }: PingContextMenuProps) {
  return <Dropdown trigger={['contextMenu']} data-testid="ping-context-menu" {...rest} />;
}
