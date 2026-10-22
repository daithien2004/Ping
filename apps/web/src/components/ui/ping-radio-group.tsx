'use client';

import { Radio, type RadioGroupProps as AntdRadioGroupProps } from 'antd';
import { forwardRef } from 'react';

export type PingRadioGroupProps = AntdRadioGroupProps;

export const PingRadioGroup = forwardRef<HTMLDivElement, PingRadioGroupProps>(
  function PingRadioGroup(props, ref) {
    return <Radio.Group ref={ref as never} data-testid="ping-radio-group" {...props} />;
  },
);
