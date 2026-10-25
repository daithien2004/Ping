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
} from './message-cache';

const author = { id: 'u1', username: 'a', displayName: 'A', avatarUrl: null };

const msg = (id: string, nonce: string | null = null, content = id): MessageDto => ({
  id,
  content,
  nonce,
  editedAt: null,
  createdAt: '2026-10-20T00:00:00.000Z',
  authorId: author.id,
  author,
  replyTo: null,
});

/** Trang 0 mới nhất; trong mỗi trang tin mới → cũ (đúng thứ tự API trả). */
const cache = (...pages: MessageDto[][]): MessagesCache => ({
  pages: pages.map((messages, index) => ({ messages, hasMore: index < pages.length - 1 })),
  pageParams: pages.map((_, index) => (index === 0 ? undefined : `p${index}`)),
});

const ids = (data: MessagesCache | undefined) =>
  data?.pages.map((page) => page.messages.map((message) => message.id));

describe('message-cache', () => {
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
});
