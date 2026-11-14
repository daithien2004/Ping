'use client';

import { Modal, type ModalProps as AntdModalProps } from 'antd';
import { POPUP_STYLES } from './popup-styles';

export type PingModalProps = AntdModalProps;

export function PingModal({ styles, ...props }: PingModalProps) {
  const mergedStyles =
    typeof styles === 'function'
      ? (info: { props: PingModalProps }) => {
          const resolved = styles(info) ?? {};
          return {
            ...resolved,
            container: { ...POPUP_STYLES.container, ...resolved.container },
          };
        }
      : { ...styles, container: { ...POPUP_STYLES.container, ...styles?.container } };
  return <Modal data-testid="ping-modal" {...props} styles={mergedStyles} />;
}
