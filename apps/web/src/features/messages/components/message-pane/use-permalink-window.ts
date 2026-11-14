'use client';

import { useEffect, useRef, useState } from 'react';
import { useLoadNewer, useResetWindow, useSeedAround } from '../../hooks';
import type { ClientMessage, MessagesWindow } from '../../message-cache';

export function usePermalinkWindow({
  channelId,
  focusId,
  messages,
  window,
}: {
  channelId: string;
  focusId: string | null;
  messages: ClientMessage[];
  window: MessagesWindow | undefined;
}) {
  const seedAround = useSeedAround(channelId);
  const resetWindow = useResetWindow(channelId);
  const loadNewer = useLoadNewer(channelId);

  const focusIndex = focusId ? messages.findIndex((message) => message.id === focusId) : -1;
  const windowed = focusId !== null && window?.aroundId === focusId;
  const [focusMissing, setFocusMissing] = useState(false);
  const seeding = useRef<string | null>(null);
  useEffect(() => {
    if (!focusId || focusIndex >= 0 || windowed || seeding.current === focusId) return;
    seeding.current = focusId;
    void seedAround(focusId)
      .then((result) => {
        if (result === 'missing') setFocusMissing(true);
      })
      .catch(() => {})
      .finally(() => {
        seeding.current = null;
      });
  }, [focusId, focusIndex, windowed, seedAround]);

  useEffect(() => {
    if (focusId === null && window) void resetWindow();
  }, [focusId, window, resetWindow]);

  const hasNewer = window?.hasNewer ?? false;

  const [loadingNewer, setLoadingNewer] = useState(false);
  function loadMoreNewer() {
    if (loadingNewer) return;
    setLoadingNewer(true);
    void loadNewer().finally(() => setLoadingNewer(false));
  }

  return {
    focusIndex,
    focusMissing,
    focusPending: focusId !== null && focusIndex < 0 && !focusMissing,
    hasNewer,
    loadingNewer,
    loadMoreNewer,
  };
}
