/**
 * Kênh đang xem là kênh của server hay một DM, quyết định MỘT lần ở nơi dựng MessagePane.
 * `messagePath` do nơi đó cấp vì chỉ nó biết route. Nơi tạo phải giữ object ổn định (useMemo):
 * hook nhảy tới tin và MessageItem (memo) phụ thuộc vào nó.
 */
export type ChannelScope =
  | { kind: 'server'; serverId: string; messagePath: (messageId: string) => string }
  | {
      kind: 'dm';
      lastReadMessageId: string | null;
      messagePath: (messageId: string) => string;
      onSendError?: (error: unknown) => void;
    };

/**
 * Hai hàm dưới đây dùng `switch` đầy đủ có chủ ý: thêm một loại kênh vào `ChannelScope` sẽ làm chúng
 * không biên dịch được cho tới khi quyết định loại đó thuộc nhánh nào.
 */
export function serverIdOf(scope: ChannelScope): string | null {
  switch (scope.kind) {
    case 'server':
      return scope.serverId;
    case 'dm':
      return null;
  }
}

/** Dùng cho chữ hiển thị khác nhau giữa DM và kênh server (nhãn, lời mở đầu). */
export function isDmScope(scope: ChannelScope): boolean {
  switch (scope.kind) {
    case 'dm':
      return true;
    case 'server':
      return false;
  }
}
