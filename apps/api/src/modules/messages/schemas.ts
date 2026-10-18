import { z } from 'zod';

export const updateMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;

export const listMessagesQuerySchema = z.object({
  // Cursor: trả các tin CŨ HƠN id này (keyset pagination, không OFFSET).
  before: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
