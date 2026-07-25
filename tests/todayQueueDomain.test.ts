import { describe, expect, it } from 'vitest';
import type { TaskDetail } from '@shared/types';
import {
  buildBacklog,
  buildTodayQueue,
  carriedFrom,
  statusOn,
  type QueueEntry,
  type QueueProject,
  type QueueTask,
} from '@main/domain/todayQueue';

/**
 * 队列按天归属的规则（data-model 1.1、ipc-contract 4.1）。这些规则决定了
 * 验收标准 1、2 成不成立，而且很容易在重构中被改坏，所以逐条锁住。
 *
 * 场景刻意做成「昨天做了一半、今天顺延过来」的样子：
 * - `parent` 昨天与今天都入过队，它的 `childDone` 昨天做完、`childOpen` 还没做
 * - `read` 昨天入队没做完，今天顺延后完成
 * - `progress` 昨天入队昨天完成
 * - `timeline` 前天入队至今未完成，`loose` 是今天入队的散任务
 */
const DAY_BEFORE = '2026-07-24';
const YESTERDAY = '2026-07-25';
const TODAY = '2026-07-26';

const at = (day: number, hour: number) => new Date(2026, 6, day, hour).getTime();

const PROJECTS: QueueProject[] = [
  { id: 'p_togoal', name: 'ToGoal', defaultModuleId: 'work' },
  { id: 'p_fur', name: 'FurDiary', defaultModuleId: 'hobby' },
];

const TASKS: QueueTask[] = [
  { id: 'parent', projectId: 'p_togoal', isDone: false, sortOrder: 1 },
  { id: 'childDone', projectId: 'p_togoal', parentId: 'parent', isDone: true, doneAt: at(25, 16), sortOrder: 1 },
  { id: 'childOpen', projectId: 'p_togoal', parentId: 'parent', isDone: false, sortOrder: 2 },
  { id: 'progress', projectId: 'p_togoal', isDone: true, doneAt: at(25, 18), sortOrder: 2 },
  { id: 'read', projectId: 'p_togoal', isDone: true, doneAt: at(26, 10), sortOrder: 3 },
  { id: 'timeline', projectId: 'p_togoal', isDone: false, sortOrder: 4 },
  { id: 'furLayout', projectId: 'p_fur', isDone: false, sortOrder: 1 },
  { id: 'loose', isDone: false, sortOrder: 1 },
];

const ENTRIES: QueueEntry[] = [
  { date: DAY_BEFORE, taskId: 'timeline', sortOrder: 1 },
  { date: YESTERDAY, taskId: 'progress', sortOrder: 1 },
  { date: YESTERDAY, taskId: 'parent', sortOrder: 2 },
  { date: YESTERDAY, taskId: 'read', sortOrder: 3 },
  { date: TODAY, taskId: 'parent', sortOrder: 1 },
  { date: TODAY, taskId: 'furLayout', sortOrder: 2 },
  { date: TODAY, taskId: 'loose', sortOrder: 3 },
  { date: TODAY, taskId: 'read', sortOrder: 4 },
];

/** 领域层只关心结构，展示字段由仓储层填；测试里给一个够用的替身 */
function detailOf(taskId: string): TaskDetail {
  const task = TASKS.find((t) => t.id === taskId)!;
  return {
    ...task,
    depth: task.parentId ? 2 : 1,
    title: taskId,
    moduleId: 'work',
    inToday: true,
    totalTimeMs: 0,
    notes: [],
  };
}

const queueOn = (date: string, entries = ENTRIES) =>
  buildTodayQueue({ date, tasks: TASKS, entries, projects: PROJECTS, detailOf });

const flatten = (groups: ReturnType<typeof queueOn>) => {
  const out: { id: string; status: string; children: string[] }[] = [];
  const walk = (nodes: ReturnType<typeof queueOn>[number]['items']) => {
    for (const node of nodes) {
      out.push({ id: node.id, status: node.status, children: node.children.map((c) => c.id) });
      walk(node.children);
    }
  };
  groups.forEach((g) => walk(g.items));
  return out;
};

const find = (groups: ReturnType<typeof queueOn>, id: string) =>
  flatten(groups).find((n) => n.id === id);
const rootIds = (groups: ReturnType<typeof queueOn>) =>
  groups.flatMap((g) => g.items).map((n) => n.id);

describe('行在那天的状态', () => {
  it('未完成是 pending', () => {
    expect(statusOn({ id: 'x', isDone: false, sortOrder: 1 }, TODAY)).toBe('pending');
  });

  it('完成于那天是 done，完成于那天之后是 done_later', () => {
    const task = { id: 'x', isDone: true, doneAt: at(26, 10), sortOrder: 1 };
    expect(statusOn(task, TODAY)).toBe('done');
    expect(statusOn(task, YESTERDAY)).toBe('done_later');
  });

  it('完成于那天之前也算那天的成果，不会倒过来标成 done_later', () => {
    expect(statusOn({ id: 'x', isDone: true, doneAt: at(25, 10), sortOrder: 1 }, TODAY)).toBe('done');
  });
});

