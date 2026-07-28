import { asc, eq } from 'drizzle-orm';
import { todayIso } from '@shared/date';
import type { ModuleId, Task, TodayBacklog, TodayQueueGroup } from '@shared/types';
import { getDb } from '../db/connection';
import { projects, tasks } from '../db/schema';
import {
  buildBacklog,
  buildTodayQueue,
  type QueueProject,
} from '../domain/todayQueue';
import { AppError } from '../errors';
import type { DbLike } from './db';
import { allEntries, dequeue, enqueue, setSortOrders } from './queueRows';
import { recordTaskEvent } from './taskEvents';
import { createDetailResolver, createTask, listQueueTasks } from './tasks';

function queueProjects(db: DbLike = getDb()): QueueProject[] {
  return db
    .select()
    .from(projects)
    .orderBy(asc(projects.sortOrder))
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      defaultModuleId: row.defaultModuleId as ModuleId,
    }));
}

function requireTask(taskId: string, db: DbLike = getDb()): void {
  if (!db.select().from(tasks).where(eq(tasks.id, taskId)).get()) {
    throw new AppError('NOT_FOUND', '任务不存在');
  }
}

/** 某天的队列画面，分组与排序规则见 domain/todayQueue */
export function listTodayQueue(date: string): TodayQueueGroup[] {
  const db = getDb();
  return buildTodayQueue({
    date,
    tasks: listQueueTasks(db),
    entries: allEntries(db),
    projects: queueProjects(db),
    detailOf: createDetailResolver(date, db),
  });
}

export function addToToday(taskId: string, date: string): void {
  getDb().transaction((tx) => {
    requireTask(taskId, tx);
    if (enqueue(taskId, date, tx)) {
      recordTaskEvent(taskId, 'added_to_today', { date }, tx);
    }
  });
}

export function removeFromToday(taskId: string, date: string): void {
  getDb().transaction((tx) => {
    requireTask(taskId, tx);
    dequeue(taskId, date, tx);
    recordTaskEvent(taskId, 'removed_from_today', { date }, tx);
  });
}

/** `before` 之前还没做完的遗留项，供首页的顺延提示条 */
export function getBacklog(before: string): TodayBacklog {
  const db = getDb();
  return buildBacklog({
    before,
    tasks: listQueueTasks(db),
    entries: allEntries(db),
    detailOf: createDetailResolver(before, db),
  });
}

/**
 * 一键顺延（验收标准 1）。顺延是往 `date` 那天 INSERT 行，原来那天的行**保持不动**，
 * 所以「当天完成的、当天有进展的都留在当日」仍然成立，用户也不用重抄任何文字。
 * 省略 `taskIds` 表示把全部遗留一次带过来。
 */
export function carryOver(input: { date: string; taskIds?: string[] }): { carriedCount: number } {
  const backlog = getBacklog(input.date);
  const wanted = input.taskIds
    ? backlog.items.filter((item) => input.taskIds!.includes(item.id))
    : backlog.items;

  // 点名顺延但有的已经不在遗留清单里（被别处完成或已顺延过）：如实报错而不是静默少搬
  if (input.taskIds && wanted.length !== new Set(input.taskIds).size) {
    throw new AppError('NOT_FOUND', '有任务已经不在遗留清单里了');
  }

  return getDb().transaction((tx) => {
    let carriedCount = 0;
    for (const item of wanted) {
      if (enqueue(item.id, input.date, tx)) {
        recordTaskEvent(item.id, 'added_to_today', { date: input.date, carriedOver: true }, tx);
        carriedCount++;
      }
    }
    return { carriedCount };
  });
}

export function reorderToday(input: { date: string; orderedIds: string[] }): void {
  getDb().transaction((tx) => {
    setSortOrders(input.date, input.orderedIds, tx);
  });
}

/**
 * 推迟到指定日期：从 `date` 那天移出，插到目标那天。默认明天。
 * 这是日终处理里唯一会「搬走」原来那行的操作——用户明确说了那天不做。
 */
export function postponeTask(input: { taskId: string; date: string; toDate?: string }): void {
  const toDate = input.toDate ?? todayIso();
  getDb().transaction((tx) => {
    requireTask(input.taskId, tx);
    dequeue(input.taskId, input.date, tx);
    enqueue(input.taskId, toDate, tx);
    recordTaskEvent(input.taskId, 'postponed', { from: input.date, to: toDate }, tx);
  });
}

/** 放回项目任务池：只是移出那天的队列，任务本身还在项目里 */
export function returnToPool(input: { taskId: string; date: string }): void {
  getDb().transaction((tx) => {
    requireTask(input.taskId, tx);
    dequeue(input.taskId, input.date, tx);
    recordTaskEvent(input.taskId, 'returned_to_pool', { date: input.date }, tx);
  });
}

/**
 * 放弃任务：标记完成之外的另一种收尾。任务不删（历史与投入的时间都还在），
 * 从今天起的队列里移出，只留一条事件说明它是被放弃的。
 */
export function abandonTask(input: { taskId: string; date: string }): void {
  getDb().transaction((tx) => {
    requireTask(input.taskId, tx);
    dequeue(input.taskId, input.date, tx);
    recordTaskEvent(input.taskId, 'abandoned', { date: input.date }, tx);
  });
}

/**
 * 拆分成子任务：一件事今天做不完，就地拆成几步。子任务继承父任务的项目与模块，
 * 深度校验由 createTask 负责（第四级会被拒），拆出来的第一步直接进当天队列。
 */
export function splitTask(input: { taskId: string; childrenTitles: string[]; date?: string }): Task[] {
  const date = input.date ?? todayIso();
  const titles = input.childrenTitles.map((t) => t.trim()).filter(Boolean);
  if (titles.length === 0) throw new AppError('VALIDATION', '至少写一个子任务');

  requireTask(input.taskId);
  const created = titles.map((title) => createTask({ title, parentId: input.taskId }));

  getDb().transaction((tx) => {
    recordTaskEvent(input.taskId, 'split', { childIds: created.map((c) => c.id) }, tx);
    // 父任务留在队列里，子任务作为它的下一层露面，不必逐个入队
    enqueue(input.taskId, date, tx);
  });
  return created;
}
