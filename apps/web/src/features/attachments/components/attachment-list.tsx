'use client';
import type { AttachmentDto } from '@ping/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { PingModal } from '@/components/ui/ping-modal';
import { useErrorMessage } from '@/lib/error-message';
import { useInView } from '@/lib/use-in-view';
import { useAttachmentLink } from '../hooks';

/**
 * ADR-0079: ảnh chỉ tải thumbnail khi vào vùng nhìn, link gốc chỉ tải khi mở xem trước/bấm
 * tải; tệp không phải ảnh tải link khi vào vùng nhìn (tên tệp là link tải duy nhất). Không
 * còn `refetchInterval` — link ký sống 24 giờ, ảnh lỗi do hết hạn thì refetch một lần.
 */

/** Khung ảnh tối đa 366×240 — trừ p-2 + viền của khung `max-w-sm` ngoài cùng. */
const IMAGE_MAX_WIDTH = 366;
const IMAGE_MAX_HEIGHT = 240;
const IMAGE_FALLBACK = { width: 240, height: 160 };

/**
 * Kích thước hiển thị tính từ width/height API đã ghi lúc xử lý tệp — đặt trước đúng ô này
 * thì thumbnail về muộn cũng không đẩy tin nhắn bên dưới nhảy (Discord cũng dùng width/height
 * của attachment để chừa chỗ trước khi ảnh tải xong).
 */
function imageBox(width: number | null, height: number | null) {
  if (!width || !height) return IMAGE_FALLBACK;
  const scale = Math.min(1, IMAGE_MAX_WIDTH / width, IMAGE_MAX_HEIGHT / height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function Attachment({ attachment }: { attachment: AttachmentDto }) {
  const t = useTranslations('attachments');
  const errorMessage = useErrorMessage();
  const image = attachment.mime.startsWith('image/');
  const box = imageBox(attachment.width, attachment.height);
  const { ref, inView } = useInView<HTMLDivElement>();
  const [open, setOpen] = useState(false);
  // Ảnh: bấm tên tệp khi link chưa có thì đợi link xong rồi tải xuống (effect bên dưới).
  const [downloadRequested, setDownloadRequested] = useState(false);
  const thumb = useAttachmentLink(attachment.id, { thumbnail: true, enabled: image && inView });
  const link = useAttachmentLink(attachment.id, {
    enabled: image ? open || downloadRequested : inView,
  });
  const retriedThumb = useRef(false);
  const downloadTriggered = useRef(false);

  // Không reset state trong effect (tránh setState đồng bộ khi render); cờ ref bảo đảm chỉ
  // kích hoạt tải xuống đúng một lần, còn `downloadRequested` giữ link gốc trong cache.
  useEffect(() => {
    if (!downloadRequested || !link.data || downloadTriggered.current) return;
    downloadTriggered.current = true;
    const anchor = document.createElement('a');
    anchor.href = link.data.url;
    anchor.download = attachment.filename;
    anchor.rel = 'noopener noreferrer';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }, [downloadRequested, link.data, attachment.filename]);

  if (thumb.error)
    return (
      <p role="status" className="text-xs text-destructive">
        {errorMessage(thumb.error)}
      </p>
    );

  return (
    <div ref={ref} className="max-w-sm rounded-lg border bg-muted p-2" data-testid="attachment">
      {image && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('preview', { name: attachment.filename })}
          className="block"
          style={{
            width: box.width,
            aspectRatio: `${box.width} / ${box.height}`,
            maxWidth: '100%',
          }}
        >
          {thumb.data ? (
            /* Ảnh lỗi tải (link hết hạn) không phải thao tác của người dùng nên bỏ qua luật
               "phần tử không tương tác"; ảnh ký từ API nên không dùng next/image. */
            /* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/no-noninteractive-element-interactions */
            <img
              src={thumb.data.url}
              alt={attachment.filename}
              width={attachment.width ?? undefined}
              height={attachment.height ?? undefined}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="size-full rounded object-contain"
              onError={() => {
                // Link thumbnail hết hạn/bị thu hồi: xin link mới đúng một lần cho mỗi lần mount.
                if (retriedThumb.current) return;
                retriedThumb.current = true;
                void thumb.refetch();
              }}
            />
          ) : (
            <span
              aria-hidden
              data-testid="attachment-placeholder"
              className="block size-full animate-pulse rounded bg-muted-foreground/10"
            />
          )}
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
      ) : link.error ? (
        <p role="status" className="text-xs text-destructive">
          {errorMessage(link.error)}
        </p>
      ) : image ? (
        <button
          type="button"
          onClick={() => setDownloadRequested(true)}
          className="block max-w-full truncate text-left text-sm underline"
        >
          {attachment.filename}
        </button>
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
        {open &&
          image &&
          (link.data ? (
            // Canonical signed images come from the API; no Next image optimizer cache.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={link.data.url}
              alt={attachment.filename}
              referrerPolicy="no-referrer"
              className="max-h-[70vh] max-w-full"
            />
          ) : link.error ? (
            <p role="status" className="text-sm text-destructive">
              {errorMessage(link.error)}
            </p>
          ) : (
            <p role="status" className="text-sm">
              {t('loading')}
            </p>
          ))}
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
