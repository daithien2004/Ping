'use client';

import { Popconfirm, type PopconfirmProps } from 'antd';
import { POPUP_STYLES } from './popup-styles';

/** API đóng; `children` là nút mở hộp xác nhận. */
export type PingPopconfirmProps = Pick<
  PopconfirmProps,
  'title' | 'description' | 'children' | 'onConfirm' | 'okText' | 'cancelText' | 'disabled'
>;

/**
 * Hộp xác nhận dùng chung.
 *
 * Vị trí: antd mặc định `top` = popup căn GIỮA nút. Nút nằm sát mép phải (hàng thao tác bảng,
 * header DM) thì nửa phải popup tràn viewport và antd kéo nó về dính đúng mép màn hình. Canh phải
 * cho mép popup trùng mép nút; khi phía trên hết chỗ antd tự lật xuống `bottomRight`.
 *
 * Trình bày: bỏ icon cảnh báo màu cam của antd (lệch bảng màu), tiêu đề đậm 14 px, dòng giải thích
 * 12 px màu dịu, bề rộng đủ thoáng nhưng vẫn vừa màn hình hẹp.
 */
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
