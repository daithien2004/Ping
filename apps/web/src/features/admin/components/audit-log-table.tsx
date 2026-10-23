'use client';

import { auditActionValues, type AuditAction, type AuditLogEntryDto } from '@ping/shared';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingEmpty } from '@/components/ui/ping-empty';
import { PingSelect } from '@/components/ui/ping-select';
import { PingTable, type PingTableColumn } from '@/components/ui/ping-table';
import { useErrorMessage } from '@/lib/error-message';
import { errorReference } from '@/lib/error-reference';
import { useAuditLog } from '../hooks';

/** Nhãn tiếng Việt của mỗi hành động trong nhật ký (namespace `admin.auditActions`). */
const ACTION_KEYS = {
  ROLE_CREATE: 'roleCreate',
  ROLE_UPDATE: 'roleUpdate',
  ROLE_DELETE: 'roleDelete',
  MEMBER_ROLES_UPDATE: 'memberRolesUpdate',
  MEMBER_KICK: 'memberKick',
  MESSAGE_DELETE: 'messageDelete',
  CHANNEL_DELETE: 'channelDelete',
  SERVER_DELETE: 'serverDelete',
  SERVER_UPDATE: 'serverUpdate',
} as const satisfies Record<AuditAction, string>;

function formatTime(value: string, locale: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale);
}

/**
 * Nhật ký hành động của server (TF.10): bảng `PingTable`, lọc theo hành động, phân trang
 * cursor (mỗi lần bấm "Xem thêm" lấy trang kế tiếp bằng id bản ghi cuối).
 */
export function AuditLogTable({ serverId }: { serverId: string }) {
  const t = useTranslations('admin');
  const ta = useTranslations('admin.auditActions');
  const tc = useTranslations('common');
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const [action, setAction] = useState<AuditAction | undefined>(undefined);
  const query = useAuditLog(serverId, { action });
  const entries = query.data?.pages.flatMap((page) => page.entries) ?? [];

  const columns: PingTableColumn<AuditLogEntryDto>[] = [
    {
      key: 'action',
      header: t('auditAction'),
      render: (entry) => ta(ACTION_KEYS[entry.action]),
    },
    {
      key: 'actor',
      header: t('auditActor'),
      render: (entry) => entry.actor?.displayName ?? t('deletedActor'),
    },
    {
      key: 'createdAt',
      header: t('auditTime'),
      render: (entry) => formatTime(entry.createdAt, locale),
    },
    {
      key: 'requestId',
      header: t('auditRequestId'),
      render: (entry) =>
        entry.requestId ? <code className="select-all">{entry.requestId}</code> : '—',
    },
  ];

  if (query.isError) {
    const reference = errorReference(query.error);
    return (
      <div role="alert" className="flex flex-col items-start gap-2 text-sm text-destructive">
        <p>{errorMessage(query.error)}</p>
        {reference && (
          <p className="text-xs text-muted-foreground">
            <code className="select-all">{t('errorId', { id: reference })}</code>
          </p>
        )}{' '}
        <PingButton variant="secondary" onClick={() => void query.refetch()}>
          {tc('retry')}
        </PingButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm">
        {t('auditFilter')}
        <PingSelect
          aria-label={t('auditFilter')}
          className="w-56"
          value={action ?? ''}
          onChange={(value) => setAction(value ? (value as AuditAction) : undefined)}
          options={[
            { value: '', label: t('auditAllActions') },
            ...auditActionValues.map((value) => ({
              value,
              label: ta(ACTION_KEYS[value]),
            })),
          ]}
        />
      </label>

      <PingTable
        label={t('audit')}
        columns={columns}
        rows={entries}
        rowKey={(entry) => entry.id}
        loading={query.isPending || query.isFetchingNextPage}
        empty={<PingEmpty description={t('auditEmpty')} />}
      />

      {query.hasNextPage && (
        <PingButton
          variant="secondary"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t('loadMore')}
        </PingButton>
      )}
    </div>
  );
}
