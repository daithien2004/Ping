'use client';

import { App } from 'antd';
import { useEffect } from 'react';

interface ToastApi {
  success: (content: string) => void;
  error: (content: string) => void;
  info: (content: string) => void;
  warning: (content: string) => void;
}

/**
 * `message` tĩnh của antd không thấy `ConfigProvider`/`<AntdApp>` nên toast lệch theme (và antd cảnh
 * báo trong console). Host này gắn một lần bên trong `<AntdApp>` (providers/theme-provider.tsx) để
 * `pingToast` dùng đúng instance có context.
 */
let toastApi: ToastApi | null = null;

export function PingToastHost() {
  const { message } = App.useApp();
  useEffect(() => {
    toastApi = {
      success: (content) => void message.success(content),
      error: (content) => void message.error(content),
      info: (content) => void message.info(content),
      warning: (content) => void message.warning(content),
    };
    return () => {
      toastApi = null;
    };
  }, [message]);
  return null;
}

/**
 * Toast ngắn cho hành động ngầm/không quan trọng (đã sao chép, đã lưu cài đặt). Lỗi người dùng cần
 * xử lý (thiếu quyền, sai dữ liệu) phải hiện inline — xem quy ước ở `docs/design/states.md`.
 */
export const pingToast = {
  success: (content: string) => toastApi?.success(content),
  error: (content: string) => toastApi?.error(content),
  info: (content: string) => toastApi?.info(content),
  warning: (content: string) => toastApi?.warning(content),
};
