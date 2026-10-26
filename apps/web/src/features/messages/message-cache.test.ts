import type { MessageDto } from '@ping/shared';
import { describe, expect, it } from 'vitest';
import {
  type MessagesCache,
  markFailed,
  oldestFirst,
  optimisticMessage,
  upsertMessage,
  updateMessage,
  deleteMessage,
  preserveLocalMessages,
  patchGap,
  aroundWindow,
  prependNewer,
  applyReaction,
  applyPin,
  reactionsOf,
  setReactions,
  toggleReaction,
} from './message-cache';

const author = { id: 'u1', username: 'a', displayName: 'A', avatarUrl: null };

const msg = (id: string, nonce: string | null = null, content = id): MessageDto => ({
  id,
  content,
  nonce,
  editedAt: null,
  pinnedAt: null,
  pinnedById: null,
  createdAt: '2026-10-20T00:00:00.000Z',
  authorId: author.id,
  author,
  replyTo: null,
  reactions: [],
});

/** Trang 0 mới nhất; trong mỗi trang tin mới → cũ (đúng thứ tự API trả). */
const cache = (...pages: MessageDto[][]): MessagesCache => ({
  pages: pages.map((messages, index) => ({ messages, hasMore: index < pages.length - 1 })),
  pageParams: pages.map((_, index) => (index === 0 ? undefined : `p${index}`)),
});

const ids = (data: MessagesCache | undefined) =>
  data?.pages.map((page) => page.messages.map((message) => message.id));

