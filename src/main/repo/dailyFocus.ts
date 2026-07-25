import { asc, eq, inArray } from 'drizzle-orm';
import type { DailyFocus } from '@shared/types';
import { getDb } from '../db/connection';
import { dailyFocus, dailyFocusTasks, projects, tasks } from '../db/schema';
import { AppError } from '../errors';
import { newId, type DbLike } from './db';

type FocusRow = typeof dailyFocus.$inferSelect;

function getRow(id: string, db: DbLike = getDb()): FocusRow {
  const row = db.select().from(dailyFocus).where(eq(dailyFocus.id, id)).get();
  if (!row) throw new AppError('NOT_FOUND', '这件事还没填写');
  return row;
}

function taskIdsOf(focusId: string, db: DbLike): string[] {
  return db
    .select()
    .from(dailyFocusTasks)
    .where(eq(dailyFocusTasks.focusId, focusId))
    .all()
    .map((row) => row.taskId);
}

function toDailyFocus(row: FocusRow, db: DbLike): DailyFocus {
  return {
    id: row.id,
    date: row.date,
    slot: row.slot,
    content: row.content ?? undefined,
    projectId: row.projectId ?? undefined,
    isDone: row.isDone,
    taskIds: taskIdsOf(row.id, db),
  };
}

/**
 * 某天的三件事。不存在就是空槽，返回空数组而不是 NOT_FOUND——
 * 新的一天本来就是空白（验收标准 3），历史日期同样可看可补写。
 */
export function listFocusByDate(date: string, db: DbLike = getDb()): DailyFocus[] {
  return db
    .select()
    .from(dailyFocus)
    .where(eq(dailyFocus.date, date))
    .orderBy(asc(dailyFocus.slot))
    .all()
    .map((row) => toDailyFocus(row, db));
}

/** 按 date + slot upsert。内容清空时一并回到未完成，免得空槽还留着勾 */
export function setFocus(input: {
  date: string;
  slot: number;
  content?: string;
  projectId?: string;
}): DailyFocus {
  return getDb().transaction((tx) => {
    if (input.projectId && !tx.select().from(projects).where(eq(projects.id, input.projectId)).get()) {
      throw new AppError('NOT_FOUND', '项目不存在');
    }

    const content = input.content?.trim() || null;
    const now = Date.now();
    const existing = tx
      .select()
      .from(dailyFocus)
      .where(eq(dailyFocus.date, input.date))
      .all()
      .find((row) => row.slot === input.slot);

    if (existing) {
      const patch: Partial<FocusRow> = { content, updatedAt: now };
      if (input.projectId !== undefined) patch.projectId = input.projectId;
      if (!content) patch.isDone = false;
      tx.update(dailyFocus).set(patch).where(eq(dailyFocus.id, existing.id)).run();
      return toDailyFocus(getRow(existing.id, tx), tx);
    }

    const row: FocusRow = {
      id: newId('f'),
      date: input.date,
      slot: input.slot,
      content,
      projectId: input.projectId ?? null,
      isDone: false,
      createdAt: now,
      updatedAt: now,
    };
    tx.insert(dailyFocus).values(row).run();
    return toDailyFocus(row, tx);
  });
}

/** 关联任务是覆盖式的：传进来的这批就是最终结果，没传的解除关联 */
export function linkFocusTasks(input: { focusId: string; taskIds: string[] }): void {
  getDb().transaction((tx) => {
    getRow(input.focusId, tx);
    const unique = [...new Set(input.taskIds)];
    if (unique.length > 0) {
      const found = tx.select().from(tasks).where(inArray(tasks.id, unique)).all();
      if (found.length !== unique.length) throw new AppError('NOT_FOUND', '有任务已经不在了');
    }

    tx.delete(dailyFocusTasks).where(eq(dailyFocusTasks.focusId, input.focusId)).run();
    for (const taskId of unique) {
      tx.insert(dailyFocusTasks).values({ focusId: input.focusId, taskId }).run();
    }
  });
}

export function toggleFocusDone(input: { focusId: string; isDone: boolean }): DailyFocus {
  const db = getDb();
  const row = getRow(input.focusId, db);
  db.update(dailyFocus)
    .set({ isDone: input.isDone, updatedAt: Date.now() })
    .where(eq(dailyFocus.id, row.id))
    .run();
  return toDailyFocus(getRow(row.id, db), db);
}

/**
 * 某天「任务 -> 它关联的三件事槽位」。Next Task 的 focus_linked 规则和
 * 任务详情的 `linkedFocusSlot` 都读它，所以一次查完做成 Map。
 * 一个任务关联到多个槽时取靠前的那个槽——它更靠前就更重要。
 */
export function focusSlotByTask(date: string, db: DbLike = getDb()): Map<string, number> {
  const rows = db.select().from(dailyFocus).where(eq(dailyFocus.date, date)).all();
  const slotOf = new Map<string, number>();
  for (const row of rows.sort((a, b) => a.slot - b.slot)) {
    for (const taskId of taskIdsOf(row.id, db)) {
      if (!slotOf.has(taskId)) slotOf.set(taskId, row.slot);
    }
  }
  return slotOf;
}
