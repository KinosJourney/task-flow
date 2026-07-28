import { z } from 'zod';
import { id, isoDate } from './common';

export const todayListInput = z.object({ date: isoDate }).strict();

export const todayTaskDateInput = z
  .object({
    taskId: id,
    date: isoDate,
  })
  .strict();

export const todayBacklogInput = z.object({ before: isoDate }).strict();

export const todayCarryOverInput = z
  .object({
    date: isoDate,
    taskIds: z.array(id).optional(),
  })
  .strict();

export const todayReorderInput = z
  .object({
    date: isoDate,
    orderedIds: z.array(id),
  })
  .strict();

/** `date` 是移出的那天；`toDate` 省略则推迟到今天（用户点推迟时通常在回看某天） */
export const todayPostponeInput = z
  .object({
    taskId: id,
    date: isoDate,
    toDate: isoDate.optional(),
  })
  .strict();

export const todayAbandonInput = z
  .object({
    taskId: id,
    date: isoDate,
  })
  .strict();

export const todaySplitInput = z
  .object({
    taskId: id,
    childrenTitles: z.array(z.string().min(1).max(500)).min(1).max(20),
    date: isoDate.optional(),
  })
  .strict();
