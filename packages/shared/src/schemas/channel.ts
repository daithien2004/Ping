import { z } from 'zod';

export const createChannelSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type CreateChannelInput = z.infer<typeof createChannelSchema>;
