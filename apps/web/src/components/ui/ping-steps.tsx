'use client';

import { Steps, type StepsProps as AntdStepsProps } from 'antd';

export type PingStepsProps = AntdStepsProps;

export function PingSteps(props: PingStepsProps) {
  return <Steps data-testid="ping-steps" {...props} />;
}
