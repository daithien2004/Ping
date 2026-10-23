import { z } from 'zod';

export const createChannelSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type CreateChannelInput = z.infer<typeof createChannelSchema>;

/** PATCH /channels/:id - đổi tên và/hoặc vị trí; phải có ít nhất một trường. */
export const updateChannelSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    position: z.number().int().min(0).max(999).optional(),
  })
  .refine((value) => value.name !== undefined || value.position !== undefined, {
    message: 'Provide at least a name or a position',
  });
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;

export interface ChannelDto {
  id: string;
  serverId: string;
  name: string;
  type: 'TEXT';
  position: number;
  createdAt: string;
}
