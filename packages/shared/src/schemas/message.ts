import { z } from 'zod';

export const createMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  // The client reuses this nonce when retrying the same message.
  nonce: z.uuid(),
});
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
