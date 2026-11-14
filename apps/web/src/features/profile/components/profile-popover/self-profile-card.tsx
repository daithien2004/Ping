'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingInput } from '@/components/ui/ping-input';
import { pingToast } from '@/components/ui/ping-toast';
import { useMe } from '@/features/auth/hooks';
import { useErrorMessage } from '@/lib/error-message';
import { useProfileUpload, useUpdateProfile } from '../../hooks';
import { UserAvatar } from '../user-avatar';

export function SelfProfileCard() {
  const t = useTranslations('profile');
  const errorMessage = useErrorMessage();
  const { data: meProfile } = useMe();
  const save = useUpdateProfile();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useProfileUpload('avatar');
  const saved = useRef(false);
  // Rã phần tử ổn định cho deps: nguyên object `upload`/`save` đổi identity mỗi render, đưa vào deps sẽ lặp mutation khi lỗi.
  const { attachmentId, reset: resetUpload } = upload;
  const { mutate: saveMutate } = save;

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
      {upload.error ? (
        <p role="alert" className="text-xs text-destructive" data-testid="avatar-upload-error">
          {errorMessage(upload.error)}
        </p>
      ) : null}
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
        variant="primary"
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
