import type { CSSProperties } from 'react';

/**
 * Bóng cho mọi bề mặt nổi (Popover/Popconfirm/Tooltip). antd phủ `filter: drop-shadow(...)` lên
 * root popup — lan ~28 px nên nhìn thành quầng mờ rộng; tắt và thay bằng bóng panel của app (đổi
 * theo skin). Style inline vì CSS antd chèn lúc chạy nên thứ tự stylesheet không bảo đảm.
 * `var(--shadow-panel)` là bí danh Tailwind của token, không phải biến `--ping-*` của app.
 */
export const POPUP_STYLES = {
  root: { filter: 'none' },
  container: { boxShadow: 'var(--shadow-panel)' },
} satisfies { root: CSSProperties; container: CSSProperties };
