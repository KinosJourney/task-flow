import { z } from 'zod';
import { id, moduleId } from './common';

export const noteKind = z.enum(['note', 'idea', 'question', 'link']);

export const listNotesInput = z.object({ taskId: id }).strict();

export const createNoteInput = z
  .object({
    taskId: id.optional(),
    kind: noteKind,
    content: z.string().min(1).max(20_000),
    url: z.string().max(2000).optional(),
  })
  .strict();

export const updateNoteInput = z
  .object({
    id,
    content: z.string().min(1).max(20_000).optional(),
    url: z.string().max(2000).nullable().optional(),
  })
  .strict();

export const convertNoteInput = z
  .object({ id, projectId: id.optional(), moduleId: moduleId.optional() })
  .strict();

export const quickCaptureInput = z
  .object({ content: z.string().min(1).max(20_000), kind: noteKind.optional() })
  .strict();
