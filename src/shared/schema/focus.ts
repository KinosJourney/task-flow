import { z } from 'zod';
import { id, isoDate } from './common';

export const focusGetDayInput = z.object({ date: isoDate }).strict();

export const focusSetInput = z
  .object({
    date: isoDate,
    slot: z.number().int().min(1).max(3),
    content: z.string().max(2000).optional(),
    projectId: id.optional(),
  })
  .strict();

export const focusLinkTasksInput = z
  .object({
    focusId: id,
    taskIds: z.array(id),
  })
  .strict();

export const focusToggleDoneInput = z
  .object({
    focusId: id,
    isDone: z.boolean(),
  })
  .strict();
