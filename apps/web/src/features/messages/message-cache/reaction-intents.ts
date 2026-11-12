import type { MessageReactionDto } from '@ping/shared';
import { sortReactions } from './reactions-sort';
import type { MessagesCache } from './types';

interface ReactionIntent {
  token: number;
  me: boolean;
  /** Có event realtime cho đúng emoji này trong lúc HTTP còn chờ → event là bản chuẩn. */
  sawEvent: boolean;
}

const pending = new Map<string, Map<string, ReactionIntent>>();
let nextToken = 1;

/** Ghi nhận ý định thả/gỡ; response nào mang token cũ hơn thì không còn quyền ghi đè. */
export function startReactionIntent(messageId: string, emoji: string, me: boolean): number {
  const token = nextToken;
  nextToken += 1;
  const byEmoji = pending.get(messageId) ?? new Map<string, ReactionIntent>();
  byEmoji.set(emoji, { token, me, sawEvent: false });
  pending.set(messageId, byEmoji);
  return token;
}

export function noteReactionEvent(messageId: string, emoji: string): void {
  const intent = pending.get(messageId)?.get(emoji);
  if (intent) intent.sawEvent = true;
}

export function settleReactionIntent(
  messageId: string,
  emoji: string,
  token: number,
): { sawEvent: boolean } | null {
  const byEmoji = pending.get(messageId);
  const intent = byEmoji?.get(emoji);
  if (!byEmoji || !intent || intent.token !== token) return null;
  byEmoji.delete(emoji);
  if (byEmoji.size === 0) pending.delete(messageId);
  return { sawEvent: intent.sawEvent };
}

/**
 * Phủ các ý định đang chờ lên một snapshot cache (dữ liệu server hoặc bản ghi khác).
 * Chỉ cộng/trừ khi snapshot chưa phản ánh cờ `me` của ý định — nhờ vậy áp lại nhiều lần
 * (fetch chồng, event echo) không đếm đôi. Trả nguyên tham chiếu khi không có gì phải đổi.
 */
export function applyReactionIntents(cache: MessagesCache | undefined): MessagesCache | undefined {
  if (!cache || pending.size === 0) return cache;
  let result = cache;
  for (const [messageId, byEmoji] of pending) result = overlay(result, messageId, byEmoji);
  return result;
}

function overlay(
  cache: MessagesCache,
  messageId: string,
  byEmoji: Map<string, ReactionIntent>,
): MessagesCache {
  let changed = false;
  const pages = cache.pages.map((page) => {
    const index = page.messages.findIndex((message) => message.id === messageId);
    if (index === -1) return page;
    const message = page.messages[index]!;
    const reactions = overlayReactions(message.reactions ?? [], byEmoji);
    if (reactions === message.reactions) return page;
    changed = true;
    const messages = [...page.messages];
    messages[index] = { ...message, reactions };
    return { ...page, messages };
  });
  return changed ? { ...cache, pages } : cache;
}

function overlayReactions(
  reactions: MessageReactionDto[],
  byEmoji: Map<string, ReactionIntent>,
): MessageReactionDto[] {
  let rows = reactions;
  let changed = false;
  for (const [emoji, intent] of byEmoji) {
    const existing = rows.find((row) => row.emoji === emoji);
    if ((existing?.me ?? false) === intent.me) continue;
    const count = Math.max((existing?.count ?? 0) + (intent.me ? 1 : -1), 0);
    const rest = rows.filter((row) => row.emoji !== emoji);
    rows =
      count <= 0
        ? rest
        : sortReactions([
            ...rest,
            {
              emoji,
              count,
              me: intent.me,
              ...(existing?.emojiName ? { emojiName: existing.emojiName } : {}),
            },
          ]);
    changed = true;
  }
  return changed ? rows : reactions;
}

/** Chỉ dùng cho test: xoá trạng thái module giữa các ca. */
export function clearReactionIntents(): void {
  pending.clear();
}
