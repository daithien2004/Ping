import { env } from '@/lib/env';

/** Dùng url gốc API cho URL hồ sơ tương đối (/api/v1/...): dev là :4000, prod là cùng origin. */
export function profileImageUrl(avatarUrl: string | null | undefined): string | undefined {
  if (!avatarUrl) return undefined;
  return avatarUrl.startsWith('http')
    ? avatarUrl
    : new URL(avatarUrl, env.NEXT_PUBLIC_API_URL).toString();
}
