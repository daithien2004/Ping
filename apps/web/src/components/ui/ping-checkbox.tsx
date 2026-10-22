'use client';

import { Checkbox, type CheckboxProps as AntdCheckboxProps } from 'antd';
import { forwardRef } from 'react';

export type PingCheckboxProps = AntdCheckboxProps;

export const PingCheckbox = forwardRef<HTMLInputElement, PingCheckboxProps>(
  function PingCheckbox(props, ref) {
    return <Checkbox ref={ref as never} data-testid="ping-checkbox" {...props} />;
  },
);
