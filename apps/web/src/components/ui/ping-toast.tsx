'use client';

import { message } from 'antd';

export const pingToast = {
  success: (content: string) => message.success(content),
  error: (content: string) => message.error(content),
  info: (content: string) => message.info(content),
  warning: (content: string) => message.warning(content),
};
