import { z } from 'zod';

export const joinServerSchema = z.object({
  inviteCode: z.string().trim().min(1).max(64),
});
export type JoinServerInput = z.infer<typeof joinServerSchema>;
