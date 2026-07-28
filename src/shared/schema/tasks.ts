import { z } from 'zod';
import { id, isoDate, moduleId } from './common';

export const taskTreeInput = z.object({ projectId: id }).strict();

export const createTaskInput = z
  .object({
    title: z.string().min(1).max(500),
    description: z.string().max(20_000).optional(),
    projectId: id.optional(),
    parentId: id.optional(),
    moduleId: moduleId.optional(),
    /** 新建时是否直接进今天的队列 */
    inToday: z.boolean().optional(),
  })
  .strict();

export const updateTaskInput = z
  .object({
    id,
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(20_000).nullable().optional(),
    moduleId: moduleId.optional(),
    projectId: id.nullable().optional(),
    dueDate: isoDate.nullable().optional(),
    scheduledAt: z.number().int().nullable().optional(),
  })
  .strict();

export const moveTaskInput = z
  .object({
    id,
    parentId: id.nullable().optional(),
    projectId: id.nullable().optional(),
    position: z.number().int().min(0).optional(),
  })
  .strict();

export const getNextInput = z
  .object({
    now: z.number().int(),
    excludeTaskId: id.optional(),
  })
  .strict();

/** `id: null` 取消手动指定，回到自动推荐 */
export const pinNextInput = z.object({ id: id.nullable() }).strict();
