'use client';

import { useEffect } from 'react';
import { useUserSettings } from '../hooks';
import { useAppliedSettings } from '../store';

/**
 * Bơm cài đặt người dùng từ server vào store đang áp dụng (TG.13) — gắn MỘT LẦN trong app
 * shell, sau AuthGate (chưa đăng nhập thì không gọi API, store giữ mặc định). Đổi cài đặt
 * ghi thẳng vào store qua `usePatchSettings` nên effect dưới chỉ chạy khi dữ liệu server
 * thật sự đổi (boot, tab mới tải trang — đồng bộ nhiều thiết bị).
 * Locale KHÔNG áp dụng ở đây: i18n đọc cookie tại server render; đổi ngôn ngữ đi đường
 * riêng (patch + ghi cookie + reload) ở trang Ngôn ngữ.
 */
export function SettingsSync() {
  const { data } = useUserSettings();
  const apply = useAppliedSettings((state) => state.apply);

  useEffect(() => {
    if (!data) return;
    apply({ theme: data.theme, density: data.density, fontSize: data.fontSize });
  }, [data, apply]);

  return null;
}