describe('message-cache', () => {
  it('treats messages from the previous API version as having no reactions', () => {
    const legacy = msg('m1');
    // Reproduce a wire payload from the API before TG.2, during a rolling deploy.
    Reflect.deleteProperty(legacy, 'reactions');
    const before = cache([legacy]);
    expect(reactionsOf(before, 'm1')).toEqual([]);
    expect(reactionsOf(applyReaction(before, 'm1', { emoji: '👍', count: 1 }), 'm1')).toEqual([
      { emoji: '👍', count: 1, me: false },
    ]);
  });
  it('keeps the reply preview on the optimistic row until the server confirms it (TG.1)', () => {
    const preview = { id: 'm1', authorName: 'A', content: 'gốc', deleted: false };
    const pending = optimisticMessage({ content: 'hi', nonce: 'n1' }, author, preview);
    expect(pending.replyTo).toEqual(preview);
    const confirmed = upsertMessage(cache([pending]), {
      ...msg('m2', 'n1', 'hi'),
      replyTo: preview,
    })!;
    expect(confirmed.pages[0]?.messages).toHaveLength(1);
    expect(confirmed.pages[0]?.messages[0]?.replyTo).toEqual(preview);
  });
  it('a deletion arriving before confirmation also removes the matching optimistic nonce', () => {
    const pending = optimisticMessage({ content: 'hi', nonce: 'n1' }, author);
    const before = deleteMessage(cache([pending]), 'm1')!;
    const after = upsertMessage(before, msg('m1', 'n1', 'hi'))!;
    expect(ids(preserveLocalMessages(before, after))).toEqual([[]]);
  });
  it('late create/HTTP response cannot resurrect a deleted message or undo a newer edit', () => {
    const original = cache([msg('m1', 'n1')]);
    const edited = updateMessage(original, {
      id: 'm1',
      channelId: 'c',
      content: 'new',
      updatedAt: '2026-10-20T01:00:00.000Z',
    });
    expect(upsertMessage(edited, msg('m1', 'n1'))?.pages[0]?.messages[0]?.content).toBe('new');
    const deleted = deleteMessage(original, 'm1');
    expect(ids(upsertMessage(deleted, msg('m1', 'n1')))).toEqual([[]]);
    expect(ids(preserveLocalMessages(deleted, original))).toEqual([[]]);
  });
  it('HTTP failure after socket confirmation must not mark the confirmed row failed', () => {
    const confirmed = cache([msg('m1', 'n1')]);
    expect(markFailed(confirmed, 'n1')?.pages[0]?.messages[0]?.status).toBeUndefined();
  });

  it('updates loaded rows across pages, ignores old events and unknown ids', () => {
    const before = cache([msg('m2')], [msg('m1')]);
    const updated = updateMessage(before, {
      id: 'm1',
      channelId: 'c',
      content: 'edited',
      updatedAt: '2026-10-20T01:00:00.000Z',
    });
    expect(updated?.pages[1]?.messages[0]).toMatchObject({
      content: 'edited',
      editedAt: '2026-10-20T01:00:00.000Z',
    });
    expect(
      updateMessage(updated, {
        id: 'm1',
        channelId: 'c',
        content: 'old',
        updatedAt: '2026-10-20T00:00:00.000Z',
      }),
    ).toEqual(updated);
    expect(
      updateMessage(before, {
        id: 'unknown',
        channelId: 'c',
        content: 'x',
        updatedAt: '2026-10-20T01:00:00.000Z',
      }),
    ).toEqual(before);
    expect(before.pages[1]?.messages[0]?.content).toBe('m1');
  });

  it('deletes idempotently without changing pagination metadata', () => {
    const before = cache([msg('m2')], [msg('m1')]);
    const after = deleteMessage(before, 'm1');
    expect(ids(after)).toEqual([['m2'], []]);
    expect(after?.pageParams).toEqual(before.pageParams);
    expect(deleteMessage(after, 'm1')).toEqual(after);
    expect(deleteMessage(undefined, 'm1')).toBeUndefined();
  });

  it('refetch preserves local pending/failed rows and server confirmation wins by nonce', () => {
    const pending = optimisticMessage({ content: 'hi', nonce: 'n1' }, author);
    const before = cache([pending, msg('old')]);
    expect(ids(preserveLocalMessages(before, cache([msg('new')])))).toEqual([['temp-n1', 'new']]);
    expect(ids(preserveLocalMessages(before, cache([msg('confirmed', 'n1')])))).toEqual([
      ['confirmed'],
    ]);
  });
  it('oldestFirst: nối các trang rồi đảo để tin cũ ở trên, mới ở dưới', () => {
    expect(
      oldestFirst(cache([msg('m4'), msg('m3')], [msg('m2'), msg('m1')])).map((m) => m.id),
    ).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(oldestFirst(undefined)).toEqual([]);
  });

  it('tin optimistic chèn vào đầu trang mới nhất với trạng thái sending', () => {
    const temp = optimisticMessage({ content: 'hi', nonce: 'n1' }, author);
    expect(temp).toMatchObject({ id: 'temp-n1', nonce: 'n1', status: 'sending', authorId: 'u1' });

    const next = upsertMessage(cache([msg('m2')], [msg('m1')]), temp);
    expect(ids(next)).toEqual([['temp-n1', 'm2'], ['m1']]);
  });

  it('tin thật từ server thay tin tạm theo nonce (đúng vị trí, mất status)', () => {
    const withTemp = upsertMessage(
      cache([msg('m1')]),
      optimisticMessage({ content: 'hi', nonce: 'n1' }, author),
    );
    const confirmed = upsertMessage(withTemp, msg('m2', 'n1', 'hi'));

    expect(ids(confirmed)).toEqual([['m2', 'm1']]);
    expect(confirmed?.pages[0]?.messages[0]?.status).toBeUndefined();
  });

  it('cùng một tin đến hai lần (response HTTP + event socket) chỉ giữ một bản', () => {
    const withTemp = upsertMessage(
      cache([msg('m1')]),
      optimisticMessage({ content: 'hi', nonce: 'n1' }, author),
    );
    const fromSocket = upsertMessage(withTemp, msg('m2', 'n1', 'hi'));
    const fromResponse = upsertMessage(fromSocket, msg('m2', 'n1', 'hi'));

    expect(ids(fromResponse)).toEqual([['m2', 'm1']]);
  });

  it('tin của người khác (không có nonce của mình) chèn vào đầu', () => {
    expect(ids(upsertMessage(cache([msg('m1')]), msg('m2')))).toEqual([['m2', 'm1']]);
  });

  it('gửi thất bại rồi gửi lại cùng nonce: vẫn một tin, quay về sending tại chỗ', () => {
    const withTemp = upsertMessage(
      cache([msg('m1')]),
      optimisticMessage({ content: 'hi', nonce: 'n1' }, author),
    );
    const failed = markFailed(withTemp, 'n1');
    expect(failed?.pages[0]?.messages[0]?.status).toBe('failed');

    const retried = upsertMessage(
      failed,
      optimisticMessage({ content: 'hi', nonce: 'n1' }, author),
    );
    expect(ids(retried)).toEqual([['temp-n1', 'm1']]);
    expect(retried?.pages[0]?.messages[0]?.status).toBe('sending');
  });

  it('cache chưa tải (undefined) thì để nguyên — trang sẽ tự tải dữ liệu mới', () => {
    expect(upsertMessage(undefined, msg('m1'))).toBeUndefined();
    expect(markFailed(undefined, 'n1')).toBeUndefined();
  });

  it('không sửa cache cũ (immutable) — TanStack Query so sánh tham chiếu để re-render', () => {
    const before = cache([msg('m1')]);
    const snapshot = JSON.stringify(before);
    upsertMessage(before, msg('m2'));
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('patchGap (T4.4, ADR-0044)', () => {
  it('chèn đủ khoảng thiếu vào đúng vị trí, không trùng', () => {
    // Cache có m1..m3 (mới nhất trước: trang 0 = [m3, m2]); fetch về m4, m5.
    const before = cache([msg('m3'), msg('m2')], [msg('m1')]);
    const patched = patchGap(before, 'm3', [msg('m4'), msg('m5')])!;
    // Sau vá: m5, m4 đứng trước m3 trong trang 0 (thứ tự mới → cũ).
    expect(ids(patched)![0]).toEqual(['m5', 'm4', 'm3', 'm2']);
    expect(patched.pages[1]!.messages.map((m) => m.id)).toEqual(['m1']);
  });

  it('bỏ tin trong khoảng fetch mà server không trả (bị xóa lúc offline)', () => {
    // Cache có m1..m4; offline xóa m3; fetch khoảng (m1, …] chỉ về m2, m4.
    const before = cache([msg('m4'), msg('m3')], [msg('m2'), msg('m1')]);
    const patched = patchGap(before, 'm1', [msg('m2'), msg('m4')])!;
    expect(oldestFirst(patched).map((m) => m.id)).toEqual(['m1', 'm2', 'm4']);
  });

  it('KHÔNG bỏ tin mới hơn khoảng fetch (event đến song song) và tin optimistic', () => {
    const pending = optimisticMessage({ content: 'soạn dở', nonce: 'n9' }, author);
    // Cache: m2 (tail đã vá tới m1), có sẵn m3 từ event + tin optimistic.
    const before = cache([pending, msg('m3'), msg('m2')], [msg('m1')]);
    // Fetch khoảng (m1, m2] trả về đúng m2 — m3 nằm NGOÀI khoảng (m3 > upper=m2) → giữ.
    const patched = patchGap(before, 'm1', [msg('m2')])!;
    expect(oldestFirst(patched).map((m) => m.id)).toContain('m3');
    expect(oldestFirst(patched).some((m) => m.id === 'temp-n9')).toBe(true);
  });

  it('fetch rỗng không đổi gì', () => {
    const before = cache([msg('m2'), msg('m1')]);
    expect(ids(patchGap(before, 'm2', []))).toEqual(ids(before));
  });
});

describe('chaos: đảo thứ tự / rớt gói / nonce trùng (T4.5)', () => {
  it('đảo thứ tự create (m5 đến trước m4) vẫn hiển thị đúng thứ tự', () => {
    const base = cache([msg('m3'), msg('m2')], [msg('m1')]);
    const withM5 = upsertMessage(base, msg('m5'))!;
    const withM4 = upsertMessage(withM5, msg('m4'))!;
    // Trang 0 mới nhất trước: m5 đứng trên m4.
    expect(ids(withM4)![0]).toEqual(['m5', 'm4', 'm3', 'm2']);
    expect(oldestFirst(withM4).map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
  });

  it('rớt gói giữa chừng: merge trang-mới-nhất (prune=false) vá lại tin bị mất, không trùng', () => {
    // Sự kiện m3 bị rớt nhưng m4, m5 vẫn đến → cache thiếu m3.
    const dropped = upsertMessage(
      upsertMessage(cache([msg('m2'), msg('m1')]), msg('m4'))!,
      msg('m5'),
    )!;
    expect(oldestFirst(dropped).map((m) => m.id)).toEqual(['m1', 'm2', 'm4', 'm5']);
    // Reconnect: trang mới nhất (desc → đảo thành asc) merge kiểu upsert-only.
    const newestAsc = [msg('m1'), msg('m2'), msg('m3'), msg('m4'), msg('m5')];
    const healed = patchGap(dropped, 'm5', newestAsc, { prune: false })!;
    expect(oldestFirst(healed).map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
  });

  it('patchGap prune=false KHÔNG bỏ tin trong khoảng fetch mà server không trả', () => {
    // Giữ nguyên ràng buộc cũ với prune mặc định; tắt prune phải giữ mọi cached id.
    const before = cache([msg('m4'), msg('m3')], [msg('m2'), msg('m1')]);
    const pruned = patchGap(before, 'm1', [msg('m2'), msg('m4')])!;
    expect(oldestFirst(pruned).map((m) => m.id)).toEqual(['m1', 'm2', 'm4']);
    const notPruned = patchGap(before, 'm1', [msg('m2'), msg('m4')], { prune: false })!;
    expect(oldestFirst(notPruned).map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it('nonce trùng: optimistic đang gửi + patch fetch về cùng nonce → đúng một bản, hết trạng thái tạm', () => {
    const pending = optimisticMessage({ content: 'hello', nonce: 'n1' }, author);
    const base = upsertMessage(cache([msg('m2'), msg('m1')]), pending)!;
    const real = msg('m9', 'n1', 'hello');
    const healed = patchGap(base, 'm2', [real], { prune: false })!;
    const shown = oldestFirst(healed);
    expect(shown.filter((m) => m.nonce === 'n1')).toHaveLength(1);
    expect(shown.find((m) => m.nonce === 'n1')?.status).toBeUndefined();
    expect(shown.find((m) => m.nonce === 'n1')?.id).toBe('m9');
  });

  it('aroundWindow: cache là MỘT trang quanh tin đích, giữ hasNewer + cursor tải tin cũ (TG.5)', () => {
    const data = aroundWindow(
      { messages: [msg('m6'), msg('m5'), msg('m4')], hasMore: true, hasNewer: true },
      'm4',
    );
    expect(data.pages).toHaveLength(1);
    expect(data.pageParams).toEqual([undefined]);
    expect(data.window).toEqual({ aroundId: 'm4', hasNewer: true });
    expect(oldestFirst(data).map((m) => m.id)).toEqual(['m4', 'm5', 'm6']);
    // Trang cuối là tin CŨ NHẤT → getNextPageParam của infinite query nối tiếp đúng chiều cũ.
    expect(data.pages.at(-1)?.messages.at(-1)?.id).toBe('m4');
  });

  it('prependNewer: đảo trang after (tăng dần) thành mới→cũ và chèn lên đầu, cập nhật hasNewer (TG.5)', () => {
    const windowed = aroundWindow(
      { messages: [msg('m6'), msg('m5'), msg('m4')], hasMore: true, hasNewer: true },
      'm4',
    );
    const more = prependNewer(windowed, {
      messages: [msg('m7'), msg('m8')], // API `after` trả tăng dần
      hasMore: false,
    })!;
    expect(oldestFirst(more).map((m) => m.id)).toEqual(['m4', 'm5', 'm6', 'm7', 'm8']);
    expect(more.window).toEqual({ aroundId: 'm4', hasNewer: false });
  });

  it('prependNewer: cache không phải cửa sổ permalink thì trả nguyên (không phá luồng thường)', () => {
    const normal = cache([msg('m2'), msg('m1')]);
    expect(prependNewer(normal, { messages: [msg('m3')], hasMore: false })).toBe(normal);
  });

  it('preserveLocalMessages: giữ `window` khi fetchNextPage dựng lại {pages, pageParams} (TG.5)', () => {
    const windowed = aroundWindow(
      { messages: [msg('m6'), msg('m5'), msg('m4')], hasMore: true, hasNewer: true },
      'm4',
    );
    // Đúng hình dạng `infiniteQueryBehavior` trả về khi tải trang cũ: chỉ có pages + pageParams,
    // không spread metadata của cache trước đó. Thiếu bước giữ này thì nút "Tải tin mới hơn"
    // biến mất ngay sau lần cuộn lên đầu (đã gặp trong e2e permalink).
    const fetchedOlder: MessagesCache = {
      pages: [windowed.pages[0]!, { messages: [msg('m3')], hasMore: true }],
      pageParams: [undefined, 'm4'],
    };
    const kept = preserveLocalMessages(windowed, fetchedOlder);
    expect(kept.window).toEqual({ aroundId: 'm4', hasNewer: true });
    expect(kept.pages).toHaveLength(2);
    // Writer của TG.5 (after có `window`) vẫn thắng giá trị cũ.
    const replaced = preserveLocalMessages(
      windowed,
      aroundWindow({ messages: [msg('m9')], hasMore: true, hasNewer: false }, 'm9'),
    );
    expect(replaced.window).toEqual({ aroundId: 'm9', hasNewer: false });
    // Cache thường (không có window) không bị thêm metadata.
    expect(preserveLocalMessages(undefined, fetchedOlder).window).toBeUndefined();
  });
});

describe('reactions (TG.2)', () => {
  const withReactions = (id: string, reactions: MessageDto['reactions']) => ({
    ...msg(id),
    reactions,
  });

  it('toggleReaction chỉ đổi đúng emoji của người xem, giữ emoji khác và thứ tự count', () => {
    const base = cache([
      withReactions('m1', [
        { emoji: '🔥', count: 3, me: false },
        { emoji: '👍', count: 1, me: false },
      ]),
    ]);
    const added = toggleReaction(base, 'm1', '👍', true)!;
    expect(reactionsOf(added, 'm1')).toEqual([
      { emoji: '🔥', count: 3, me: false },
      { emoji: '👍', count: 2, me: true },
    ]);
    const removed = toggleReaction(added, 'm1', '👍', false)!;
    expect(reactionsOf(removed, 'm1')).toEqual([
      { emoji: '🔥', count: 3, me: false },
      { emoji: '👍', count: 1, me: false },
    ]);
    // Gỡ emoji duy nhất → nhóm biến mất, không còn "0 người".
    const single = toggleReaction(
      cache([withReactions('m1', [{ emoji: '👍', count: 1, me: true }])]),
      'm1',
      '👍',
      false,
    )!;
    expect(reactionsOf(single, 'm1')).toEqual([]);
  });

  it('applyReaction lấy count của event làm chuẩn và giữ cờ `me` khi người khác thả', () => {
    const base = cache([withReactions('m1', [{ emoji: '👍', count: 1, me: true }])]);
    const other = applyReaction(base, 'm1', { emoji: '👍', count: 2 })!;
    expect(reactionsOf(other, 'm1')).toEqual([{ emoji: '👍', count: 2, me: true }]);
    // Chính người xem gỡ: count 0 → bỏ nhóm.
    const own = applyReaction(other, 'm1', { emoji: '👍', count: 0, me: false })!;
    expect(reactionsOf(own, 'm1')).toEqual([]);
    // Tin không có trong trang đã tải: không tạo hàng giả.
    expect(ids(applyReaction(base, 'missing', { emoji: '👍', count: 1 }))).toEqual(ids(base));
  });

  it('setReactions thay toàn bộ nhóm bằng response chuẩn, không đụng tin khác', () => {
    const base = cache([
      withReactions('m2', [{ emoji: '🔥', count: 9, me: false }]),
      withReactions('m1', [{ emoji: '👍', count: 1, me: true }]),
    ]);
    const next = setReactions(base, 'm1', [
      { emoji: '🎉', count: 2, me: true },
      { emoji: '👍', count: 1, me: false },
    ])!;
    expect(reactionsOf(next, 'm1')).toEqual([
      { emoji: '🎉', count: 2, me: true },
      { emoji: '👍', count: 1, me: false },
    ]);
    expect(reactionsOf(next, 'm2')).toEqual([{ emoji: '🔥', count: 9, me: false }]);
  });

  it('applyPin chỉ đổi trạng thái ghim của đúng tin, cả hai chiều', () => {
    const base = cache([msg('m1'), msg('m2')]);
    const pinned = applyPin(base, {
      messageId: 'm2',
      pinnedAt: '2026-10-26T10:00:00.000Z',
      pinnedById: 'u2',
    })!;
    expect(pinned.pages[0]!.messages.find((row) => row.id === 'm2')).toMatchObject({
      pinnedAt: '2026-10-26T10:00:00.000Z',
      pinnedById: 'u2',
    });
    expect(pinned.pages[0]!.messages.find((row) => row.id === 'm1')?.pinnedAt).toBeNull();
    const unpinned = applyPin(pinned, { messageId: 'm2', pinnedAt: null, pinnedById: null })!;
    expect(unpinned.pages[0]!.messages.find((row) => row.id === 'm2')?.pinnedAt).toBeNull();
    // Chưa tải trang nào thì không tạo trang giả.
    expect(
      applyPin(undefined, { messageId: 'm2', pinnedAt: null, pinnedById: null }),
    ).toBeUndefined();
  });
});
