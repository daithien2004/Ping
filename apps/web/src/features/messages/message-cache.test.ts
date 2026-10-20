import type { MessageDto } from '@ping/shared';
import { describe, expect, it } from 'vitest';
import {
  type MessagesCache,
  markFailed,
  oldestFirst,
  optimisticMessage,
  upsertMessage,
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
});

/** Trang 0 mới nhất; trong mỗi trang tin mới → cũ (đúng thứ tự API trả). */
const cache = (...pages: MessageDto[][]): MessagesCache => ({
  pages: pages.map((messages, index) => ({ messages, hasMore: index < pages.length - 1 })),
  pageParams: pages.map((_, index) => (index === 0 ? undefined : `p${index}`)),
});

const ids = (data: MessagesCache | undefined) =>
  data?.pages.map((page) => page.messages.map((message) => message.id));

describe('message-cache', () => {
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
