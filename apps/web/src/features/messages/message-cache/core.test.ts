import { describe, expect, it } from 'vitest';
import {
  markFailed,
  oldestFirst,
  optimisticMessage,
  upsertMessage,
  updateMessage,
  deleteMessage,
  preserveLocalMessages,
  applyReaction,
  reactionsOf,
  replyPreviewOf,
} from './index';
import { author, msg, cache, ids } from './test-helpers';

describe('core', () => {
  it('treats messages from the previous API version as having no reactions', () => {
    const legacy = msg('m1');
    Reflect.deleteProperty(legacy, 'reactions');
    const before = cache([legacy]);
    expect(reactionsOf(before, 'm1')).toEqual([]);
    expect(reactionsOf(applyReaction(before, 'm1', { emoji: '👍', count: 1 }), 'm1')).toEqual([
      { emoji: '👍', count: 1, me: false },
    ]);
  });
  it('keeps the reply preview on the optimistic row until the server confirms it', () => {
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
  it('optimisticMessage với sticker: kind=sticker + preview đi kèm', () => {
    const preview = {
      id: 's1',
      name: 'party-parrot',
      deleted: false,
      url: '/api/v1/attachments/att/file?expires=1&signature=a',
      previewUrl: '/api/v1/attachments/att/file?expires=1&signature=b&thumbnail=1',
      width: 256,
      height: 256,
    };
    const pending = optimisticMessage(
      { content: '', nonce: 'n9', stickerId: 's1', sticker: preview },
      author,
    );
    expect(pending.kind).toBe('sticker');
    expect(pending.sticker).toEqual(preview);
    expect(pending.content).toBe('');
    const plain = optimisticMessage({ content: 'hi', nonce: 'n10' }, author);
    expect(plain.kind).toBeUndefined();
    expect(plain.sticker).toBeUndefined();
  });

  it('upsertMessage hợp nhất tin sticker từ event với tin optimistic cùng nonce', () => {
    const pending = optimisticMessage(
      {
        content: '',
        nonce: 'n11',
        stickerId: 's1',
        sticker: {
          id: 's1',
          name: 'x',
          deleted: false,
          url: 'u',
          previewUrl: 'p',
          width: 8,
          height: 8,
        },
      },
      author,
    );
    const confirmed = msg('m9', 'n11', '');
    confirmed.kind = 'sticker';
    confirmed.sticker = {
      id: 's1',
      name: 'x',
      deleted: false,
      url: '/signed',
      previewUrl: '/signed-thumb',
      width: 64,
      height: 64,
    };
    const next = upsertMessage(cache([pending]), confirmed)!;
    expect(ids(next)).toEqual([['m9']]);
    const row = next.pages[0]!.messages[0]!;
    expect(row.kind).toBe('sticker');
    expect(row.sticker).toEqual(confirmed.sticker);
    expect(row.status).toBeUndefined();
  });
});

describe('replyPreviewOf', () => {
  it('lấy id, tên tác giả và nội dung', () => {
    expect(replyPreviewOf(msg('m1', null, 'chào'))).toEqual({
      id: 'm1',
      authorName: 'A',
      content: 'chào',
      deleted: false,
    });
  });
  it('cắt nội dung ở 120 ký tự', () => {
    expect(replyPreviewOf(msg('m1', null, 'a'.repeat(300))).content).toHaveLength(120);
  });
});
