// Tiến trình consumer cho drill kafka-worker-crash: nhận event đầu tiên rồi treo vĩnh viễn (để drill SIGKILL giữa chừng).
import { createKafka, type KafkaSettings } from '../../src/infra/events/kafka.client.js';
import { KafkaIndexerRunner } from '../../src/modules/ai/indexer/kafka-indexer.runner.js';

const settings: KafkaSettings = {
  brokers: [process.env.KAFKA_BROKERS ?? 'localhost:9092'],
  clientId: 'ping-drill-worker',
  topic: process.env.KAFKA_TOPIC!,
  partitions: 1,
};
let first = true;
new KafkaIndexerRunner(
  createKafka(settings),
  settings,
  {
    handleEvent: async (type: string, messageId: string) => {
      if (first) {
        first = false;
        console.log(`STUCK ${type} ${messageId}`);
        await new Promise(() => {});
      }
      console.log(`DONE ${type} ${messageId}`);
    },
  },
  { groupId: process.env.GROUP!, fromBeginning: true },
).start();
