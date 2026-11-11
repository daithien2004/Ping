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

export const serverIdOf = (scope: ChannelScope): string | null =>
  scope.kind === 'server' ? scope.serverId : null;
