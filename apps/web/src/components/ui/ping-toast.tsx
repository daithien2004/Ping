'use client';

import { App } from 'antd';
import { useEffect } from 'react';
import { isProduction } from '@/lib/env';

// `message` tĩnh của antd không thấy ConfigProvider nên lệch theme; lấy instance có context từ <App>.
type MessageInstance = ReturnType<typeof App.useApp>['message'];

let toastApi: MessageInstance | null = null;

export function PingToastHost() {
  const { message } = App.useApp();
  useEffect(() => {
    toastApi = message;
    return () => {
      if (toastApi === message) toastApi = null;
    };
  }, [message]);
  return null;
}

type ToastKind = 'success' | 'error' | 'info' | 'warning';

const show = (kind: ToastKind, content: string) => {
  if (toastApi) void toastApi[kind](content);
  else if (!isProduction) {
    // Dev: báo toast bị nuốt vì chưa có host.
    console.warn(`pingToast.${kind}: chưa có <PingToastHost />, thông báo bị bỏ: ${content}`);
  }
};

export const pingToast = {
  success: (content: string) => show('success', content),
  error: (content: string) => show('error', content),
  info: (content: string) => show('info', content),
  warning: (content: string) => show('warning', content),
};
