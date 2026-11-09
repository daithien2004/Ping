'use client';

import { App } from 'antd';
import { useEffect } from 'react';

interface ToastApi {
  success: (content: string) => void;
  error: (content: string) => void;
  info: (content: string) => void;
  warning: (content: string) => void;
}

/** `message` tĩnh của antd không thấy ConfigProvider nên lệch theme; lấy instance có context từ <App>. */
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

export const pingToast = {
  success: (content: string) => toastApi?.success(content),
  error: (content: string) => toastApi?.error(content),
  info: (content: string) => toastApi?.info(content),
  warning: (content: string) => toastApi?.warning(content),
};
