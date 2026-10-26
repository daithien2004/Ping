'use client';
import type { AttachmentDto } from '@ping/shared';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { PingModal } from '@/components/ui/ping-modal';
import { useErrorMessage } from '@/lib/error-message';
import { useAttachmentLink } from '../hooks';

function Attachment({ attachment }: { attachment: AttachmentDto }) {
  const t = useTranslations('attachments');
  const errorMessage = useErrorMessage();
  const image = attachment.mime.startsWith('image/');
  const link = useAttachmentLink(attachment.id);
  const thumb = useAttachmentLink(attachment.id, image);
  const [open, setOpen] = useState(false);
  if (link.error)
    return (
      <p role="status" className="text-xs text-destructive">
        {errorMessage(link.error)}
      </p>
    );
  return (
    <div className="max-w-sm rounded-lg border bg-muted p-2" data-testid="attachment">
      {image && thumb.data && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('preview', { name: attachment.filename })}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumb.data.url}
            alt={attachment.filename}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="max-h-60 max-w-full rounded"
          />
        </button>
      )}
      {link.data ? (
        <a
          href={link.data.url}
          download
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
          className="block truncate text-sm underline"
        >
          {attachment.filename}
        </a>
      ) : (
        <p role="status" className="text-xs">
          {t('loading')}
        </p>
      )}
      <PingModal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        title={attachment.filename}
        destroyOnHidden
      >
        {link.data && image && (
          // Canonical signed images come from the API; no Next image optimizer cache.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={link.data.url}
            alt={attachment.filename}
            referrerPolicy="no-referrer"
            className="max-h-[70vh] max-w-full"
          />
        )}
      </PingModal>
    </div>
  );
}
export function AttachmentList({ attachments }: { attachments: AttachmentDto[] }) {
  return (
    <div className="my-1 flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <Attachment key={attachment.id} attachment={attachment} />
      ))}
    </div>
  );
}
