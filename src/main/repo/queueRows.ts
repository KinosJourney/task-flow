import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/connection';
import { todayEntries } from '../db/schema';
import type { QueueEntry } from '../domain/todayQueue';
import { newId, type DbLike } from './db';

/**
 * `today_entries` 的原子读写，不含业务规则。单独一层是为了让 repo/tasks.ts
 * （要算 `inToday`）和 repo/todayEntries.ts（要算整个队列画面）都能用它，
 * 而这两者之间不必互相依赖。
 */

export function allEntries(db: DbLike = getDb()): QueueEntry[] {
  return db
    .select()
    .from(todayEntries)
    .all()
    .map((row) => ({ date: row.date, taskId: row.taskId, sortOrder: row.sortOrder }));
}

export function queuedTaskIdsOn(date: string, db: DbLike = getDb()): Set<string> {
  return new Set(
    db
      .select()
      .from(todayEntries)
      .where(eq(todayEntries.date, date))
      .all()
      .map((row) => row.taskId),
  );
}

export function isQueuedOn(taskId: string, date: string, db: DbLike = getDb()): boolean {
  return Boolean(
    db
      .select()
      .from(todayEntries)
      .where(and(eq(todayEntries.date, date), eq(todayEntries.taskId, taskId)))
      .get(),
  );
}

/**
 * 在某天队列末尾插一行。已经在那天了就什么都不做，返回 false——
 * `UNIQUE(date, task_id)` 让顺延天然幂等，重复点不会在同一天留下两行。
 */
export function enqueue(taskId: string, date: string, db: DbLike = getDb()): boolean {
  if (isQueuedOn(taskId, date, db)) return false;

  const last = db
    .select()
    .from(todayEntries)
    .where(eq(todayEntries.date, date))
    .all()
    .reduce((max, row) => Math.max(max, row.sortOrder), 0);

  db.insert(todayEntries)
    .values({ id: newId('q'), date, taskId, sortOrder: last + 1, createdAt: Date.now() })
    .run();
  return true;
}

/** 只删那一天的行：别的日期该留的记录留着，队列是按天归属的 */
export function dequeue(taskId: string, date: string, db: DbLike = getDb()): void {
  db.delete(todayEntries)
    .where(and(eq(todayEntries.date, date), eq(todayEntries.taskId, taskId)))
    .run();
}

/** 把某天队列内的顺序重排成 1..n */
export function setSortOrders(date: string, orderedIds: string[], db: DbLike = getDb()): void {
  orderedIds.forEach((taskId, index) => {
    db.update(todayEntries)
      .set({ sortOrder: index + 1 })
      .where(and(eq(todayEntries.date, date), eq(todayEntries.taskId, taskId)))
      .run();
  });
}
