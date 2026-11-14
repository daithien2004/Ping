import type { DmSummary } from '@ping/shared';

export type DmViewState =
  { kind: 'loading' } | { kind: 'error' } | { kind: 'notFound' } | { kind: 'ready'; dm: DmSummary };

export function dmViewState({
  isPending,
  isError,
  dms,
  channelId,
}: {
  isPending: boolean;
  isError: boolean;
  dms: DmSummary[] | undefined;
  channelId: string;
}): DmViewState {
  if (isPending) return { kind: 'loading' };
  if (isError) return { kind: 'error' };
  const dm = dms?.find((row) => row.channelId === channelId);
  if (dm) return { kind: 'ready', dm };
  return dms ? { kind: 'notFound' } : { kind: 'loading' };
}
