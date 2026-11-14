'use client';

import type { MemberDto } from '@ping/shared';
import { Ban, Send, ShieldX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingInput } from '@/components/ui/ping-input';
import { PingPopconfirm } from '@/components/ui/ping-popconfirm';
import { PingTag } from '@/components/ui/ping-tag';
import { pingToast } from '@/components/ui/ping-toast';
import { useCreateDm, useToggleBlock } from '@/features/dms/hooks';
import { dmPath } from '@/features/dms/navigation';
import { selectDmBlocked, useDmBlockStore } from '@/features/dms/store';
import { useErrorMessage } from '@/lib/error-message';
import { useUpdateNickname } from '../../hooks';
import { UserAvatar } from '../user-avatar';

export function MemberProfileCard({
  member,
  serverId,
  self,
  onDone,
}: {
  member: MemberDto;
  serverId: string;
  self: boolean;
  onDone?: () => void;
}) {
  const t = useTranslations('profile');
  const td = useTranslations('dms');
  const tm = useTranslations('members');
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const nickname = useUpdateNickname(serverId);
  const createDm = useCreateDm();
  const toggleBlock = useToggleBlock();
  const router = useRouter();
  const blocked = useDmBlockStore(selectDmBlocked(member.user.id));
  const [value, setValue] = useState<string | null>(null);
  const name = member.nickname ?? member.user.displayName;
  const joined = new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(
    new Date(member.joinedAt),
  );

  function sendMessage() {
    createDm.mutate(member.user.id, {
      onSuccess: ({ channelId }) => {
        router.push(dmPath(channelId));
        onDone?.();
      },
      onError: (error) => pingToast.error(errorMessage(error)),
    });
  }

  function setBlocked(block: boolean) {
    toggleBlock.mutate(
      { userId: member.user.id, block },
      {
        onSuccess: () =>
          pingToast.success(block ? td('blockedToast', { name }) : td('unblockedToast', { name })),
        onError: (error) => pingToast.error(errorMessage(error)),
      },
    );
  }

  return (
    <div className="flex w-72 flex-col gap-3" data-testid="member-profile">
      <div className="flex items-center gap-3">
        <UserAvatar name={name} avatarUrl={member.user.avatarUrl} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{name}</p>
          <p className="truncate text-xs text-muted-foreground">@{member.user.username}</p>
        </div>
      </div>
      {member.roles.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {member.roles.map(({ role }) => (
            <PingTag key={role.id}>{role.name}</PingTag>
          ))}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{t('joined', { date: joined })}</p>
      {self ? (
        <>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t('nickname')}
            <PingInput
              maxLength={32}
              placeholder={tm('nicknamePlaceholder')}
              value={value ?? ''}
              onChange={(event) => setValue(event.target.value)}
              data-testid="nickname-input"
            />
          </label>
          <div className="flex gap-2">
            <PingButton
              variant="primary"
              size="sm"
              loading={nickname.isPending}
              disabled={value === null}
              onClick={() =>
                value !== null &&
                nickname.mutate(
                  { nickname: value.trim() === '' ? null : value },
                  {
                    onSuccess: () => {
                      pingToast.success(t('nicknameSaved'));
                      setValue(null);
                    },
                    onError: (error) => pingToast.error(errorMessage(error)),
                  },
                )
              }
            >
              {t('save')}
            </PingButton>
            {member.nickname ? (
              <PingButton
                size="sm"
                variant="secondary"
                loading={nickname.isPending}
                onClick={() =>
                  nickname.mutate(
                    { nickname: null },
                    {
                      onSuccess: () => pingToast.success(t('nicknameSaved')),
                      onError: (error) => pingToast.error(errorMessage(error)),
                    },
                  )
                }
              >
                {t('removeNickname')}
              </PingButton>
            ) : null}
          </div>
        </>
      ) : null}
      {!self && (
        <div className="flex gap-2">
          <PingButton
            variant="primary"
            size="sm"
            className="flex-1"
            loading={createDm.isPending}
            data-testid="send-dm-button"
            onClick={sendMessage}
          >
            <Send /> {t('sendMessage')}
          </PingButton>
          {blocked ? (
            <PingPopconfirm
              title={td('unblockConfirm', { name })}
              onConfirm={() => setBlocked(false)}
              okText={td('unblock')}
              cancelText={td('cancel')}
            >
              <PingButton size="sm" variant="secondary" aria-label={td('unblock')}>
                <Ban />
              </PingButton>
            </PingPopconfirm>
          ) : (
            <PingPopconfirm
              title={td('blockConfirm', { name })}
              description={td('blockHint')}
              onConfirm={() => setBlocked(true)}
              okText={td('block')}
              cancelText={td('cancel')}
            >
              <PingButton
                size="sm"
                variant="secondary"
                aria-label={td('block')}
                data-testid="block-user-button"
              >
                <ShieldX />
              </PingButton>
            </PingPopconfirm>
          )}
        </div>
      )}
    </div>
  );
}
