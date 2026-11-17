export interface OutboxMessage {
  id: string;
  type: string;
  aggregateType: string;
  payload: unknown;
}

/** Đường chuyển outbox → consumer. Postgres vẫn là nguồn sự thật; mất đường chuyển thì relay phát lại. */
export interface EventPublisher {
  /** false: relay để event nằm yên, không đốt attempts (xem ADR-0090). */
  readonly isUp: boolean;
  publish(event: OutboxMessage): Promise<void>;
}

export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');

/** Event của tin nhắn mang `payload.id` là id tin; cùng id thì cùng partition nên giữ đúng thứ tự created → updated → deleted. */
export function orderingKey(event: OutboxMessage): string {
  const payload = event.payload as { id?: unknown } | null;
  return typeof payload?.id === 'string' ? payload.id : event.id;
}
