'use client';

import type { MemberDto } from '@ping/shared';
import { Ban, Send, ShieldX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'use-intl';
import { useEffect, useRef, useState } from 'react';
import { PingButton } from '@/components/ui/ping-button';
import { PingInput } from '@/components/ui/ping-input';
import { PingPopconfirm } from '@/components/ui/ping-popconfirm';
import { PingTag } from '@/components/ui/ping-tag';
import { pingToast } from '@/components/ui/ping-toast';
import { useMe } from '@/features/auth/hooks';
import { useCreateDm, useToggleBlock } from '@/features/dms/hooks';
import { dmPath } from '@/features/dms/navigation';
import { selectDmBlocked, useDmBlockStore } from '@/features/dms/store';
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
  // Rã phần tử ổn định cho deps của effect dưới: nguyên object `upload`/`save` đổi identity
  // mỗi render — thêm thẳng vào deps sẽ nổ mutation lặp khi lỗi (saved.current=false + render).
  const { attachmentId, reset: resetUpload } = upload;
  const { mutate: saveMutate } = save;

  // Ảnh đã ready → gắn vào hồ sơ ngay (một tệp chỉ dùng một lần); side-effect đồng bộ với server.
  useEffect(() => {
    if (!attachmentId || saved.current) return;
    saved.current = true;
    saveMutate(
      { avatarAttachmentId: attachmentId },
      {
        onSuccess: () => {
          pingToast.success(t('avatarSaved'));
          resetUpload();
          saved.current = false;
        },
        onError: (error) => {
          pingToast.error(errorMessage(error));
          resetUpload();
          saved.current = false;
        },
      },
    );
  }, [attachmentId, resetUpload, saveMutate, errorMessage, t]);
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
 * Thẻ hồ sơ của một thành viên (TG.7): avatar, tên, biệt danh, vai trò, ngày tham gia. TG.9
 * bật nút "Nhắn tin" (POST /dms get-or-create → điều hướng vào DM) và thêm chặn/bỏ chặn —
 * đây là entry chính để tạo DM ở v0.2. Riêng mình có thêm ô đổi biệt danh.
 */
export function MemberProfileCard({
  member,
  serverId,
  self,
  onDone,
}: {
  member: MemberDto;
  serverId: string;
  self: boolean;
  /** Chạy sau khi điều hướng xong (đóng modal chứa thẻ) — nơi gọi quyết định. */
  onDone?: () => void;
}) {
  const t = useTranslations('profile');
  const td = useTranslations('dms');
  const tm = useTranslations('members');
  const errorMessage = useErrorMessage();
  const nickname = useUpdateNickname(serverId);
  const createDm = useCreateDm();
  const toggleBlock = useToggleBlock();
  const router = useRouter();
  const blocked = useDmBlockStore(selectDmBlocked(member.user.id));
  const [value, setValue] = useState<string | null>(null);
  const name = member.nickname ?? member.user.displayName;
  const joined = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(
    new Date(member.joinedAt),
  );

  /** POST /dms luôn 200 với cặp đã có (get-or-create) nên chỉ điều hướng khi thành công. */
  function sendMessage() {
    createDm.mutate(member.user.id, {
      onSuccess: ({ channelId }) => {
        router.push(dmPath(channelId));
        onDone?.();
      },
      onError: (error) => pingToast.error(errorMessage(error)),
    });
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
      {/* TG.9: entry chính tạo DM — bấm là get-or-create rồi vào thẳng hội thoại. Lỗi
          DM_BLOCKED (đối tác chặn hoặc tắt DM) báo toast qua đúng mã, không đoán chiều. */}
      {!self && (
        <div className="flex gap-2">
          <PingButton
            size="sm"
            className="flex-1"
            loading={createDm.isPending}
            data-testid="send-dm-button"
            onClick={sendMessage}
          >
            <Send /> {t('sendMessage')}
          </PingButton>
          {blocked ? (
            // Bỏ chặn: xác nhận nhẹ, hành động mở lại tin nhắn cho cả hai chiều.
            <PingPopconfirm
              title={td('unblockConfirm', { name })}
              onConfirm={() => toggleBlock.mutate({ userId: member.user.id, block: false })}
              okText={td('unblock')}
              cancelText={td('cancel')}
            >
              <PingButton size="sm" variant="secondary" aria-label={td('unblock')}>
                <Ban />
              </PingButton>
            </PingPopconfirm>
          ) : (
            // Chặn: ảnh hưởng hai chiều (không DM được nhau) — luôn hỏi lại.
            <PingPopconfirm
              title={td('blockConfirm', { name })}
              description={td('blockHint')}
              onConfirm={() => toggleBlock.mutate({ userId: member.user.id, block: true })}
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
