import { z } from 'zod';
import { id, moduleId } from './common';

export const timerStartInput = z
  .object({
    taskId: id.optional(),
    now: z.number().int(),
  })
  .strict();

export const timerStopInput = z.object({ now: z.number().int() }).strict();

export const timerListByTaskInput = z.object({ taskId: id }).strict();

export const timerAddManualInput = z
  .object({
    taskId: id.optional(),
    startedAt: z.number().int(),
    endedAt: z.number().int(),
    moduleId: moduleId.optional(),
    note: z.string().max(2000).optional(),
  })
  .strict();

export const timerUpdateInput = z
  .object({
    id,
    startedAt: z.number().int().optional(),
    endedAt: z.number().int().optional(),
    taskId: id.nullable().optional(),
    moduleId: moduleId.nullable().optional(),
    note: z.string().max(2000).nullable().optional(),
  })
  .strict();

export const timerClassifyInput = z
  .object({
    id,
    taskId: id,
    moduleId: moduleId.optional(),
  })
  .strict();
