'use client';
import type { GifPayload } from '@ping/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { useErrorMessage } from '@/lib/error-message';
import { GIF_QUERY_MIN_LENGTH, useGifSearch, useGifTrending } from '../hooks';
import { isGifProviderUnavailable } from '../gif-utils';
import { useInView } from '../use-in-view';
import { usePrefersReducedMotion } from '../use-prefers-reduced-motion';
import { GifPlaceholder } from './gif-placeholder';

/** Số cột của lưới GIF kiểu Giphy — khớp cột dùng cho điều hướng mũi tên. */
const GIF_COLUMNS = 3;
/** Debounce tìm GIF: chỉ gọi sau khi ngừng gõ 300ms, tránh dập cổng có rate limit riêng. */
const GIF_SEARCH_DEBOUNCE_MS = 300;

/**
 * Một lưới GIF trong tab GIF: ô giữ đúng tỉ lệ theo width/height của GifDto (không nhảy layout),
 * ảnh tải lười (`loading="lazy"`). `prefers-reduced-motion` → không tự phát ảnh động: mỗi ô là
 * khối giữ chỗ (GIF không có khung tĩnh); bấm ô vẫn gửi ngay như sticker. Dùng chung cho lưới
 * tìm/trending (GifDto) và lưới "Gần đây" (GifPayload — mục lưu localStorage không có provider).
 */
function GifGrid<T extends GifPayload>({
  gifs,
  label,
  testId,
  onPickGif,
  pickLabel,
  placeholderLabel,
}: {
  gifs: T[];
  label: string;
  testId: string;
  onPickGif: (gif: T) => void;
  pickLabel: (position: number) => string;
  placeholderLabel: string;
}) {
  const reduced = usePrefersReducedMotion();
  const gridRef = useRef<HTMLDivElement>(null);

  // Cùng cơ chế điều hướng bàn phím với lưới sticker (mũi tên, picker TG.22), khác số cột.
  function onGridKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const buttons = Array.from(
      gridRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [],
    );
    const index = buttons.indexOf(event.currentTarget);
    if (index < 0) return;
    const next =
      event.key === 'ArrowRight'
        ? index + 1
        : event.key === 'ArrowLeft'
          ? index - 1
          : event.key === 'ArrowDown'
            ? index + GIF_COLUMNS
            : event.key === 'ArrowUp'
              ? index - GIF_COLUMNS
              : undefined;
    event.preventDefault();
    if (next === undefined) return;
    if (next >= 0 && next < buttons.length) buttons[next]!.focus();
  }

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label={label}
      data-testid={testId}
      className="grid grid-cols-3 items-start gap-1"
    >
      {gifs.map((gif, index) => (
        <button
          key={`${gif.id}-${index}`}
          type="button"
          role="gridcell"
          aria-label={pickLabel(index + 1)}
          title={pickLabel(index + 1)}
          onClick={() => onPickGif(gif)}
          onKeyDown={onGridKeyDown}
          data-testid="gif-option"
          className="overflow-hidden rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {reduced ? (
            <GifPlaceholder width={gif.width} height={gif.height} label={placeholderLabel} />
          ) : (
            <img
              src={gif.url}
              alt=""
              width={gif.width}
              height={gif.height}
              loading="lazy"
              decoding="async"
              style={{ aspectRatio: `${gif.width} / ${gif.height}` }}
              className="h-auto w-full object-cover"
            />
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * Thân tab "GIF" của sticker picker (TG.25, ADR-0069): không gõ gì → thịnh hành; gõ (đã debounce)
 * → tìm kiếm. Section "Gần đây" lưu localStorage theo user do composer giữ. Ghi công Tenor chỉ
 * hiện khi có dữ liệu nhà cung cấp; thiếu key/quota (503 `GIF_PROVIDER_UNAVAILABLE`) hiện empty
 * state riêng "chưa khả dụng" — chat vẫn gửi/nhận bình thường.
 */
export function GifPanel({
  query,
  recentGifs,
  onPickGif,
}: {
  /** Truy vấn thô từ ô tìm kiếm dùng chung của picker; panel tự debounce. */
  query: string;
  /** GIF gần đây của user (state ở composer, đã lưu localStorage). */
  recentGifs: GifPayload[];
  /** Bấm một GIF (trending/tìm/gần đây): nhận payload đủ để gửi tin — provider không dùng ở client. */
  onPickGif: (gif: GifPayload) => void;
}) {
  const t = useTranslations('gifs');
  const errorMessage = useErrorMessage();
  const [debounced, setDebounced] = useState(query);
  // Debounce: chỉ tìm sau khi ngừng gõ 300ms (pattern search-dialog TG.9).
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), GIF_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const { ref: bodyRef, inView } = useInView<HTMLDivElement>();
  // Dưới độ dài tối thiểu thì chưa coi là tìm kiếm — vẫn hiện trending thay vì treo "đang tải".
  const searching = debounced.trim().length >= GIF_QUERY_MIN_LENGTH;
  // Fetch chỉ khi tab GIF thực sự hiện ra (IntersectionObserver); có truy vấn thì bỏ trending.
  const search = useGifSearch(debounced, inView);
  const trending = useGifTrending(inView && !searching);
  const active = searching ? search : trending;
  const gifs = active.data?.gifs ?? [];
  const unavailable = active.isError && isGifProviderUnavailable(active.error);
  // Ghi công khi đang hiển thị nội dung Tenor (kết quả hoặc GIF gần đây) — không hiện khi lỗi.
  const showAttribution = !active.isError && (gifs.length > 0 || recentGifs.length > 0);

  const pickLabel = (position: number) => t('pickGif', { n: position });
  const hasRecents = !searching && recentGifs.length > 0;

  return (
    <div className="flex min-h-0 flex-col gap-1.5">
      <div ref={bodyRef} className="flex min-h-0 flex-col gap-1.5">
        {hasRecents && (
          <section aria-label={t('recent')} data-testid="gif-recent">
            <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">{t('recent')}</p>
            <GifGrid
              gifs={recentGifs}
              label={t('recent')}
              testId="gif-recent-grid"
              onPickGif={onPickGif}
              pickLabel={pickLabel}
              placeholderLabel={t('placeholder')}
            />
          </section>
        )}
        {active.isPending ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('loading')}</p>
        ) : active.isError ? (
          unavailable ? (
            <p
              role="status"
              data-testid="gif-unavailable"
              className="py-6 text-center text-sm text-muted-foreground"
            >
              {t('unavailable')}
            </p>
          ) : (
            <p
              role="alert"
              data-testid="gif-error"
              className="py-6 text-center text-sm text-destructive"
            >
              {errorMessage(active.error)}
            </p>
          )
        ) : gifs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('noResults')}</p>
        ) : (
          <GifGrid
            gifs={gifs}
            label={searching ? t('searchResults') : t('trending')}
            testId="gif-grid"
            onPickGif={onPickGif}
            pickLabel={pickLabel}
            placeholderLabel={t('placeholder')}
          />
        )}
      </div>
      {showAttribution && (
        // Ghi công bắt buộc theo điều khoản Tenor (ADR-0069): cố định chân tab, cả khi tìm lẫn trending.
        <p
          className="px-1 text-center text-[11px] text-muted-foreground"
          data-testid="gif-attribution"
        >
          <a
            href="https://tenor.com"
            target="_blank"
            rel="noreferrer"
            className="underline transition-colors hover:text-foreground"
          >
            {t('attribution')}
          </a>
        </p>
      )}
    </div>
  );
}
