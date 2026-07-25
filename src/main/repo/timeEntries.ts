import { asc, eq, inArray, isNull } from 'drizzle-orm';
import type { ModuleId, TimeEntry } from '@shared/types';
import { getDb } from '../db/connection';
import { tasks, timeEntries } from '../db/schema';
import { AppError } from '../errors';
import { totalsByKey, totalsByKeyOnDate, type Interval } from '../domain/time';
import { newId, type DbLike } from './db';

type TimeEntryRow = typeof timeEntries.$inferSelect;

function toTimeEntry(row: TimeEntryRow): TimeEntry {
  return {
    id: row.id,
    taskId: row.taskId ?? undefined,
    moduleId: (row.moduleId as ModuleId | null) ?? undefined,
    startedAt: row.startedAt,
    endedAt: row.endedAt ?? undefined,
    source: row.source,
    note: row.note ?? undefined,
  };
}

function allRows(db: DbLike = getDb()): TimeEntryRow[] {
  return db.select().from(timeEntries).all();
}

function getRow(id: string, db: DbLike = getDb()): TimeEntryRow {
  const row = db.select().from(timeEntries).where(eq(timeEntries.id, id)).get();
  if (!row) throw new AppError('NOT_FOUND', '这条计时记录不存在');
  return row;
}

/** 任务的模块快照：记录产生时就固定，任务日后改模块不影响历史统计（data-model 1.2） */
function moduleSnapshotOf(taskId: string, db: DbLike): string {
  const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!task) throw new AppError('NOT_FOUND', '任务不存在');
  return task.moduleId;
}

/** 进行中的段：`ended_at IS NULL`。全表最多一条，由 startTimer 维持 */
export function findActiveEntry(db: DbLike = getDb()): TimeEntry | null {
  const row = db.select().from(timeEntries).where(isNull(timeEntries.endedAt)).get();
  return row ? toTimeEntry(row) : null;
}

/**
 * 开始计时。契约要求全表最多一条进行中的段，所以先把旧段结束掉再开新段——
 * 报 CONFLICT 让用户先手动停会更烦人，而「开始做别的事」本身就意味着上一件停了。
 */
export function startTimer(input: { taskId?: string; now: number }): TimeEntry {
  return getDb().transaction((tx) => {
    tx.update(timeEntries)
      .set({ endedAt: input.now })
      .where(isNull(timeEntries.endedAt))
      .run();

    const row: TimeEntryRow = {
      id: newId('te'),
      taskId: input.taskId ?? null,
      moduleId: input.taskId ? moduleSnapshotOf(input.taskId, tx) : null,
      startedAt: input.now,
      endedAt: null,
      source: 'timer',
      note: null,
      createdAt: Date.now(),
    };
    tx.insert(timeEntries).values(row).run();
    return toTimeEntry(row);
  });
}

/** 结束当前段。没有进行中的段不算错误，返回 null（暂停按钮点重了不该报错） */
export function stopTimer(now: number): TimeEntry | null {
  const db = getDb();
  const running = db.select().from(timeEntries).where(isNull(timeEntries.endedAt)).get();
  if (!running) return null;

  // 时钟回拨或 now 早于开始时刻时按零长度收尾，避免留下倒挂的区间
  const endedAt = Math.max(now, running.startedAt);
  db.update(timeEntries).set({ endedAt }).where(eq(timeEntries.id, running.id)).run();
  return toTimeEntry({ ...running, endedAt });
}

export function listEntriesByTask(taskId: string, db: DbLike = getDb()): TimeEntry[] {
  return db
    .select()
    .from(timeEntries)
    .where(eq(timeEntries.taskId, taskId))
    .orderBy(asc(timeEntries.startedAt))
    .all()
    .map(toTimeEntry);
}

/** 手动补录（验收标准 6）。补录出来的段一律 source=manual，时间轴上用网点区分 */
export function addManualEntry(input: {
  taskId?: string;
  startedAt: number;
  endedAt: number;
  moduleId?: ModuleId;
  note?: string;
}): TimeEntry {
  if (input.endedAt <= input.startedAt) {
    throw new AppError('VALIDATION', '结束时间要晚于开始时间');
  }
  const db = getDb();
  const row: TimeEntryRow = {
    id: newId('te'),
    taskId: input.taskId ?? null,
    moduleId: input.moduleId ?? (input.taskId ? moduleSnapshotOf(input.taskId, db) : null),
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    source: 'manual',
    note: input.note?.trim() || null,
    createdAt: Date.now(),
  };
  db.insert(timeEntries).values(row).run();
  return toTimeEntry(row);
}

