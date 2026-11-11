import type { DmSummary } from '@ping/shared';
import { describe, expect, it } from 'vitest';
import { dmViewState } from './dm-view-state';

const dm = (channelId: string): DmSummary => ({
  channelId,
  partner: { id: 'p', username: 'partner', displayName: 'Partner', avatarUrl: null },
  unreadCount: 0,
  lastReadMessageId: null,
  lastMessageAt: null,
});
const base = { isPending: false, isError: false, dms: [dm('c1')], channelId: 'c1' };

describe('dmViewState', () => {
  it('đang tải', () => {
    expect(dmViewState({ ...base, isPending: true, dms: undefined })).toEqual({ kind: 'loading' });
  });

  it('lỗi tải', () => {
    expect(dmViewState({ ...base, isError: true, dms: undefined })).toEqual({ kind: 'error' });
  });

  it('có hội thoại khớp channel đang mở', () => {
    expect(dmViewState(base)).toEqual({ kind: 'ready', dm: dm('c1') });
  });

  it('tải xong nhưng không có hội thoại nào khớp: không tìm thấy', () => {
    expect(dmViewState({ ...base, channelId: 'khong-co' })).toEqual({ kind: 'notFound' });
    expect(dmViewState({ ...base, dms: [] })).toEqual({ kind: 'notFound' });
  });

  it('hết tải, không lỗi, nhưng chưa có dữ liệu: vẫn là đang tải', () => {
    expect(dmViewState({ ...base, dms: undefined })).toEqual({ kind: 'loading' });
  });
});
