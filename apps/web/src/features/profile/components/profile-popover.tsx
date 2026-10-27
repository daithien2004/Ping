'use client';

import type { MemberDto } from '@ping/shared';
import { useTranslations } from 'use-intl';
import { useEffect, useRef, useState } from 'react';
import { PingButton } from '@/components/ui/ping-button';
import { PingInput } from '@/components/ui/ping-input';
import { PingTag } from '@/components/ui/ping-tag';
import { PingTooltip } from '@/components/ui/ping-tooltip';
import { pingToast } from '@/components/ui/ping-toast';
import { useMe } from '@/features/auth/hooks';
import { useErrorMessage } from '@/lib/error-message';
import { useUpdateNickname, useUpdateProfile, useProfileUpload } from '../hooks';
import { UserAvatar } from './user-avatar';

/**
 * Thẻ hồ sơ của chính mình (TG.7): đổi ảnh đại diện (pipeline TG.6) và tên hiển thị.
 * Dùng ở thẻ user dưới rail; đặt trong PingPopover ở nơi gọi.
 */
export function SelfProfileCard() {
  const t = useTranslations('profile');
  const errorMessage = useErrorMessage();
  const { data: meProfile } = useMe();
  const save = useUpdateProfile();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useProfileUpload('avatar');
  const saved = useRef(false);

  // Ảnh đã ready → gắn vào hồ sơ ngay (một tệp chỉ dùng một lần); side-effect đồng bộ với server.
  useEffect(() => {
    if (!upload.attachmentId || saved.current) return;
    saved.current = true;
    save.mutate(
      { avatarAttachmentId: upload.attachmentId },
      {
        onSuccess: () => {
          pingToast.success(t('avatarSaved'));
          upload.reset();
          saved.current = false;
        },
        onError: (error) => {
          pingToast.error(errorMessage(error));
          upload.reset();
          saved.current = false;
        },
      },
    );
  }, [upload.attachmentId, save.mutate]);
  return (
    <div className="flex w-72 flex-col gap-3" data-testid="self-profile">
      <div className="flex items-center gap-3">
        <UserAvatar
          name={meProfile?.displayName ?? ''}
          avatarUrl={meProfile?.avatarUrl}
          size="lg"
        />
        <div className="min-w-0">
          <p className="truncate font-semibold">{meProfile?.displayName}</p>
          <p className="truncate text-xs text-muted-foreground">@{meProfile?.username}</p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label={t('changeAvatar')}
        data-testid="avatar-input"
        disabled={upload.busy || save.isPending}
        onChange={(event) => {
          upload.choose(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <div className="flex items-center gap-2">
        <PingButton size="sm" variant="secondary" onClick={() => inputRef.current?.click()}>
          {t('changeAvatar')}
        </PingButton>
        {upload.busy ? (
          <span role="status" className="text-xs text-muted-foreground">
            {upload.progress === 0 ? t('processing') : t('uploading', { percent: upload.progress })}
          </span>
        ) : null}
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t('displayName')}
        <PingInput
          maxLength={32}
          value={displayName ?? meProfile?.displayName ?? ''}
          onChange={(event) => setDisplayName(event.target.value)}
          data-testid="display-name-input"
        />
      </label>
      <PingButton
        size="sm"
        loading={save.isPending}
        disabled={displayName === null || displayName === meProfile?.displayName}
        onClick={() =>
          displayName !== null &&
          save.mutate(
            { displayName },
            {
              onSuccess: () => {
                pingToast.success(t('profileSaved'));
                setDisplayName(null);
              },
              onError: (error) => pingToast.error(errorMessage(error)),
            },
          )
        }
      >
        {t('save')}
      </PingButton>
    </div>
  );
}

/**
 * Thẻ hồ sơ của một thành viên (TG.7): avatar, tên, biệt danh, vai trò, ngày tham gia và nút
 * "Nhắn tin" (DM thuộc TG.9 — để nút tắt kèm giải thích). Riêng mình có thêm ô đổi biệt danh.
 */
export function MemberProfileCard({
  member,
  serverId,
  self,
}: {
  member: MemberDto;
  serverId: string;
  self: boolean;
}) {
  const t = useTranslations('profile');
  const tm = useTranslations('members');
  const errorMessage = useErrorMessage();
  const nickname = useUpdateNickname(serverId);
  const [value, setValue] = useState<string | null>(null);
  const name = member.nickname ?? member.user.displayName;
  const joined = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(
    new Date(member.joinedAt),
  );

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
      <PingTooltip title={t('sendMessageSoon')}>
        <PingButton size="sm" disabled className="w-full">
          {t('sendMessage')}
        </PingButton>
      </PingTooltip>
    </div>
  );
}
