import { z } from 'zod';
import { id, moduleId } from './common';

export const listProjectsInput = z
  .object({ status: z.enum(['active', 'archived']).optional() })
  .strict()
  .optional();

export const createProjectInput = z
  .object({
    name: z.string().min(1).max(200),
    goal: z.string().max(2000).optional(),
    defaultModuleId: moduleId,
    notes: z.string().max(20_000).optional(),
  })
  .strict();

/** null 清空、undefined 不动，两者含义不同，所以用 nullable + optional 而不是二选一 */
export const updateProjectInput = z
  .object({
    id,
    name: z.string().min(1).max(200).optional(),
    goal: z.string().max(2000).nullable().optional(),
    defaultModuleId: moduleId.optional(),
    nextActionTaskId: id.nullable().optional(),
    notes: z.string().max(20_000).nullable().optional(),
    status: z.enum(['active', 'archived']).optional(),
  })
  .strict();

export const reorderProjectsInput = z.object({ orderedIds: z.array(id) }).strict();