/** 改错记录（验收标准 6）。`endedAt: null` 不给改回进行中——那会破坏「最多一条」的约束 */
export function updateEntry(input: {
  id: string;
  startedAt?: number;
  endedAt?: number;
  taskId?: string | null;
  moduleId?: ModuleId | null;
  note?: string | null;
}): TimeEntry {
  const db = getDb();
  const row = getRow(input.id, db);

  const startedAt = input.startedAt ?? row.startedAt;
  const endedAt = input.endedAt ?? row.endedAt;
  if (endedAt !== null && endedAt !== undefined && endedAt <= startedAt) {
    throw new AppError('VALIDATION', '结束时间要晚于开始时间');
  }

  const patch: Partial<TimeEntryRow> = { startedAt, endedAt };
  if (input.taskId !== undefined) {
    patch.taskId = input.taskId;
    // 换了任务就重取模块快照，除非调用方同时明确指定了模块
    if (input.moduleId === undefined) {
      patch.moduleId = input.taskId ? moduleSnapshotOf(input.taskId, db) : null;
    }
  }
  if (input.moduleId !== undefined) patch.moduleId = input.moduleId;
  if (input.note !== undefined) patch.note = input.note?.trim() || null;

  db.update(timeEntries).set(patch).where(eq(timeEntries.id, row.id)).run();
  return toTimeEntry(getRow(row.id, db));
}

export function deleteEntry(id: string): void {
  const db = getDb();
  getRow(id, db);
  db.delete(timeEntries).where(eq(timeEntries.id, id)).run();
}

/** 给「先计时、后归类」的无任务段补上归属 */
export function classifyEntry(input: { id: string; taskId: string; moduleId?: ModuleId }): TimeEntry {
  return updateEntry(input);
}

/**
 * 删任务时把计时记录的 task_id 置空而不是删掉。时间确实投入过，
 * 而且 module_id 是当时的快照，留着历史统计口径才不会因为删任务而变。
 */
export function detachTaskRefs(taskIds: string[], db: DbLike): void {
  if (taskIds.length === 0) return;
  db.update(timeEntries)
    .set({ taskId: null })
    .where(inArray(timeEntries.taskId, taskIds))
    .run();
}

interface TaskInterval extends Interval {
  taskId?: string;
  moduleId?: string;
}

function intervals(db: DbLike = getDb()): TaskInterval[] {
  return allRows(db).map((row) => ({
    taskId: row.taskId ?? undefined,
    moduleId: row.moduleId ?? undefined,
    startedAt: row.startedAt,
    endedAt: row.endedAt ?? undefined,
  }));
}

/**
 * 每个任务的累计时间。一次取全表在内存里汇总：累计时间是派生值不落库
 * （data-model 第 5 节），而列表页要一次拿到几十个任务的时间，
 * 逐个任务查一次库反而更慢。
 */
export function taskTimeTotals(now = Date.now(), db: DbLike = getDb()): Map<string, number> {
  return totalsByKey(intervals(db), (entry) => entry.taskId, now);
}

/** 每个项目的累计时间：把任务的时间按它所属项目归并 */
export function projectTimeTotals(now = Date.now(), db: DbLike = getDb()): Map<string, number> {
  const projectOfTask = new Map(
    db
      .select()
      .from(tasks)
      .all()
      .map((task) => [task.id, task.projectId ?? undefined]),
  );
  return totalsByKey(
    intervals(db),
    (entry) => (entry.taskId ? projectOfTask.get(entry.taskId) : undefined),
    now,
  );
}

/** 某天各模块投入了多少，跨午夜的段只计落在那天的部分 */
export function moduleTimeOnDate(
  date: string,
  now = Date.now(),
  db: DbLike = getDb(),
): { moduleId: ModuleId; totalMs: number }[] {
  const totals = totalsByKeyOnDate(intervals(db), (entry) => entry.moduleId, date, now);
  return [...totals].map(([moduleId, totalMs]) => ({ moduleId: moduleId as ModuleId, totalMs }));
}

/** 有过计时、说明已经动过手的任务（推荐引擎的 in_progress 规则） */
export function startedTaskIds(db: DbLike = getDb()): Set<string> {
  const ids = new Set<string>();
  for (const row of allRows(db)) {
    if (row.taskId) ids.add(row.taskId);
  }
  return ids;
}

/**
 * 当前这一段连续专注了多久：从进行中的段往前，把间隔小于 `gapMs` 的相邻段接起来。
 * 供推荐引擎判断「该换换脑子了」，所以中间歇一会儿就该算断了。
 */
export function continuousFocusMs(
  now = Date.now(),
  gapMs = 15 * 60_000,
  db: DbLike = getDb(),
): number {
  const ordered = allRows(db)
    .map((row) => ({ startedAt: row.startedAt, endedAt: row.endedAt ?? now }))
    .sort((a, b) => b.startedAt - a.startedAt);
  if (ordered.length === 0) return 0;

  let focused = 0;
  let boundary = now;
  for (const segment of ordered) {
    if (boundary - segment.endedAt > gapMs) break;
    focused += Math.max(0, segment.endedAt - segment.startedAt);
    boundary = segment.startedAt;
  }
  return focused;
}
