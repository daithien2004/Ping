'use client';

import { Modal, type ModalProps as AntdModalProps } from 'antd';

export type PingModalProps = AntdModalProps;

export function PingModal(props: PingModalProps) {
  return <Modal data-testid="ping-modal" {...props} />;
}
