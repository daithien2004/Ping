'use client';

import { Popconfirm, type PopconfirmProps } from 'antd';
import { POPUP_STYLES } from './popup-styles';

export type PingPopconfirmProps = Pick<
  PopconfirmProps,
  'title' | 'description' | 'children' | 'onConfirm' | 'okText' | 'cancelText' | 'disabled'
>;

export function PingPopconfirm({ title, description, ...props }: PingPopconfirmProps) {
  return (
    <Popconfirm
      data-testid="ping-popconfirm"
      {...props}
      placement="topRight"
      icon={null}
      title={title}
      description={description}
      okButtonProps={{ style: { marginTop: 4 } }}
      cancelButtonProps={{ style: { marginTop: 4 } }}
      styles={{
        ...POPUP_STYLES,
        container: {
          ...POPUP_STYLES.container,
          minWidth: '13rem',
          maxWidth: 'min(18rem, calc(100vw - 24px))',
        },
        title: { fontSize: 14, fontWeight: 600, lineHeight: '20px' },
        content: {
          marginTop: 4,
          fontSize: 12,
          lineHeight: '18px',
          color: 'var(--muted-foreground)',
        },
      }}
    />
  );
}
