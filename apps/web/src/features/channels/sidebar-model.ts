import type { ChannelCategoryDto, ChannelDto, MoveChannelInput } from '@ping/shared';
import { rankBetween } from '@ping/shared';

/**
 * TG.10: phép biến đổi thuần trên dữ liệu sidebar (nhóm theo category, tính payload kéo thả
 * và bàn phím) — hooks ghi cache qua những hàm này, test ở `sidebar-model.test.ts`.
 *
 * Thứ tự hiển thị: các category theo `position` (lexorank so sánh chuỗi), vùng mặc định
 * (channel không categoryId) LUÔN CUỐI với header "Kênh". Trong category sắp theo
 * `positionKey`; trong vùng mặc định sắp theo `position` Int (hợp đồng TG.10).
 */

export interface SidebarGroup {
  /** null = vùng mặc định ngoài category (header "Kênh", không xóa được, luôn cuối). */
  categoryId: string | null;
  name: string;
  channels: ChannelDto[];
}

export function sortCategories(categories: ChannelCategoryDto[]): ChannelCategoryDto[] {
  return [...categories].sort(
    (a, b) => a.position.localeCompare(b.position) || a.id.localeCompare(b.id),
  );
}

/** Channel trong một category: sắp theo positionKey (lexorank); thiếu key thì theo id cho ổn định. */
function sortCategoryChannels(channels: ChannelDto[]): ChannelDto[] {
  return [...channels].sort(
    (a, b) => (a.positionKey ?? '').localeCompare(b.positionKey ?? '') || a.id.localeCompare(b.id),
  );
}

