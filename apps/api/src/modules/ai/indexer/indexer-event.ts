export interface IndexerCall {
  type: string;
  messageId: string;
}

/** Vòng lặp tiêu thụ outbox, dù đi qua Redis Stream hay Kafka. */
export interface IndexerLoop {
  start(): void;
  stop(): Promise<void>;
}

function messageIdOf(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const payload = JSON.parse(raw) as { id?: unknown };
    return typeof payload.id === 'string' ? payload.id : undefined;
  } catch {
    return undefined;
  }
}

/** Chỉ event `message.*` có `payload.id` mới cần index; còn lại trả `undefined` và được bỏ qua (và ack/commit). */
export function indexerCallOf(
  type: string | undefined,
  payload: string | undefined,
): IndexerCall | undefined {
  if (!type || !type.startsWith('message.')) return undefined;
  const messageId = messageIdOf(payload);
  return messageId ? { type, messageId } : undefined;
}
