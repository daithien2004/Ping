'use client';

import { PingTag } from '@/components/ui/ping-tag';

/**
 * Màu của vai trò lấy từ bảng màu antd (màu do theme sinh ra, không phải hex viết tay).
 * Thứ tự vai trò quyết định màu nên vai trò đầu tiên luôn cùng màu.
 */
const ROLE_COLORS = [
  'blue',
  'green',
  'gold',
  'purple',
  'cyan',
  'magenta',
  'lime',
  'orange',
] as const;

export function RoleTag({ name, position = 0 }: { name: string; position?: number }) {
  const color = ROLE_COLORS[position % ROLE_COLORS.length];
  return (
    <PingTag color={color} data-testid="role-tag">
      {name}
    </PingTag>
  );
}
