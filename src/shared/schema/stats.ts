import { z } from 'zod';
import { isoDate } from './common';

export const statsTimelineInput = z.object({ date: isoDate }).strict();

export const statsModuleTimeInput = z
  .object({
    from: z.number().int(),
    to: z.number().int(),
  })
  .strict();
