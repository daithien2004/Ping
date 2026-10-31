import type { ChannelCategoryDto, ChannelDto } from '@ping/shared';
import { describe, expect, it } from 'vitest';
import {
  applyCategoryOrder,
  applyChannelMove,
  applyChannelOrder,
  applyPositionUpdates,
  groupChannels,
  keyboardChannelMove,
  planChannelMove,
  reorderedCategoryIds,
  reorderCategoryTo,
  sortCategories,
} from './sidebar-model';

function channel(id: string, overrides: Partial<ChannelDto> = {}): ChannelDto {
  return {
    id,
    serverId: 's1',
    name: id,
    type: 'TEXT',
    position: 0,
    categoryId: null,
    positionKey: null,
    topic: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function category(id: string, position: string): ChannelCategoryDto {
  return { id, name: id, position };
}

describe('groupChannels', () => {
  const categories = [category('c2', 'n'), category('c1', 'm')];
  const channels = [
    channel('d1', { position: 1 }),
    channel('d0', { position: 0 }),
    channel('c1-a', { categoryId: 'c1', positionKey: 'm' }),
    channel('c1-b', { categoryId: 'c1', positionKey: 'u' }),
    channel('c2-a', { categoryId: 'c2', positionKey: 'k' }),
  ];

  it('nhóm theo category theo thứ tự position, vùng mặc định luôn cuối', () => {
    const groups = groupChannels(channels, categories, 'Kênh');
    expect(groups.map((group) => group.categoryId)).toEqual(['c1', 'c2', null]);
    expect(groups.map((group) => group.name)).toEqual(['c1', 'c2', 'Kênh']);
    expect(groups[0]!.channels.map((item) => item.id)).toEqual(['c1-a', 'c1-b']);
    expect(groups[2]!.channels.map((item) => item.id)).toEqual(['d0', 'd1']);
  });

  it('vùng mặc định hiện cả khi trống (header "Kênh" không biến mất)', () => {
    const groups = groupChannels([], categories, 'Kênh');
    expect(groups).toHaveLength(3);
    expect(groups[2]!.categoryId).toBeNull();
    expect(groups[2]!.channels).toEqual([]);
  });

  it('sortCategories so sánh position kiểu chuỗi (lexorank: "m" < "ma")', () => {
    expect(sortCategories([category('b', 'ma'), category('a', 'm')]).map((c) => c.id)).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('planChannelMove', () => {
  const channels = [
    channel('a', { categoryId: 'c1', positionKey: 'm' }),
    channel('b', { categoryId: 'c1', positionKey: 'u' }),
    channel('c', { categoryId: 'c1', positionKey: 'zg' }),
    channel('d0', { position: 0 }),
    channel('d1', { position: 1 }),
  ];

  it('chèn giữa hai kênh: positionKey = rankBetween(hàng xóm trên, dưới)', () => {
    const plan = planChannelMove(channels, 'c', 'c1', 1);
    expect(plan).toEqual({ kind: 'move', input: { categoryId: 'c1', positionKey: 'q' } });
  });

  it('chèn đầu nhóm: chỉ dùng hàng xóm dưới', () => {
    const plan = planChannelMove(channels, 'c', 'c1', 0);
    expect(plan).toEqual({ kind: 'move', input: { categoryId: 'c1', positionKey: 'lm' } });
  });

  it('vào nhóm rỗng: firstRank "m"', () => {
    const plan = planChannelMove(channels, 'a', 'c2', 0);
    expect(plan).toEqual({ kind: 'move', input: { categoryId: 'c2', positionKey: 'm' } });
  });

  it('kẹt lexorank (rankBetween null) → bỏ positionKey để server chèn cuối', () => {
    const tight = [
      channel('a', { categoryId: 'c1', positionKey: 'ab' }),
      channel('b', { categoryId: 'c1', positionKey: 'aba' }),
      channel('c', { categoryId: 'c2', positionKey: 'm' }),
    ];
    // Chèn 'c' GIỮA 'a' và 'b': hai mốc sát nhau không còn khoảng.
    const plan = planChannelMove(tight, 'c', 'c1', 1);
    expect(plan).toEqual({ kind: 'move', input: { categoryId: 'c1' } });
  });

  it('rời category về vùng mặc định: move không positionKey (vùng mặc định sắp theo position)', () => {
    const plan = planChannelMove(channels, 'a', null, 0);
    expect(plan).toEqual({ kind: 'move', input: { categoryId: null } });
  });

  it('đổi chỗ trong vùng mặc định: PATCH position cho các kênh đổi chỗ', () => {
    const plan = planChannelMove(channels, 'd1', null, 0);
    expect(plan).toEqual({
      kind: 'positions',
      updates: [
        { channelId: 'd1', position: 0 },
        { channelId: 'd0', position: 1 },
      ],
    });
  });

  it('không thấy channel → null (no-op)', () => {
    expect(planChannelMove(channels, 'missing', 'c1', 0)).toBeNull();
  });
});

describe('applyChannelMove / applyPositionUpdates', () => {
  it('gán category + positionKey mới cho channel được di chuyển', () => {
    const channels = [
      channel('a', { position: 0 }),
      channel('b', { position: 1 }),
      channel('c', { categoryId: 'c1', positionKey: 'm' }),
    ];
    const next = applyChannelMove(channels, 'b', 'c1', 'u');
    const moved = next.find((item) => item.id === 'b');
    expect(moved).toMatchObject({ categoryId: 'c1', positionKey: 'u' });
  });

  it('vào vùng mặc định: position = max + 1 (server chèn cuối)', () => {
    const channels = [
      channel('a', { position: 3 }),
      channel('b', { categoryId: 'c1', positionKey: 'm' }),
    ];
    const moved = applyChannelMove(channels, 'b', null, null).find((item) => item.id === 'b');
    expect(moved).toMatchObject({ categoryId: null, position: 4, positionKey: null });
  });

  it('applyPositionUpdates chỉ đụng kênh được liệt kê', () => {
    const channels = [channel('a', { position: 0 }), channel('b', { position: 1 })];
    const next = applyPositionUpdates(channels, [{ channelId: 'a', position: 5 }]);
    expect(next.map((item) => item.position)).toEqual([5, 1]);
  });
});

describe('applyChannelOrder (event realtime)', () => {
  it('đặt lại thứ tự kênh trong nhóm theo channelIds', () => {
    const channels = [
      channel('a', { categoryId: 'c1', positionKey: 'm' }),
      channel('b', { categoryId: 'c1', positionKey: 'u' }),
      channel('c', { categoryId: 'c1', positionKey: 'zg' }),
    ];
    const next = applyChannelOrder(channels, 'c1', ['c', 'a', 'b']);
    const keyOf = (id: string) => next.find((item) => item.id === id)!.positionKey;
    expect([keyOf('c'), keyOf('a'), keyOf('b')]).toEqual(['m', 'n', 'o']);
  });

  it('kênh được liệt kê mà đang ở nhóm khác → chuyển vào nhóm đích (kéo ở tab khác)', () => {
    const channels = [
      channel('a', { categoryId: 'c1', positionKey: 'm' }),
      channel('b', { position: 2, positionKey: null }),
    ];
    const next = applyChannelOrder(channels, 'c1', ['a', 'b']);
    const moved = next.find((item) => item.id === 'b');
    expect(moved).toMatchObject({ categoryId: 'c1', positionKey: 'n' });
  });

  it('kênh vào vùng mặc định qua event: position nối theo thứ tự event', () => {
    const channels = [
      channel('a', { position: 0 }),
      channel('b', { categoryId: 'c1', positionKey: 'm' }),
    ];
    const next = applyChannelOrder(channels, null, ['a', 'b']);
    expect(next.find((item) => item.id === 'a')).toMatchObject({
      categoryId: null,
      position: 0,
    });
    expect(next.find((item) => item.id === 'b')).toMatchObject({
      categoryId: null,
      position: 1,
      positionKey: null,
    });
  });

  it('scope categories: chỉ đổi thứ tự category đã biết; id lạ → nguyên cache chờ refetch', () => {
    const categories = [category('c1', 'm'), category('c2', 'u')];
    expect(applyCategoryOrder(categories, ['c2', 'c1']).map((c) => c.id)).toEqual(['c2', 'c1']);
    expect(applyCategoryOrder(categories, ['c2', 'cX'])).toEqual(categories);
  });
});

describe('reorderedCategoryIds', () => {
  const categories = [category('c1', 'm'), category('c2', 'u'), category('c3', 'y')];

  it('đổi chỗ với láng giềng và trả mảng id đủ', () => {
    expect(reorderedCategoryIds(categories, 'c2', 'up')).toEqual(['c2', 'c1', 'c3']);
    expect(reorderedCategoryIds(categories, 'c2', 'down')).toEqual(['c1', 'c3', 'c2']);
  });

  it('ở biên thì null', () => {
    expect(reorderedCategoryIds(categories, 'c1', 'up')).toBeNull();
    expect(reorderedCategoryIds(categories, 'c3', 'down')).toBeNull();
  });

  it('reorderCategoryTo: chèn tùy ý cho kéo thả, không đổi chỗ thì null', () => {
    expect(reorderCategoryTo(categories, 'c3', 0)).toEqual(['c3', 'c1', 'c2']);
    expect(reorderCategoryTo(categories, 'c1', 2)).toEqual(['c2', 'c3', 'c1']);
    expect(reorderCategoryTo(categories, 'c2', 1)).toBeNull(); // về đúng chỗ cũ
    expect(reorderCategoryTo(categories, 'missing', 0)).toBeNull();
  });
});

describe('keyboardChannelMove', () => {
  const categories = [category('c1', 'm')];
  const channels = [
    channel('g1', { position: 0 }),
    channel('g2', { position: 1 }),
    channel('a', { categoryId: 'c1', positionKey: 'm' }),
    channel('b', { categoryId: 'c1', positionKey: 'u' }),
  ];

  it('lên/xuống trong cùng nhóm', () => {
    expect(keyboardChannelMove(channels, categories, 'b', 'up')).toEqual({
      categoryId: 'c1',
      index: 0,
    });
    expect(keyboardChannelMove(channels, categories, 'a', 'down')).toEqual({
      categoryId: 'c1',
      index: 1,
    });
  });

  it('đầu nhóm đầu tiên đi lên → null (biên)', () => {
    expect(keyboardChannelMove(channels, categories, 'a', 'up')).toBeNull();
  });

  it('cuối nhóm đi xuống → ĐẦU nhóm sau (vùng mặc định là nhóm cuối)', () => {
    expect(keyboardChannelMove(channels, categories, 'b', 'down')).toEqual({
      categoryId: null,
      index: 0,
    });
  });

  it('đầu vùng mặc định đi lên → CUỐI nhóm category trước đó', () => {
    expect(keyboardChannelMove(channels, categories, 'g1', 'up')).toEqual({
      categoryId: 'c1',
      index: 2,
    });
  });

  it('cuối vùng mặc định đi xuống → null (biên)', () => {
    expect(keyboardChannelMove(channels, categories, 'g2', 'down')).toBeNull();
  });
});
