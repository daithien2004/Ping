import type { Kafka } from 'kafkajs';
import {
  KafkaEventRunner,
  type KafkaEventRunnerOptions,
} from '../../../infra/events/kafka-event-runner.js';
import type { KafkaSettings } from '../../../infra/events/kafka.client.js';
import { indexerCallOf } from './indexer-event.js';
import type { MessageIndexerCore } from './message-indexer.core.js';

export const KAFKA_INDEXER_GROUP = 'ai-indexer';

export type KafkaIndexerOptions = Omit<KafkaEventRunnerOptions, 'groupId'> & { groupId?: string };

/**
 * Indexer AI là một consumer group trên topic outbox. Upsert theo id tin nên xử lý lại không tạo point trùng (at-least-once).
 * Event cùng id tin nằm cùng partition và được một consumer xử lý tuần tự, nên `message.deleted` không chạy trước
 * `message.created` của chính tin đó. Event hỏng đi vào DLQ sau vài lần thử (xem KafkaEventRunner).
 */
export class KafkaIndexerRunner extends KafkaEventRunner {
  constructor(
    kafka: Kafka,
    settings: KafkaSettings,
    core: Pick<MessageIndexerCore, 'handleEvent'>,
    options: KafkaIndexerOptions = {},
  ) {
    super(
      kafka,
      settings,
      async (body) => {
        const call = indexerCallOf(body.type, JSON.stringify(body.payload ?? null));
        if (call) await core.handleEvent(call.type, call.messageId);
      },
      { spanName: 'indexer.handle', ...options, groupId: options.groupId ?? KAFKA_INDEXER_GROUP },
    );
  }
}
