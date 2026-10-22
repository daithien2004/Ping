/** Port phát sự kiện (ADR-0033/T1.3): không phụ thuộc Redis Streams cụ thể. */
export interface EventBus {
  publish(stream: string, payload: unknown): Promise<string>;
}
