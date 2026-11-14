'use client';

import { PingTag } from '@/components/ui/ping-tag';

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
