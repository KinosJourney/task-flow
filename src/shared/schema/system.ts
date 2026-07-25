import { z } from 'zod';

export const pingInput = z
  .object({ message: z.string().max(200).optional() })
  .optional();

export const emptyInput = z.union([z.undefined(), z.object({}).strict()]);

export type PingInput = z.infer<typeof pingInput>;
