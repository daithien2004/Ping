import { z } from 'zod';

export const createServerSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type CreateServerInput = z.infer<typeof createServerSchema>;
