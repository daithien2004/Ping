export interface EventBus {
  publish(stream: string, payload: unknown): Promise<string>;
}
