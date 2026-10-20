import { z } from 'zod';

export const listMessagesQuerySchema = z.object({
  // Cursor: trả các tin CŨ HƠN id này (keyset pagination, không OFFSET).
  before: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
