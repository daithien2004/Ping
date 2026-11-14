'use client';
import type { GifPayload } from '@ping/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { useErrorMessage } from '@/lib/error-message';
import { GIF_QUERY_MIN_LENGTH, useGifSearch, useGifTrending } from '../hooks';
import { isGifProviderUnavailable } from '../gif-utils';
import { useInView } from '@/lib/use-in-view';
import { usePrefersReducedMotion } from '../use-prefers-reduced-motion';
import { GifPlaceholder } from './gif-placeholder';
import { gridArrowKeyIndex } from '@/lib/grid-arrow-key-index';

const GIF_COLUMNS = 3;
const GIF_SEARCH_DEBOUNCE_MS = 300;

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

  function onGridKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const buttons = Array.from(
      gridRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [],
    );
    const index = buttons.indexOf(event.currentTarget);
    if (index < 0) return;
    const next = gridArrowKeyIndex(event.key, index, buttons.length, GIF_COLUMNS);
    if (next === undefined) return;
    event.preventDefault();
    buttons[next]!.focus();
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
          className="overflow-hidden rounded focus-ring"
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

export function GifPanel({
  query,
  recentGifs,
  onPickGif,
}: {
  query: string;
  recentGifs: GifPayload[];
  onPickGif: (gif: GifPayload) => void;
}) {
  const t = useTranslations('gifs');
  const errorMessage = useErrorMessage();
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), GIF_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const { ref: bodyRef, inView } = useInView<HTMLDivElement>();
  const searching = debounced.trim().length >= GIF_QUERY_MIN_LENGTH;
  const search = useGifSearch(debounced, inView);
  const trending = useGifTrending(inView && !searching);
  const active = searching ? search : trending;
  const gifs = active.data?.gifs ?? [];
  const unavailable = active.isError && isGifProviderUnavailable(active.error);
  const showAttribution = !active.isError && (gifs.length > 0 || recentGifs.length > 0);

  const pickLabel = (position: number) => t('pickGif', { n: position });
  const hasRecents = !searching && recentGifs.length > 0;

  return (
    <div className="flex min-h-0 flex-col gap-1.5">
      <div ref={bodyRef} className="flex min-h-0 flex-col gap-1.5">
        {hasRecents && (
          <section aria-label={t('recent')} data-testid="gif-recent">
            <h3 className="pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('recent')}
            </h3>
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
          <p className="flex min-h-32 items-center justify-center text-sm text-muted-foreground">
            {t('loading')}
          </p>
        ) : active.isError ? (
          unavailable ? (
            <p
              role="status"
              data-testid="gif-unavailable"
              className="flex min-h-32 items-center justify-center text-sm text-muted-foreground"
            >
              {t('unavailable')}
            </p>
          ) : (
            <p
              role="alert"
              data-testid="gif-error"
              className="flex min-h-32 items-center justify-center text-sm text-destructive"
            >
              {errorMessage(active.error)}
            </p>
          )
        ) : gifs.length === 0 ? (
          <p className="flex min-h-32 items-center justify-center text-sm text-muted-foreground">
            {t('noResults')}
          </p>
        ) : (
          <section aria-label={searching ? t('searchResults') : t('trending')}>
            <h3 className="pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {searching ? t('searchResults') : t('trending')}
            </h3>
            <GifGrid
              gifs={gifs}
              label={searching ? t('searchResults') : t('trending')}
              testId="gif-grid"
              onPickGif={onPickGif}
              pickLabel={pickLabel}
              placeholderLabel={t('placeholder')}
            />
          </section>
        )}
      </div>
      {showAttribution && (
        // Ghi công bắt buộc theo điều khoản Tenor: luôn cố định ở chân tab.
        <p className="px-1 text-center text-xs text-muted-foreground" data-testid="gif-attribution">
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
