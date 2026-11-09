'use client';

import { Checkbox } from 'antd';
import type { ComponentProps } from 'react';

export type PingCheckboxProps = ComponentProps<typeof Checkbox>;

export function PingCheckbox(props: PingCheckboxProps) {
  return <Checkbox data-testid="ping-checkbox" {...props} />;
}
