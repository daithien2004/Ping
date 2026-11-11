import { describe, expect, it } from 'vitest';
import type { MessagesCache } from './index';
import {
  oldestFirst,
  optimisticMessage,
  upsertMessage,
  preserveLocalMessages,
  patchGap,
  aroundWindow,
  prependNewer,
} from './index';
import { author, msg, cache, ids } from './test-helpers';

describe('patchGap', () => {
  it('chèn đủ khoảng thiếu vào đúng vị trí, không trùng', () => {
    const before = cache([msg('m3'), msg('m2')], [msg('m1')]);
    const patched = patchGap(before, 'm3', [msg('m4'), msg('m5')])!;
    expect(ids(patched)![0]).toEqual(['m5', 'm4', 'm3', 'm2']);
    expect(patched.pages[1]!.messages.map((m) => m.id)).toEqual(['m1']);
  });

  it('bỏ tin trong khoảng fetch mà server không trả (bị xóa lúc offline)', () => {
    const before = cache([msg('m4'), msg('m3')], [msg('m2'), msg('m1')]);
    const patched = patchGap(before, 'm1', [msg('m2'), msg('m4')])!;
    expect(oldestFirst(patched).map((m) => m.id)).toEqual(['m1', 'm2', 'm4']);
  });

  it('KHÔNG bỏ tin mới hơn khoảng fetch (event đến song song) và tin optimistic', () => {
    const pending = optimisticMessage({ content: 'soạn dở', nonce: 'n9' }, author);
    const before = cache([pending, msg('m3'), msg('m2')], [msg('m1')]);
    const patched = patchGap(before, 'm1', [msg('m2')])!;
    expect(oldestFirst(patched).map((m) => m.id)).toContain('m3');
    expect(oldestFirst(patched).some((m) => m.id === 'temp-n9')).toBe(true);
  });

  it('fetch rỗng không đổi gì', () => {
    const before = cache([msg('m2'), msg('m1')]);
    expect(ids(patchGap(before, 'm2', []))).toEqual(ids(before));
  });
});

describe('chaos: đảo thứ tự / rớt gói / nonce trùng', () => {
  it('đảo thứ tự create (m5 đến trước m4) vẫn hiển thị đúng thứ tự', () => {
    const base = cache([msg('m3'), msg('m2')], [msg('m1')]);
    const withM5 = upsertMessage(base, msg('m5'))!;
    const withM4 = upsertMessage(withM5, msg('m4'))!;
    expect(ids(withM4)![0]).toEqual(['m5', 'm4', 'm3', 'm2']);
    expect(oldestFirst(withM4).map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
  });

  it('rớt gói giữa chừng: merge trang-mới-nhất (prune=false) vá lại tin bị mất, không trùng', () => {
    const dropped = upsertMessage(
      upsertMessage(cache([msg('m2'), msg('m1')]), msg('m4'))!,
      msg('m5'),
    )!;
    expect(oldestFirst(dropped).map((m) => m.id)).toEqual(['m1', 'm2', 'm4', 'm5']);
    const newestAsc = [msg('m1'), msg('m2'), msg('m3'), msg('m4'), msg('m5')];
    const healed = patchGap(dropped, 'm5', newestAsc, { prune: false })!;
    expect(oldestFirst(healed).map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
  });

  it('patchGap prune=false KHÔNG bỏ tin trong khoảng fetch mà server không trả', () => {
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

  it('aroundWindow: cache là MỘT trang quanh tin đích, giữ hasNewer + cursor tải tin cũ', () => {
    const data = aroundWindow(
      { messages: [msg('m6'), msg('m5'), msg('m4')], hasMore: true, hasNewer: true },
      'm4',
    );
    expect(data.pages).toHaveLength(1);
    expect(data.pageParams).toEqual([undefined]);
    expect(data.window).toEqual({ aroundId: 'm4', hasNewer: true });
    expect(oldestFirst(data).map((m) => m.id)).toEqual(['m4', 'm5', 'm6']);
    expect(data.pages.at(-1)?.messages.at(-1)?.id).toBe('m4');
  });

  it('prependNewer: đảo trang after (tăng dần) thành mới→cũ và chèn lên đầu, cập nhật hasNewer', () => {
    const windowed = aroundWindow(
      { messages: [msg('m6'), msg('m5'), msg('m4')], hasMore: true, hasNewer: true },
      'm4',
    );
    const more = prependNewer(windowed, {
      messages: [msg('m7'), msg('m8')],
      hasMore: false,
    })!;
    expect(oldestFirst(more).map((m) => m.id)).toEqual(['m4', 'm5', 'm6', 'm7', 'm8']);
    expect(more.window).toEqual({ aroundId: 'm4', hasNewer: false });
  });

  it('prependNewer: cache không phải cửa sổ permalink thì trả nguyên (không phá luồng thường)', () => {
    const normal = cache([msg('m2'), msg('m1')]);
    expect(prependNewer(normal, { messages: [msg('m3')], hasMore: false })).toBe(normal);
  });

  it('preserveLocalMessages: giữ `window` khi fetchNextPage dựng lại {pages, pageParams}', () => {
    const windowed = aroundWindow(
      { messages: [msg('m6'), msg('m5'), msg('m4')], hasMore: true, hasNewer: true },
      'm4',
    );
    const fetchedOlder: MessagesCache = {
      pages: [windowed.pages[0]!, { messages: [msg('m3')], hasMore: true }],
      pageParams: [undefined, 'm4'],
    };
    const kept = preserveLocalMessages(windowed, fetchedOlder);
    expect(kept.window).toEqual({ aroundId: 'm4', hasNewer: true });
    expect(kept.pages).toHaveLength(2);
    const replaced = preserveLocalMessages(
      windowed,
      aroundWindow({ messages: [msg('m9')], hasMore: true, hasNewer: false }, 'm9'),
    );
    expect(replaced.window).toEqual({ aroundId: 'm9', hasNewer: false });
    expect(preserveLocalMessages(undefined, fetchedOlder).window).toBeUndefined();
  });
});
