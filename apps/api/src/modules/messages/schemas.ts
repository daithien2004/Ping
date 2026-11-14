import { z } from 'zod';

export const listMessagesQuerySchema = z
  .object({
    before: z.uuid().optional(),
    after: z.uuid().optional(),
    around: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine(
    (value) => [value.before, value.after, value.around].filter((v) => v !== undefined).length <= 1,
    { message: 'Provide at most one of before, after, around' },
  );
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
