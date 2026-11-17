import { describe, expect, it } from 'vitest';
import { orderingKey } from '../../../infra/events/event-publisher.js';
import { indexerCallOf } from './indexer-event.js';

describe('indexerCallOf', () => {
  it('lấy loại và id tin từ event message.*', () => {
    expect(indexerCallOf('message.created', JSON.stringify({ id: 'm1', x: 1 }))).toEqual({
      type: 'message.created',
      messageId: 'm1',
    });
  });

  it.each([
    ['không phải event tin nhắn', 'channel.created', '{"id":"c1"}'],
    ['thiếu type', undefined, '{"id":"m1"}'],
    ['thiếu payload', 'message.created', undefined],
    ['payload không phải JSON', 'message.created', 'not json'],
    ['payload không có id chuỗi', 'message.created', '{"id":42}'],
  ])('bỏ qua: %s', (_name, type, payload) => {
    expect(indexerCallOf(type, payload)).toBeUndefined();
  });
});

describe('orderingKey', () => {
  const event = (payload: unknown) => ({
    id: 'e1',
    type: 'message.created',
    aggregateType: 'message',
    payload,
  });

  it('dùng id tin để mọi event của một tin cùng partition', () => {
    expect(orderingKey(event({ id: 'm1' }))).toBe('m1');
  });

  it('không có id tin thì dùng id event', () => {
    expect(orderingKey(event({ other: 1 }))).toBe('e1');
    expect(orderingKey(event(null))).toBe('e1');
  });
});
