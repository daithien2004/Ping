'use client';

import { Alert, type AlertProps as AntdAlertProps } from 'antd';

export type PingAlertProps = AntdAlertProps;

export function PingAlert(props: PingAlertProps) {
  return <Alert data-testid="ping-alert" {...props} />;
}