/** Channel trong vùng mặc định: sắp theo position Int như hợp đồng cũ. */
function sortDefaultChannels(channels: ChannelDto[]): ChannelDto[] {
  return [...channels].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

/** Nhóm channel theo categoryId để render sidebar; category theo thứ tự, mặc định cuối. */
export function groupChannels(
  channels: ChannelDto[],
  categories: ChannelCategoryDto[],
  defaultGroupName: string,
): SidebarGroup[] {
  const groups: SidebarGroup[] = sortCategories(categories).map((category) => ({
    categoryId: category.id,
    name: category.name,
    channels: sortCategoryChannels(channels.filter((item) => item.categoryId === category.id)),
  }));
  const ungrouped = sortDefaultChannels(channels.filter((item) => item.categoryId === null));
  // Vùng mặc định luôn render: header "Kênh" hiện cả khi trống (plan TG.10).
  groups.push({ categoryId: null, name: defaultGroupName, channels: ungrouped });
  return groups;
}

/** Kế hoạch di chuyển một channel: gọi PUT /move (có/không positionKey) hoặc PATCH position hàng loạt. */
export type ChannelMovePlan =
  | { kind: 'move'; input: MoveChannelInput }
  /** Chỉ dùng cho đổi thứ tự TRONG vùng mặc định: PATCH `position` cho các kênh đổi chỗ. */
  | { kind: 'positions'; updates: Array<{ channelId: string; position: number }> };

/**
 * Tính payload di chuyển `channelId` tới `targetCategoryId` tại chỉ số `targetIndex` (trong
 * danh sách channel của nhóm đích SAU KHI bỏ chính nó ra). Kẹt lexorank (rankBetween trả
 * null) → bỏ positionKey để server chèn cuối rồi phát event đính chính (hợp đồng TG.10).
 * Trả null khi không tìm thấy channel.
 */
export function planChannelMove(
  channels: ChannelDto[],
  channelId: string,
  targetCategoryId: string | null,
  targetIndex: number,
): ChannelMovePlan | null {
  const channel = channels.find((item) => item.id === channelId);
  if (!channel) return null;

  if (targetCategoryId === null && channel.categoryId === null) {
    // Đổi chỗ trong vùng mặc định: hợp đồng không có positionKey cho vùng này — dùng PATCH position.
    const rest = sortDefaultChannels(channels.filter((item) => item.categoryId === null));
    const from = rest.findIndex((item) => item.id === channelId);
    rest.splice(from, 1);
    const index = Math.max(0, Math.min(targetIndex, rest.length));
    rest.splice(index, 0, channel);
    const before = new Map(
      sortDefaultChannels(channels.filter((item) => item.categoryId === null)).map((item) => [
        item.id,
        item.position,
      ]),
    );
    const updates = rest
      .map((item, position) => ({ channelId: item.id, position }))
      .filter((update) => before.get(update.channelId) !== update.position);
    return updates.length > 0 ? { kind: 'positions', updates } : null;
  }

  // Vào category (hoặc rời category về vùng mặc định): PUT /move, chèn CUỐI nếu không gửi key.
  // Vùng mặc định sắp theo position Int nên KHÔNG gửi positionKey (hợp đồng: null ngoài category).
  if (targetCategoryId === null) {
    return { kind: 'move', input: { categoryId: null } };
  }
  const target = sortCategoryChannels(
    channels.filter((item) => item.categoryId === targetCategoryId && item.id !== channelId),
  );
  const index = Math.max(0, Math.min(targetIndex, target.length));
  const positionKey = rankBetween(
    target[index - 1]?.positionKey ?? undefined,
    target[index]?.positionKey ?? undefined,
  );
  return {
    kind: 'move',
    input: positionKey
      ? { categoryId: targetCategoryId, positionKey }
      : { categoryId: targetCategoryId },
  };
}

/**
 * Ghi kết quả một lần di chuyển vào cache danh sách channel (optimistic + event realtime):
 * đặt `categoryId`/`positionKey` mới cho channel rồi nhóm lại theo đúng thứ tự hiển thị.
 * `positionKey` null → chèn cuối nhóm đích (khớp hành vi server khi client không gửi key).
 */
export function applyChannelMove(
  channels: ChannelDto[],
  channelId: string,
  targetCategoryId: string | null,
  positionKey: string | null,
): ChannelDto[] {
  const moved = channels.find((item) => item.id === channelId);
  if (!moved) return channels;
  // Vào vùng mặc định mà server chèn cuối: position = max + 1 để sort mặc định đúng "cuối".
  const maxPosition = channels
    .filter((item) => item.categoryId === null)
    .reduce((max, item) => Math.max(max, item.position), -1);
  const updated: ChannelDto = {
    ...moved,
    categoryId: targetCategoryId,
    positionKey,
    position: targetCategoryId === null ? maxPosition + 1 : moved.position,
  };
  const rest = channels.filter((item) => item.id !== channelId);
  return [...rest, updated];
}

/**
 * Áp dụng PATCH position (đổi chỗ trong vùng mặc định) vào cache: chỉ các kênh trong
 * `updates` đổi `position`, phần còn lại nguyên vẹn.
 */
export function applyPositionUpdates(
  channels: ChannelDto[],
  updates: Array<{ channelId: string; position: number }>,
): ChannelDto[] {
  const positions = new Map(updates.map((update) => [update.channelId, update.position]));
  return channels.map((channel) =>
    positions.has(channel.id) ? { ...channel, position: positions.get(channel.id)! } : channel,
  );
}

/**
 * Áp dụng event `channel.reordered` scope 'category': đặt lại thứ tự channel của MỘT nhóm
 * theo `channelIds`. Channel được liệt kê mà đang ở nhóm khác → chuyển vào nhóm đích (kéo
 * sang nhóm mới ở tab khác); channel của nhóm không được liệt kê → giữ lại ở cuối. positionKey
 * được gán lại theo chuỗi `after()` để sort client khớp thứ tự event cho tới khi refetch về
 * key thật của server.
 */
export function applyChannelOrder(
  channels: ChannelDto[],
  categoryId: string | null,
  channelIds: string[],
): ChannelDto[] {
  const rank = new Map(channelIds.map((id, index) => [id, index]));
  const keyOf = new Map<string, string>();
  let current: string | null = null;
  for (const id of channelIds) {
    // Chuỗi liền nhau ('m','n',…) có thể "kẹt" với rankBetween nhưng chỉ sống tới khi
    // refetch về key thật; đủ để giữ đúng thứ tự event khi render.
    if (current === null) current = rankBetween(undefined, undefined);
    else current = afterOrExtend(current);
    if (current) keyOf.set(id, current);
  }
  return channels.map((channel) => {
    const index = rank.get(channel.id);
    if (index === undefined) return channel;
    const base = channel.categoryId === categoryId ? channel : { ...channel, categoryId };
    // Vùng mặc định sắp theo position Int: dùng thẳng thứ tự event; category dùng positionKey.
    return categoryId === null
      ? { ...base, position: index, positionKey: null }
      : { ...base, positionKey: keyOf.get(channel.id) ?? null };
  });
}

/** `after()` nhưng luôn có kết quả: đuôi hết chỗ thì kéo dài chuỗi ('z' → 'zm' → 'zn'…). */
function afterOrExtend(rank: string): string {
  for (let i = rank.length - 1; i >= 0; i -= 1) {
    const code = rank.charCodeAt(i);
    if (code < 122) return rank.slice(0, i) + String.fromCharCode(code + 1);
  }
  return `${rank}m`;
}

/**
 * Áp dụng event `channel.reordered` scope 'categories': `channelIds` mang các **categoryId**
 * còn lại theo thứ tự mới (hợp đồng TG.10). Category mới xuất hiện ở event mà cache chưa có
 * được bỏ qua — refetch chi tiết server sẽ bổ sung.
 */
export function applyCategoryOrder(
  categories: ChannelCategoryDto[],
  orderedIds: string[],
): ChannelCategoryDto[] {
  const rank = new Map(orderedIds.map((id, index) => [id, index]));
  const kept = categories.filter((category) => rank.has(category.id));
  const known = new Set(kept.map((category) => category.id));
  const missing = orderedIds.filter((id) => !known.has(id));
  if (missing.length > 0 || kept.length !== categories.length) return categories;
  // Gán lại position theo chuỗi sau() để sort client khớp event cho tới khi refetch.
  const positions = new Map<string, string>();
  let current: string | null = null;
  for (const id of orderedIds) {
    if (current === null) current = rankBetween(undefined, undefined);
    else current = afterOrExtend(current);
    if (current) positions.set(id, current);
  }
  return sortCategories(
    kept.map((category) => ({
      ...category,
      position: positions.get(category.id) ?? category.position,
    })),
  );
}

/**
 * Đổi chỗ một category với category liền kề (bàn phím Alt+Arrow và nút lên/xuống của admin
 * dùng chung): trả về mảng orderedIds mới cho PUT /categories/reorder, hoặc null khi ở biên.
 */
export function reorderedCategoryIds(
  categories: ChannelCategoryDto[],
  categoryId: string,
  direction: 'up' | 'down',
): string[] | null {
  const ordered = sortCategories(categories).map((category) => category.id);
  const index = ordered.indexOf(categoryId);
  if (index < 0) return null;
  const neighbor = direction === 'up' ? index - 1 : index + 1;
  if (neighbor < 0 || neighbor >= ordered.length) return null;
  [ordered[index], ordered[neighbor]] = [ordered[neighbor]!, ordered[index]!];
  return ordered;
}

/**
 * Kéo thả category tới một chỉ số chèn tùy ý (edge trên/dưới của header đích đã đổi thành
 * chỉ số trong danh sách ĐÃ BỎ chính nó): trả orderedIds mới, hoặc null khi không đổi chỗ.
 */
export function reorderCategoryTo(
  categories: ChannelCategoryDto[],
  categoryId: string,
  insertIndex: number,
): string[] | null {
  const ordered = sortCategories(categories).map((category) => category.id);
  const from = ordered.indexOf(categoryId);
  if (from < 0) return null;
  ordered.splice(from, 1);
  const index = Math.max(0, Math.min(insertIndex, ordered.length));
  if (index === from) return null;
  ordered.splice(index, 0, categoryId);
  return ordered;
}

/**
 * Tính đích di chuyển cho BÀN PHÍM (Alt+ArrowUp/Down) trên nhóm đã sort: channel đứng đầu
 * nhóm đi LÊN thì vào CUỐI nhóm trước, đứng cuối đi XUỐNG thì vào ĐẦU nhóm sau (vùng mặc
 * định là nhóm cuối). Trả null khi đã ở biên danh sách.
 */
export function keyboardChannelMove(
  channels: ChannelDto[],
  categories: ChannelCategoryDto[],
  channelId: string,
  direction: 'up' | 'down',
): { categoryId: string | null; index: number } | null {
  const groups = groupChannels(channels, categories, '');
  const groupIndex = groups.findIndex((group) =>
    group.channels.some((item) => item.id === channelId),
  );
  if (groupIndex < 0) return null;
  const group = groups[groupIndex]!;
  const inGroup = group.channels.findIndex((item) => item.id === channelId);

  if (direction === 'up' && inGroup > 0)
    return { categoryId: group.categoryId, index: inGroup - 1 };
  if (direction === 'down' && inGroup < group.channels.length - 1)
    return { categoryId: group.categoryId, index: inGroup + 1 };

  const neighborIndex = direction === 'up' ? groupIndex - 1 : groupIndex + 1;
  const neighbor = groups[neighborIndex];
  if (!neighbor) return null;
  return direction === 'up'
    ? { categoryId: neighbor.categoryId, index: neighbor.channels.length }
    : { categoryId: neighbor.categoryId, index: 0 };
}