describe('某天的队列画面', () => {
  it('当天完成的留在当天，不出现在第二天', () => {
    expect(find(queueOn(YESTERDAY), 'progress')?.status).toBe('done');
    expect(flatten(queueOn(TODAY)).map((n) => n.id)).not.toContain('progress');
  });

  it('那天没做完、后来才完成的标成 done_later，而不是当天的成果', () => {
    expect(find(queueOn(YESTERDAY), 'read')?.status).toBe('done_later');
    expect(find(queueOn(TODAY), 'read')?.status).toBe('done');
  });

  it('顺延过来的父任务只带没做完的子分支，昨天做完的子任务留在昨天', () => {
    expect(find(queueOn(YESTERDAY), 'parent')?.children).toContain('childDone');
    expect(find(queueOn(TODAY), 'parent')?.children).toEqual(['childOpen']);
  });

  it('顺延来的根行标出它最早入队那天', () => {
    const parent = queueOn(TODAY)
      .flatMap((g) => g.items)
      .find((n) => n.id === 'parent');
    expect(parent?.carriedFrom).toBe(YESTERDAY);
    expect(carriedFrom(ENTRIES, 'furLayout', TODAY)).toBeUndefined();
  });

  it('父子同时入队时只保留父级作为根行', () => {
    const entries = [...ENTRIES, { date: TODAY, taskId: 'childOpen', sortOrder: 5 }];
    const groups = queueOn(TODAY, entries);
    expect(rootIds(groups)).not.toContain('childOpen');
    expect(find(groups, 'parent')?.children).toContain('childOpen');
  });
});

describe('分块与排序', () => {
  it('按项目分块，散任务自成一块', () => {
    const groups = queueOn(TODAY);
    expect(groups.map((g) => g.projectName)).toEqual(['ToGoal', 'FurDiary', undefined]);
    expect(groups[0].moduleId).toBe('work');
    expect(groups[2].items.map((i) => i.id)).toEqual(['loose']);
  });

  it('当天达成的根项沉到块末尾，没消失', () => {
    expect(queueOn(TODAY)[0].items.map((i) => i.id)).toEqual(['parent', 'read']);
  });

  it('计数把被父任务带出的子任务算进去，done_later 算未完成', () => {
    const [togoal] = queueOn(YESTERDAY);
    // 昨天这块：progress(done)、parent(pending)+childDone(done)+childOpen(pending)、read(done_later)
    expect(togoal.doneCount).toBe(2);
    expect(togoal.todoCount).toBe(3);
  });

  it('整块做完的沉到最后', () => {
    const entries: QueueEntry[] = [
      { date: TODAY, taskId: 'read', sortOrder: 1 },
      { date: TODAY, taskId: 'furLayout', sortOrder: 2 },
    ];
    // read 今天已完成，所以 ToGoal 那块整块做完，让位给还有事要做的 FurDiary
    expect(queueOn(TODAY, entries).map((g) => g.projectName)).toEqual(['FurDiary', 'ToGoal']);
  });
});

describe('遗留清单', () => {
  const backlogBefore = (before: string, entries = ENTRIES) =>
    buildBacklog({ before, tasks: TASKS, entries, detailOf });

  it('只含没做完、且还没顺延过来的，拖得最久的排最前面', () => {
    const backlog = backlogBefore(TODAY);
    expect(backlog.items.map((i) => i.id)).toEqual(['timeline']);
    expect(backlog.oldestDate).toBe(DAY_BEFORE);
    expect(backlog.items[0].queuedDate).toBe(DAY_BEFORE);
  });

  it('已完成的、已经顺延到今天的都不算欠账', () => {
    const ids = backlogBefore(TODAY).items.map((i) => i.id);
    expect(ids).not.toContain('progress'); // 昨天完成
    expect(ids).not.toContain('read'); // 昨天入队、今天完成
    expect(ids).not.toContain('parent'); // 已经顺延到今天
  });

  it('被父任务带出来的子任务不单列，顺延父任务时它自然跟着走', () => {
    const entries = [...ENTRIES, { date: YESTERDAY, taskId: 'childOpen', sortOrder: 4 }];
    expect(backlogBefore(TODAY, entries).items.map((i) => i.id)).not.toContain('childOpen');
  });

  it('多天都没做完时按最早那天算，用来说明拖了多久', () => {
    const entries = [...ENTRIES, { date: YESTERDAY, taskId: 'timeline', sortOrder: 5 }];
    expect(backlogBefore(TODAY, entries).items[0].queuedDate).toBe(DAY_BEFORE);
  });
});
