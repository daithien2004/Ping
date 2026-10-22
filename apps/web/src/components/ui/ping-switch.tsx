'use client';

import { Switch, type SwitchProps as AntdSwitchProps } from 'antd';
import { forwardRef } from 'react';

export type PingSwitchProps = AntdSwitchProps;

export const PingSwitch = forwardRef<HTMLButtonElement, PingSwitchProps>(
  function PingSwitch(props, ref) {
    return <Switch ref={ref} data-testid="ping-switch" {...props} />;
  },
);
