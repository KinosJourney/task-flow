import path from 'node:path';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it } from 'vitest';
import { addDays, startOfDay, todayIso } from '@shared/date';
import { getDb, useSqlite } from '@main/db/connection';
import { seedModules } from '@main/db/seedModules';
import { tasks } from '@main/db/schema';
import { linkFocusTasks, listFocusByDate, setFocus } from '@main/repo/dailyFocus';
import { getNextTask, pinNextTask } from '@main/repo/nextTask';
import { createProject } from '@main/repo/projects';
import { createTask, setTaskDone } from '@main/repo/tasks';
import {
  addToToday,
  carryOver,
  getBacklog,
  listTodayQueue,
  removeFromToday,
} from '@main/repo/todayEntries';
import {
  findActiveEntry,
  listEntriesByTask,
  startTimer,
  stopTimer,
  taskTimeTotals,
} from '@main/repo/timeEntries';

/**
 * M2 仓储层跑在真实 SQLite 上：队列按天归属、计时区间、三件事关联、推荐引擎接线。
 * 纯函数规则另见 todayQueueDomain / recommend / time 三组测试。
 */
beforeEach(() => {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  useSqlite(sqlite);
  migrate(getDb(), { migrationsFolder: path.resolve(__dirname, '../drizzle') });
  seedModules();
});

const TODAY = todayIso();
const YESTERDAY = addDays(TODAY, -1);

function seed() {
  const project = createProject({ name: 'ToGoal', defaultModuleId: 'work' });
  const parent = createTask({ title: '父任务', projectId: project.id });
  const childDone = createTask({ title: '昨天做完的子任务', parentId: parent.id });
  const childOpen = createTask({ title: '还没做完的子任务', parentId: parent.id });
  const leftover = createTask({ title: '前天留下的', projectId: project.id });
  const sport = createTask({ title: '慢跑', projectId: project.id, moduleId: 'sport' });
  return { project, parent, childDone, childOpen, leftover, sport };
}

describe('今日队列按天归属', () => {
  it('跨天不自动搬运，一键顺延才插入今天的行', () => {
    const { leftover } = seed();
    addToToday(leftover.id, YESTERDAY);

    expect(listTodayQueue(TODAY).flatMap((g) => g.items).map((i) => i.id)).not.toContain(
      leftover.id,
    );
    expect(getBacklog(TODAY).items.map((i) => i.id)).toEqual([leftover.id]);

    expect(carryOver({ date: TODAY }).carriedCount).toBe(1);
    expect(listTodayQueue(TODAY).flatMap((g) => g.items).map((i) => i.id)).toContain(leftover.id);
    // 原来那天的行保持不动
    expect(listTodayQueue(YESTERDAY).flatMap((g) => g.items).map((i) => i.id)).toContain(
      leftover.id,
    );
  });

  it('顺延父任务只带没做完的子分支', () => {
    const { parent, childDone, childOpen } = seed();
    addToToday(parent.id, YESTERDAY);
    setTaskDone(childDone.id, true);
    // 把完成时刻拨到昨天中午，模拟「昨天做完」——顺延后今天不应再看见它
    getDb()
      .update(tasks)
      .set({ doneAt: startOfDay(YESTERDAY) + 12 * 3_600_000 })
      .where(eq(tasks.id, childDone.id))
      .run();

    carryOver({ date: TODAY, taskIds: [parent.id] });
    const todayParent = listTodayQueue(TODAY)
      .flatMap((g) => g.items)
      .find((i) => i.id === parent.id);
    expect(todayParent?.children.map((c) => c.id)).toEqual([childOpen.id]);
    expect(todayParent?.carriedFrom).toBe(YESTERDAY);
  });

  it('移出某天不影响别的日期；重复入队幂等', () => {
    const { leftover } = seed();
    addToToday(leftover.id, YESTERDAY);
    addToToday(leftover.id, TODAY);
    addToToday(leftover.id, TODAY);

    removeFromToday(leftover.id, TODAY);
    expect(listTodayQueue(TODAY).flatMap((g) => g.items)).toHaveLength(0);
    expect(listTodayQueue(YESTERDAY).flatMap((g) => g.items).map((i) => i.id)).toContain(
      leftover.id,
    );
  });
});

describe('计时区间', () => {
  it('开新段前自动结束旧段，累计时间按区间求和', () => {
    const { parent, leftover } = seed();
    const t0 = Date.now();
    startTimer({ taskId: parent.id, now: t0 });
    expect(findActiveEntry()?.taskId).toBe(parent.id);

    startTimer({ taskId: leftover.id, now: t0 + 30_000 });
    expect(findActiveEntry()?.taskId).toBe(leftover.id);
    expect(listEntriesByTask(parent.id)[0].endedAt).toBe(t0 + 30_000);

    stopTimer(t0 + 60_000);
    expect(findActiveEntry()).toBeNull();
    expect(taskTimeTotals(t0 + 60_000).get(parent.id)).toBe(30_000);
    expect(taskTimeTotals(t0 + 60_000).get(leftover.id)).toBe(30_000);
  });
});

describe('今日三件事与推荐', () => {
  it('关联任务后 getNext 走 focus_linked', () => {
    const { parent, leftover } = seed();
    addToToday(parent.id, TODAY);
    addToToday(leftover.id, TODAY);

    const focus = setFocus({ date: TODAY, slot: 1, content: '推进父任务' });
    linkFocusTasks({ focusId: focus.id, taskIds: [leftover.id] });
    expect(listFocusByDate(TODAY)[0].taskIds).toEqual([leftover.id]);

    const next = getNextTask({ now: Date.now() });
    expect(next.task?.id).toBe(leftover.id);
    expect(next.reason?.rule).toBe('focus_linked');
  });

  it('手动指定优先于自动规则；完成后指定失效', () => {
    const { parent, leftover } = seed();
    addToToday(parent.id, TODAY);
    addToToday(leftover.id, TODAY);

    pinNextTask(leftover.id);
    expect(getNextTask({ now: Date.now() }).reason?.rule).toBe('manual_pin');
    expect(getNextTask({ now: Date.now() }).task?.id).toBe(leftover.id);

    setTaskDone(leftover.id, true);
    const next = getNextTask({ now: Date.now() });
    expect(next.task?.id).toBe(parent.id);
    expect(next.reason?.rule).not.toBe('manual_pin');
  });

  it('遗留没顺延过来不会被推上主卡片', () => {
    const { leftover, parent } = seed();
    addToToday(leftover.id, YESTERDAY);
    addToToday(parent.id, TODAY);

    expect(getNextTask({ now: Date.now() }).task?.id).toBe(parent.id);
    expect(getNextTask({ now: Date.now() }).task?.id).not.toBe(leftover.id);
  });
});
