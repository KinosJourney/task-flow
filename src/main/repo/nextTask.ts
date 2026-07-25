import { eq } from 'drizzle-orm';
import { todayIso } from '@shared/date';
import type { ModuleId, NextTaskResult } from '@shared/types';
import { getDb } from '../db/connection';
import { appMeta, META_KEYS, projects, tasks, todayEntries } from '../db/schema';
import { recommendNextTask, sameModuleStreak, type RecommendCandidate } from '../domain/recommend';
import { AppError } from '../errors';
import type { DbLike } from './db';
import { focusSlotByTask } from './dailyFocus';
import { queuedTaskIdsOn } from './queueRows';
import { createDetailResolver } from './tasks';
import { continuousFocusMs, findActiveEntry, startedTaskIds } from './timeEntries';

function readPinned(db: DbLike = getDb()): string | undefined {
  const row = db.select().from(appMeta).where(eq(appMeta.key, META_KEYS.pinnedNextTaskId)).get();
  return row?.value || undefined;
}

/** 手动指定下一件事；`null` 取消指定，回到自动推荐 */
export function pinNextTask(id: string | null): void {
  const db = getDb();
  if (id === null) {
    db.delete(appMeta).where(eq(appMeta.key, META_KEYS.pinnedNextTaskId)).run();
    return;
  }

  const task = db.select().from(tasks).where(eq(tasks.id, id)).get();
  if (!task) throw new AppError('NOT_FOUND', '任务不存在');
  if (task.isDone) throw new AppError('CONFLICT', '已完成的任务不能设为 Next Task');

  db.insert(appMeta)
    .values({ key: META_KEYS.pinnedNextTaskId, value: id })
    .onConflictDoUpdate({ target: appMeta.key, set: { value: id } })
    .run();
}

/** 指定的任务被完成或删掉之后，指定自动失效 */
function livePinnedId(db: DbLike): string | undefined {
  const pinned = readPinned(db);
  if (!pinned) return undefined;
  const task = db.select().from(tasks).where(eq(tasks.id, pinned)).get();
  if (task && !task.isDone) return pinned;
  db.delete(appMeta).where(eq(appMeta.key, META_KEYS.pinnedNextTaskId)).run();
  return undefined;
}

/**
 * Next Task（PRD 6.1）。候选只从**今天**的队列里取：遗留任务没顺延过来就不该被推上
 * 主卡片，捡不捡是用户的决定（验收标准 1）。规则与理由见 domain/recommend。
 */
export function getNextTask(input: { now: number; excludeTaskId?: string }): NextTaskResult {
  const db = getDb();
  const today = todayIso();

  const rows = db.select().from(tasks).all();
  const taskById = new Map(rows.map((row) => [row.id, row]));
  const queueOrderOf = new Map(
    db
      .select()
      .from(todayEntries)
      .where(eq(todayEntries.date, today))
      .all()
      .map((row) => [row.taskId, row.sortOrder]),
  );

  const candidates: RecommendCandidate[] = [...queuedTaskIdsOn(today, db)]
    .map((taskId) => taskById.get(taskId))
    .filter((row): row is (typeof rows)[number] => Boolean(row) && !row!.isDone)
    .map((row) => ({
      id: row.id,
      moduleId: row.moduleId as ModuleId,
      queueOrder: queueOrderOf.get(row.id) ?? Number.MAX_SAFE_INTEGER,
    }));

  const active = findActiveEntry(db);
  const activeTaskId = active?.taskId;
  // 正在计时的任务如果已经完成了就别再推它
  const activeOpen = activeTaskId && !taskById.get(activeTaskId)?.isDone ? activeTaskId : undefined;

  const nextActionTaskIds = new Set(
    db
      .select()
      .from(projects)
      .all()
      .map((row) => row.nextActionTaskId)
      .filter((id): id is string => Boolean(id)),
  );

  // 疲劳只看今天：昨天连做五件工作，不该让今天第一件就被判定该换脑子了
  const doneToday = rows
    .filter((row) => row.isDone && row.doneAt !== null)
    .map((row) => ({ moduleId: row.moduleId as ModuleId, doneAt: row.doneAt as number }))
    .filter((row) => row.doneAt >= new Date(input.now).setHours(0, 0, 0, 0));

  const recommendation = recommendNextTask({
    now: input.now,
    excludeTaskId: input.excludeTaskId,
    pinnedTaskId: livePinnedId(db),
    candidates,
    activeTimerTaskId: activeOpen,
    focusSlotOf: focusSlotByTask(today, db),
    startedTaskIds: startedTaskIds(db),
    nextActionTaskIds,
    recentStreak: sameModuleStreak(doneToday),
    continuousFocusMs: continuousFocusMs(input.now, undefined, db),
    // upcomingScheduleAt 要等 M3 的 schedule_events 才有来源
  });

  if (!recommendation.taskId) return { task: null, reason: null };
  return {
    task: createDetailResolver(today, db)(recommendation.taskId),
    reason: recommendation.reason,
  };
}
