import type { Api, ErrorCode, IpcResult } from '@shared/ipc';
import type {
  BacklogItem,
  DailyFocus,
  HabitWithStreak,
  HomeSummary,
  ImportPreview,
  ImportPreviewItem,
  ModuleId,
  Note,
  NextTaskResult,
  Project,
  ProjectWithProgress,
  Task,
  TaskAncestor,
  TaskDetail,
  TaskFull,
  TaskNode,
  TimeEntry,
  TodayBacklog,
  TodayEntryStatus,
  TodayQueueGroup,
  TodayQueueNode,
  WeeklyReview,
  WeeklySummary,
} from '@shared/types';
import { addDays, isoDateOf, weekStartOf } from '@/lib/date';
import {
  CONTINUOUS_WORK_MIN,
  FOCUS,
  HABITS,
  HABIT_STREAK,
  HABIT_TODAY,
  MODULES,
  NOTES,
  PROJECTS,
  SCHEDULE,
  TASKS,
  TIME_ENTRIES,
  TODAY,
  TODAY_ENTRIES,
  type StoredTask,
} from './data';

const ok = <T>(data: T): IpcResult<T> => ({ ok: true, data });
const fail = (code: ErrorCode, message: string): IpcResult<never> => ({
  ok: false,
  error: { code, message },
});
const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));

/** 用户手动指定的 Next Task，优先于全部自动规则；完成或取消后回落到自动推荐 */
let pinnedNextTaskId: string | null = null;

function taskTime(taskId: string): number {
  return TIME_ENTRIES.filter((t) => t.taskId === taskId).reduce(
    (sum, t) => sum + ((t.endedAt ?? Date.now()) - t.startedAt),
    0,
  );
}

function projectProgress(projectId: string) {
  const tasks = TASKS.filter((t) => t.projectId === projectId);
  const leaves = tasks.filter((t) => !tasks.some((c) => c.parentId === t.id));
  const done = leaves.filter((t) => t.isDone).length;
  const total = leaves.length;
  return { doneLeaves: done, totalLeaves: total, ratio: total ? done / total : 0 };
}

function projectTime(projectId: string): number {
  const ids = new Set(TASKS.filter((t) => t.projectId === projectId).map((t) => t.id));
  return TIME_ENTRIES.filter((t) => t.taskId && ids.has(t.taskId)).reduce(
    (sum, t) => sum + ((t.endedAt ?? Date.now()) - t.startedAt),
    0,
  );
}

function toProjectWithProgress(p: Project): ProjectWithProgress {
  return { ...p, progress: projectProgress(p.id), totalTimeMs: projectTime(p.id) };
}

function focusSlotForTask(taskId: string): number | undefined {
  const f = FOCUS.find((f) => f.taskIds.includes(taskId));
  return f?.slot;
}

/** 某天的队列里有没有这个任务 */
function isQueuedOn(taskId: string, date: string): boolean {
  return TODAY_ENTRIES.some((e) => e.taskId === taskId && e.date === date);
}

/** 补上派生的 `inToday`：存储层不存这个字段，它是「今天的队列里有没有它」 */
function toTask(t: StoredTask): Task {
  return { ...t, inToday: isQueuedOn(t.id, TODAY) };
}

function toTaskDetail(t: StoredTask): TaskDetail {
  const project = PROJECTS.find((p) => p.id === t.projectId);
  return {
    ...toTask(t),
    projectName: project?.name,
    totalTimeMs: taskTime(t.id),
    notes: NOTES.filter((n) => n.taskId === t.id),
    linkedFocusSlot: focusSlotForTask(t.id),
  };
}

function ancestorsOf(task: StoredTask): TaskAncestor[] {
  const chain: TaskAncestor[] = [];
  let cursor: StoredTask | undefined = task;
  // 最多三级，循环深度天然有界；仍留一个保险计数防脏数据成环
  for (let guard = 0; cursor?.parentId && guard < 3; guard++) {
    const parent: StoredTask | undefined = TASKS.find((t) => t.id === cursor?.parentId);
    if (!parent) break;
    chain.unshift({ id: parent.id, title: parent.title });
    cursor = parent;
  }
  return chain;
}

function toTaskFull(t: StoredTask): TaskFull {
  return {
    ...toTaskDetail(t),
    children: TASKS.filter((x) => x.parentId === t.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(toTask),
    ancestors: ancestorsOf(t),
  };
}

/** 一棵子树共占几层：移动时校验的是「新层级 + 子树高度」，不是只看被移动那一行 */
function subtreeHeight(id: string): number {
  const children = TASKS.filter((t) => t.parentId === id);
  return children.length ? 1 + Math.max(...children.map((c) => subtreeHeight(c.id))) : 1;
}

/** 换了父级，整棵子树的 depth 都要跟着重排 */
function applyDepth(id: string, depth: number): void {
  const node = TASKS.find((t) => t.id === id);
  if (!node) return;
  node.depth = depth;
  for (const child of TASKS.filter((t) => t.parentId === id)) applyDepth(child.id, depth + 1);
}

/** 同级重排成连续的 1..n，把 task 插到 position 处（省略则放末尾） */
function reorderSiblings(task: StoredTask, position?: number): void {
  const siblings = TASKS.filter(
    (t) => t.parentId === task.parentId && t.projectId === task.projectId && t.id !== task.id,
  ).sort((a, b) => a.sortOrder - b.sortOrder);
  const at = position === undefined ? siblings.length : Math.min(Math.max(position, 0), siblings.length);
  siblings.splice(at, 0, task);
  siblings.forEach((t, i) => {
    t.sortOrder = i + 1;
  });
}

function activeEntry(): TimeEntry | undefined {
  return TIME_ENTRIES.find((t) => t.endedAt === undefined);
}

/** 就地删除数组元素：mock 数据是共享的可变数组，不能整体替换引用 */
function removeWhere<T>(arr: T[], match: (item: T) => boolean): void {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (match(arr[i])) arr.splice(i, 1);
  }
}

/** 级联收集自身与所有后代 id，用于删除 */
function withDescendants(id: string): string[] {
  const ids = [id];
  for (const child of TASKS.filter((t) => t.parentId === id)) {
    ids.push(...withDescendants(child.id));
  }
  return ids;
}

/**
 * 队列行在某一天的状态。完成状态只有一份，但「那天有没有做完」是行级的：
 * 昨天没做完、今天顺延后完成，昨天那行要显示成当天没做完，今天那行才是达成。
 */
function statusOn(task: StoredTask, date: string): TodayEntryStatus {
  if (!task.isDone) return 'pending';
  const doneDate = task.doneAt ? isoDateOf(task.doneAt) : undefined;
  // 完成于这天之后 = 那天终究没做完；完成于这天（或更早的脏数据）都算这天的成果
  return doneDate && doneDate > date ? 'done_later' : 'done';
}

/**
 * 某天的队列里该不该显示这个后代节点。没做完的一直跟着父任务露面；已完成的只在
 * **它完成的那天**露面。于是昨天做完的子任务留在昨天，顺延父任务到今天时不会跟过来，
 * 今天看到的只剩没做完的分支。自己在那天有队列行的（根行）无条件显示。
 */
function visibleOn(task: StoredTask, date: string): boolean {
  if (isQueuedOn(task.id, date)) return true;
  if (!task.isDone) return true;
  return task.doneAt !== undefined && isoDateOf(task.doneAt) === date;
}

/** 队列行的子级：后代里那天该露面的，按 sortOrder 保持结构顺序（不像根行那样完成沉底） */
function queueChildren(parentId: string, date: string): TodayQueueNode[] {
  return TASKS.filter((t) => t.parentId === parentId && visibleOn(t, date))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((t) => ({
      ...toTaskDetail(t),
      status: statusOn(t, date),
      children: queueChildren(t.id, date),
    }));
}

function hasAncestorQueuedOn(task: StoredTask, date: string): boolean {
  let cursor = TASKS.find((t) => t.id === task.parentId);
  for (let guard = 0; cursor && guard < 3; guard++) {
    if (isQueuedOn(cursor.id, date)) return true;
    cursor = TASKS.find((t) => t.id === cursor?.parentId);
  }
  return false;
}

function countNodes(nodes: TodayQueueNode[]): { todo: number; done: number } {
  return nodes.reduce(
    (acc, n) => {
      const sub = countNodes(n.children);
      const done = n.status === 'done';
      return {
        todo: acc.todo + sub.todo + (done ? 0 : 1),
        done: acc.done + sub.done + (done ? 1 : 0),
      };
    },
    { todo: 0, done: 0 },
  );
}

/** 在某天的队列末尾插一行；已经在那天了就什么都不做（顺延幂等，重复点不会重复入队） */
function enqueue(taskId: string, date: string): void {
  if (isQueuedOn(taskId, date)) return;
  const last = Math.max(0, ...TODAY_ENTRIES.filter((e) => e.date === date).map((e) => e.sortOrder));
  TODAY_ENTRIES.push({ id: `q_${date}_${taskId}`, date, taskId, sortOrder: last + 1 });
}

/** 这个任务此前最早出现在哪天的队列里；有值说明当天这行是顺延来的 */
function carriedFrom(taskId: string, date: string): string | undefined {
  const earlier = TODAY_ENTRIES.filter((e) => e.taskId === taskId && e.date < date)
    .map((e) => e.date)
    .sort();
  return earlier[0];
}

function buildTodayQueue(date: string): TodayQueueGroup[] {
  const entries = TODAY_ENTRIES.filter((e) => e.date === date);
  const sortOrderOf = (taskId: string) =>
    entries.find((e) => e.taskId === taskId)?.sortOrder ?? Number.MAX_SAFE_INTEGER;

  // 父子同时在队列里时只保留父级，子级作为它的下一层出现，避免同一件事出现两次
  const roots = entries
    .map((e) => TASKS.find((t) => t.id === e.taskId))
    .filter((t): t is StoredTask => Boolean(t) && !hasAncestorQueuedOn(t!, date))
    .sort((a, b) => {
      // 当天达成的沉到块末尾而不是消失，让那天的成果一直看得见
      const aDone = statusOn(a, date) === 'done';
      const bDone = statusOn(b, date) === 'done';
      if (aDone !== bDone) return aDone ? 1 : -1;
      if (aDone && bDone) return (a.doneAt ?? 0) - (b.doneAt ?? 0);
      return sortOrderOf(a.id) - sortOrderOf(b.id);
    });

  /** 块的排序依据：还没做完的最靠前那一项的队列序；整块做完了就沉底 */
  const groupRank = (items: TodayQueueNode[]) => {
    const pending = items.filter((t) => t.status !== 'done');
    return pending.length
      ? Math.min(...pending.map((t) => sortOrderOf(t.id)))
      : Number.MAX_SAFE_INTEGER;
  };

  const groups = new Map<string, TodayQueueGroup>();
  for (const task of roots) {
    const key = task.projectId ?? '';
    let group = groups.get(key);
    if (!group) {
      const project = PROJECTS.find((p) => p.id === task.projectId);
      group = {
        projectId: project?.id,
        projectName: project?.name,
        moduleId: project?.defaultModuleId,
        items: [],
        todoCount: 0,
        doneCount: 0,
      };
      groups.set(key, group);
    }
    group.items.push({
      ...toTaskDetail(task),
      status: statusOn(task, date),
      carriedFrom: carriedFrom(task.id, date),
      children: queueChildren(task.id, date),
    });
  }

  return [...groups.values()]
    .map((g) => {
      const { todo, done } = countNodes(g.items);
      return { ...g, todoCount: todo, doneCount: done };
    })
    .sort((a, b) => groupRank(a.items) - groupRank(b.items));
}

/**
 * `before` 之前还没做完的队列项。已经顺延到 `before` 那天的不算遗留（它已经在今天的清单里），
 * 被父任务带出来的子任务也不算——顺延父任务时它们自然跟着走。
 */
function buildBacklog(before: string): TodayBacklog {
  const earliest = new Map<string, string>();
  for (const e of TODAY_ENTRIES) {
    if (e.date >= before) continue;
    const known = earliest.get(e.taskId);
    if (!known || e.date < known) earliest.set(e.taskId, e.date);
  }

  const items: BacklogItem[] = [];
  for (const [taskId, queuedDate] of earliest) {
    const task = TASKS.find((t) => t.id === taskId);
    if (!task || task.isDone) continue;
    if (isQueuedOn(taskId, before)) continue;
    if (hasAncestorQueuedOn(task, queuedDate)) continue;
    items.push({ ...toTaskDetail(task), queuedDate });
  }
  items.sort((a, b) => a.queuedDate.localeCompare(b.queuedDate));

  return { items, oldestDate: items[0]?.queuedDate };
}

function buildTree(projectId: string): TaskNode[] {
  const all = TASKS.filter((t) => t.projectId === projectId);
  const byParent = (pid?: string): TaskNode[] =>
    all
      .filter((t) => t.parentId === pid)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((t) => ({ ...toTask(t), children: byParent(t.id) }));
  return byParent(undefined);
}

function pickNextTask(excludeTaskId?: string): NextTaskResult {
  // 规则 0：手动指定优先于 excludeTaskId，「换一个」会先取消指定
  if (pinnedNextTaskId) {
    const pinned = TASKS.find((t) => t.id === pinnedNextTaskId && !t.isDone);
    if (pinned) {
      return {
        task: toTaskDetail(pinned),
        reason: { rule: 'manual_pin', message: '这件是你自己挑出来的，那就先干它！' },
      };
    }
    pinnedNextTaskId = null;
  }

  // 只从**今天**的队列里推荐：遗留任务没顺延过来就不该被推上主卡片，顺延是用户的决定
  const todayEntries = TODAY_ENTRIES.filter((e) => e.date === TODAY);
  const candidates = todayEntries
    .map((e) => TASKS.find((t) => t.id === e.taskId))
    .filter((t): t is StoredTask => Boolean(t) && !t!.isDone && t!.id !== excludeTaskId);
  if (candidates.length === 0) return { task: null, reason: null };
  const queueOrderOf = (taskId: string) =>
    todayEntries.find((e) => e.taskId === taskId)?.sortOrder ?? Number.MAX_SAFE_INTEGER;

  const focusLinkedIds = new Set(FOCUS.flatMap((f) => f.taskIds));

  // 规则 2：与今日三件事关联
  const focusLinked = candidates.find((t) => focusLinkedIds.has(t.id));
  if (focusLinked) {
    const slot = focusSlotForTask(focusLinked.id);
    return {
      task: toTaskDetail(focusLinked),
      reason: {
        rule: 'focus_linked',
        message: `这关系到你今天想要的第 ${slot} 件事，先推进它吧。`,
      },
    };
  }

  // 规则 6：模块平衡（连续工作后推荐其他模块）
  const nonWork = candidates.find((t) => t.moduleId !== 'work');
  if (CONTINUOUS_WORK_MIN >= 5 && nonWork) {
    return {
      task: toTaskDetail(nonWork),
      reason: {
        rule: 'module_balance',
        message: `你已经连续投入工作一阵子了，换个「${MODULES.find((m) => m.id === nonWork.moduleId)?.name}」的事换换脑子？`,
        context: { recentSameModuleCount: CONTINUOUS_WORK_MIN, suggestedModuleId: nonWork.moduleId },
      },
    };
  }

  // 规则 5：今日队列靠前
  const top = [...candidates].sort((a, b) => queueOrderOf(a.id) - queueOrderOf(b.id))[0];
  return {
    task: toTaskDetail(top),
    reason: { rule: 'today_queue_top', message: '你把它排在了今日队列最前面。' },
  };
}

function parseImport(rawText: string): ImportPreview {
  const items: ImportPreviewItem[] = [];
  rawText.split('\n').forEach((line, i) => {
    if (line.trim() === '') return;
    const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
    const depth = Math.min(3, Math.floor(indent / 2) + 1);
    const overDepth = Math.floor(indent / 2) + 1 > 3;
    const trimmed = line.trim();

    const dateMatch = trimmed.match(/^#{1,2}\s*(\d{4}-\d{2}-\d{2})/) || trimmed.match(/^(\d{4}-\d{2}-\d{2})[:：]?$/);
    if (dateMatch) {
      items.push({ lineNo: i + 1, parsedKind: 'date_header', content: dateMatch[1] });
      return;
    }
    const projMatch = trimmed.match(/^#\s+(.+)/);
    if (projMatch) {
      items.push({ lineNo: i + 1, parsedKind: 'project_header', content: projMatch[1] });
      return;
    }
    const checkbox = trimmed.match(/^[-*]\s*\[([ xX])\]\s*(.+)/);
    if (checkbox) {
      items.push({
        lineNo: i + 1,
        parsedKind: overDepth ? 'note' : 'task',
        depth,
        content: checkbox[2],
        isDone: checkbox[1].toLowerCase() === 'x',
      });
      return;
    }
    const listItem = trimmed.match(/^(?:[-*]|\d+\.)\s+(.+)/);
    if (listItem) {
      items.push({ lineNo: i + 1, parsedKind: overDepth ? 'note' : 'task', depth, content: listItem[1] });
      return;
    }
    items.push({ lineNo: i + 1, parsedKind: 'note', content: trimmed });
  });
  return { items };
}

/** 某天产生的计时；用于按天切分时间轴与「今天投入了多少」 */
function entriesOn(date: string): TimeEntry[] {
  return TIME_ENTRIES.filter((t) => isoDateOf(t.startedAt) === date);
}

function moduleTotals(entries: TimeEntry[]) {
  return MODULES.map((m) => ({
    moduleId: m.id,
    totalMs: entries
      .filter((t) => t.moduleId === m.id)
      .reduce((s, t) => s + ((t.endedAt ?? Date.now()) - t.startedAt), 0),
  })).filter((x) => x.totalMs > 0);
}

function buildSummary(weekStart: string): WeeklySummary {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const inWeek = (date: string) => days.includes(date);

  const weekTasks = TASKS.filter((t) => t.isDone && t.doneAt && inWeek(isoDateOf(t.doneAt)));
  const moduleTasks = MODULES.map((m) => ({
    moduleId: m.id,
    doneCount: weekTasks.filter((t) => t.moduleId === m.id).length,
  })).filter((x) => x.doneCount > 0);
  const moduleTime = moduleTotals(TIME_ENTRIES.filter((t) => inWeek(isoDateOf(t.startedAt))));
  const weekFocus = FOCUS.filter((f) => inWeek(f.date));
  return {
    weekStart,
    moduleTasks,
    moduleTime,
    focusCompletion: { total: weekFocus.length, done: weekFocus.filter((f) => f.isDone).length },
    habitCompletion: HABITS.map((h) => ({
      habitId: h.id,
      name: h.name,
      doneCount: HABIT_STREAK[h.id]?.current ?? 0,
      streak: HABIT_STREAK[h.id]?.current ?? 0,
    })),
    // 这周进过队列、到现在还没做完的（去重到任务）：PRD 12 的「未完成并仍在队列中」
    unfinishedInQueue: new Set(
      TODAY_ENTRIES.filter((e) => inWeek(e.date)).filter(
        (e) => !TASKS.find((t) => t.id === e.taskId)?.isDone,
      ).map((e) => e.taskId),
    ).size,
  };
}

export const mockApi: Api = {
  system: {
    async ping(p) {
      await delay(10);
      return ok({
        pong: true as const,
        echo: p?.message ?? 'ping',
        at: Date.now(),
        versions: { electron: '-', chrome: '-', node: '-' },
      });
    },
    async dbCheck() {
      await delay(10);
      return {
        ok: false,
        error: { code: 'INTERNAL', message: '浏览器 mock 环境下没有 SQLite' },
      };
    },
  },
  modules: {
    async list() {
      await delay();
      return ok(MODULES);
    },
  },
  projects: {
    async list(p) {
      await delay();
      const status = p?.status ?? 'active';
      return ok(PROJECTS.filter((x) => x.status === status).map(toProjectWithProgress));
    },
    async create(p) {
      await delay(60);
      const now = Date.now();
      const project: Project = {
        id: `p_${now}`,
        name: p.name,
        goal: p.goal,
        defaultModuleId: p.defaultModuleId,
        notes: p.notes,
        status: 'active',
        sortOrder: PROJECTS.length + 1,
        createdAt: now,
        updatedAt: now,
      };
      PROJECTS.push(project);
      return ok(project);
    },
    async update(p) {
      await delay(60);
      const project = PROJECTS.find((x) => x.id === p.id);
      if (!project) return fail('NOT_FOUND', '项目不存在');
      if (p.name !== undefined) project.name = p.name;
      // null 表示清空，undefined 表示不改动
      if (p.goal !== undefined) project.goal = p.goal ?? undefined;
      if (p.notes !== undefined) project.notes = p.notes ?? undefined;
      if (p.defaultModuleId !== undefined) project.defaultModuleId = p.defaultModuleId;
      if (p.nextActionTaskId !== undefined) project.nextActionTaskId = p.nextActionTaskId ?? undefined;
      if (p.status !== undefined) project.status = p.status;
      project.updatedAt = Date.now();
      return ok(project);
    },
    async archive(p) {
      await delay(60);
      const project = PROJECTS.find((x) => x.id === p.id);
      if (!project) return fail('NOT_FOUND', '项目不存在');
      project.status = 'archived';
      project.updatedAt = Date.now();
      return ok(project);
    },
    async reorder(p) {
      await delay(60);
      p.orderedIds.forEach((id, index) => {
        const project = PROJECTS.find((x) => x.id === id);
        if (project) project.sortOrder = index + 1;
      });
      return ok(undefined);
    },
  },
  tasks: {
    async tree(p) {
      await delay();
      return ok<TaskNode[]>(buildTree(p.projectId));
    },
    async get(p) {
      await delay(60);
      const task = TASKS.find((t) => t.id === p.id);
      if (!task) return fail('NOT_FOUND', '这件事已经不在了');
      return ok(toTaskFull(task));
    },
    async getNext(p) {
      await delay();
      return ok(pickNextTask(p.excludeTaskId));
    },
    async create(p) {
      await delay(60);
      const parent = p.parentId ? TASKS.find((t) => t.id === p.parentId) : undefined;
      if (p.parentId && !parent) return fail('NOT_FOUND', '父任务不存在');
      const depth = parent ? parent.depth + 1 : 1;
      if (depth > 3) return fail('DEPTH_EXCEEDED', '任务最多三级，再往下的内容请记为备注');
      const projectId = p.projectId ?? parent?.projectId;
      const moduleId =
        p.moduleId ??
        parent?.moduleId ??
        PROJECTS.find((x) => x.id === projectId)?.defaultModuleId ??
        'other';
      const siblings = TASKS.filter((t) => t.parentId === p.parentId && t.projectId === projectId);
      const created: StoredTask = {
        id: `t_${Date.now()}`,
        projectId,
        parentId: p.parentId,
        depth,
        title: p.title,
        description: p.description?.trim() || undefined,
        moduleId,
        isDone: false,
        sortOrder: siblings.length + 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      TASKS.push(created);
      if (p.inToday) enqueue(created.id, TODAY);
      return ok(toTask(created));
    },
    async update(p) {
      await delay(60);
      const task = TASKS.find((t) => t.id === p.id);
      if (!task) return fail('NOT_FOUND', '任务不存在');
      if (p.title !== undefined) {
        if (!p.title.trim()) return fail('VALIDATION', '任务标题不能为空');
        task.title = p.title.trim();
      }
      if (p.moduleId !== undefined) task.moduleId = p.moduleId;
      // null 表示清空，undefined 表示不改动
      if (p.description !== undefined) task.description = p.description?.trim() || undefined;
      if (p.projectId !== undefined) task.projectId = p.projectId ?? undefined;
      if (p.dueDate !== undefined) task.dueDate = p.dueDate ?? undefined;
      if (p.scheduledAt !== undefined) task.scheduledAt = p.scheduledAt ?? undefined;
      task.updatedAt = Date.now();
      return ok(toTask(task));
    },
    async move(p) {
      await delay(60);
      const task = TASKS.find((t) => t.id === p.id);
      if (!task) return fail('NOT_FOUND', '任务不存在');

      const changingParent = p.parentId !== undefined;
      const newParentId = changingParent ? (p.parentId ?? undefined) : task.parentId;
      const parent = newParentId ? TASKS.find((t) => t.id === newParentId) : undefined;
      if (newParentId && !parent) return fail('NOT_FOUND', '父任务不存在');

      const family = withDescendants(task.id);
      if (parent && family.includes(parent.id))
        return fail('CONFLICT', '不能把任务移到它自己的子任务下');

      const newDepth = parent ? parent.depth + 1 : 1;
      if (newDepth + subtreeHeight(task.id) - 1 > 3)
        return fail('DEPTH_EXCEEDED', '任务最多三级，再往下的内容请记为备注');

      // 换父级时项目跟着父级走（PRD 4.1：项目内任务自动继承），整棵子树一起搬
      const newProjectId = parent
        ? parent.projectId
        : p.projectId !== undefined
          ? (p.projectId ?? undefined)
          : task.projectId;

      task.parentId = newParentId;
      applyDepth(task.id, newDepth);
      for (const id of family) {
        const node = TASKS.find((t) => t.id === id);
        if (!node) continue;
        node.projectId = newProjectId;
        node.updatedAt = Date.now();
      }
      reorderSiblings(task, p.position);
      return ok(toTask(task));
    },
    async complete(p) {
      await delay();
      const task = TASKS.find((t) => t.id === p.id);
      if (!task) return fail('NOT_FOUND', '任务不存在');
      task.isDone = true;
      task.doneAt = Date.now();
      task.updatedAt = Date.now();
      if (pinnedNextTaskId === task.id) pinnedNextTaskId = null;
      return ok(toTask(task));
    },
    async reopen(p) {
      await delay(60);
      const task = TASKS.find((t) => t.id === p.id);
      if (!task) return fail('NOT_FOUND', '任务不存在');
      task.isDone = false;
      task.doneAt = undefined;
      task.updatedAt = Date.now();
      return ok(toTask(task));
    },
    async delete(p) {
      await delay(60);
      if (!TASKS.some((t) => t.id === p.id)) return fail('NOT_FOUND', '任务不存在');
      const ids = new Set(withDescendants(p.id));
      for (const id of ids) {
        if (pinnedNextTaskId === id) pinnedNextTaskId = null;
        removeWhere(TASKS, (t) => t.id === id);
        removeWhere(NOTES, (n) => n.taskId === id);
        removeWhere(TODAY_ENTRIES, (e) => e.taskId === id);
      }
      return ok(undefined);
    },
    async pinNext(p) {
      await delay(60);
      if (p.id === null) {
        pinnedNextTaskId = null;
        return ok(undefined);
      }
      const task = TASKS.find((t) => t.id === p.id);
      if (!task) return fail('NOT_FOUND', '任务不存在');
      if (task.isDone) return fail('CONFLICT', '已完成的任务不能设为 Next Task');
      pinnedNextTaskId = task.id;
      return ok(undefined);
    },
  },
  today: {
    async list(p) {
      await delay();
      return ok<TodayQueueGroup[]>(buildTodayQueue(p.date));
    },
    async add(p) {
      await delay(60);
      const task = TASKS.find((t) => t.id === p.taskId);
      if (!task) return fail('NOT_FOUND', '任务不存在');
      enqueue(p.taskId, p.date);
      task.updatedAt = Date.now();
      return ok(undefined);
    },
    async remove(p) {
      await delay(60);
      const task = TASKS.find((t) => t.id === p.taskId);
      if (!task) return fail('NOT_FOUND', '任务不存在');
      // 只删这一天的行：别的日期该留的记录留着，队列是按天归属的
      removeWhere(TODAY_ENTRIES, (e) => e.taskId === p.taskId && e.date === p.date);
      task.updatedAt = Date.now();
      return ok(undefined);
    },
    async backlog(p) {
      await delay();
      return ok(buildBacklog(p.before));
    },
    async carryOver(p) {
      await delay(60);
      const backlog = buildBacklog(p.date);
      const wanted = p.taskIds
        ? backlog.items.filter((i) => p.taskIds!.includes(i.id))
        : backlog.items;
      if (p.taskIds && wanted.length !== p.taskIds.length) {
        return fail('NOT_FOUND', '有任务已经不在遗留清单里了');
      }
      for (const item of wanted) enqueue(item.id, p.date);
      return ok({ carriedCount: wanted.length });
    },
  },
  focus: {
    async getDay(p) {
      await delay();
      return ok<DailyFocus[]>(FOCUS.filter((f) => f.date === p.date));
    },
    async set(p) {
      await delay(60);
      const content = p.content?.trim() || undefined;
      const existing = FOCUS.find((f) => f.date === p.date && f.slot === p.slot);
      if (existing) {
        existing.content = content;
        if (p.projectId !== undefined) existing.projectId = p.projectId;
        // 清空内容时一并回到未完成，避免空槽还留着勾
        if (!content) existing.isDone = false;
        return ok(existing);
      }
      const created: DailyFocus = {
        id: `f_${p.date}_${p.slot}`,
        date: p.date,
        slot: p.slot,
        content,
        projectId: p.projectId,
        isDone: false,
        taskIds: [],
      };
      FOCUS.push(created);
      return ok(created);
    },
    async toggleDone(p) {
      await delay(60);
      const focus = FOCUS.find((f) => f.id === p.focusId);
      if (!focus) return fail('NOT_FOUND', '这件事还没填写');
      focus.isDone = p.isDone;
      return ok(focus);
    },
  },
  timer: {
    async active() {
      await delay();
      return ok<TimeEntry | null>(activeEntry() ?? null);
    },
    async start(p) {
      await delay(60);
      // 契约：全表最多一条进行中的段，开新段前先结束旧段
      const running = activeEntry();
      if (running) running.endedAt = p.now;
      const task = p.taskId ? TASKS.find((t) => t.id === p.taskId) : undefined;
      if (p.taskId && !task) return fail('NOT_FOUND', '任务不存在');
      const entry: TimeEntry = {
        id: `te_${p.now}`,
        taskId: task?.id,
        moduleId: task?.moduleId,
        startedAt: p.now,
        source: 'timer',
      };
      TIME_ENTRIES.push(entry);
      return ok(entry);
    },
    async stop(p) {
      await delay(60);
      const running = activeEntry();
      if (!running) return ok(null);
      running.endedAt = p.now;
      return ok(running);
    },
    async listByTask(p) {
      await delay();
      return ok<TimeEntry[]>(
        TIME_ENTRIES.filter((t) => t.taskId === p.taskId).sort((a, b) => a.startedAt - b.startedAt),
      );
    },
  },
  schedule: {
    async listRange(p) {
      await delay();
      return ok(SCHEDULE.filter((e) => e.endAt > p.from && e.startAt < p.to));
    },
  },
  habits: {
    async list() {
      await delay();
      return ok<HabitWithStreak[]>(
        HABITS.map((h) => ({
          ...h,
          currentStreak: HABIT_STREAK[h.id]?.current ?? 0,
          longestStreak: HABIT_STREAK[h.id]?.longest ?? 0,
          todayStatus: HABIT_TODAY[h.id],
        })),
      );
    },
  },
  notes: {
    async listByTask(p) {
      await delay();
      return ok<Note[]>(NOTES.filter((n) => n.taskId === p.taskId));
    },
    async create(p) {
      await delay(60);
      const note: Note = {
        id: `n_${Date.now()}`,
        taskId: p.taskId,
        kind: p.kind,
        content: p.content,
        url: p.url,
        createdAt: Date.now(),
      };
      NOTES.push(note);
      return ok(note);
    },
    async update(p) {
      await delay(60);
      const note = NOTES.find((n) => n.id === p.id);
      if (!note) return fail('NOT_FOUND', '这条批注不存在');
      if (p.content !== undefined) note.content = p.content;
      // null 表示清空，undefined 表示不改动
      if (p.url !== undefined) note.url = p.url ?? undefined;
      return ok(note);
    },
    async delete(p) {
      await delay(60);
      if (!NOTES.some((n) => n.id === p.id)) return fail('NOT_FOUND', '这条批注不存在');
      removeWhere(NOTES, (n) => n.id === p.id);
      return ok(undefined);
    },
    async convertToTask(p) {
      await delay(60);
      const note = NOTES.find((n) => n.id === p.id);
      if (!note) return fail('NOT_FOUND', '这条批注不存在');
      if (note.convertedTaskId) return fail('CONFLICT', '这条已经转成任务了');
      const origin = note.taskId ? TASKS.find((t) => t.id === note.taskId) : undefined;
      const projectId = p.projectId ?? origin?.projectId;
      const created: StoredTask = {
        id: `t_${Date.now()}`,
        projectId,
        depth: 1,
        title: note.content,
        moduleId:
          p.moduleId ??
          origin?.moduleId ??
          PROJECTS.find((x) => x.id === projectId)?.defaultModuleId ??
          'other',
        isDone: false,
        sortOrder: TASKS.length + 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      TASKS.push(created);
      note.convertedTaskId = created.id;
      return ok(toTask(created));
    },
    async quickCapture(p) {
      await delay();
      const note: Note = {
        id: `n_${Date.now()}`,
        kind: p.kind ?? 'note',
        content: p.content,
        createdAt: Date.now(),
      };
      NOTES.unshift(note);
      return ok(note);
    },
  },
  import: {
    async parse(p) {
      await delay();
      return ok(parseImport(p.rawText));
    },
  },
  review: {
    async getWeek(p) {
      await delay();
      const review: WeeklyReview = {
        weekStart: p.weekStart,
        summary: buildSummary(p.weekStart),
        goals: [],
      };
      return ok(review);
    },
    async summary(p) {
      await delay();
      return ok(buildSummary(p.weekStart));
    },
    async listWeeks() {
      await delay();
      const thisWeek = weekStartOf(TODAY);
      // 由近到远列最近几周，本周还没冻结，往前的都算已确认
      return ok(
        Array.from({ length: 6 }, (_, i) => ({
          weekStart: addDays(thisWeek, -7 * i),
          confirmed: i > 0,
        })),
      );
    },
  },
  stats: {
    async timeline(p) {
      await delay();
      return ok({
        planned: SCHEDULE.filter((e) => isoDateOf(e.startAt) === p.date),
        actual: entriesOn(p.date),
      });
    },
    async moduleTime() {
      await delay();
      const list = MODULES.map((m) => ({
        moduleId: m.id as ModuleId,
        totalMs: TIME_ENTRIES.filter((t) => t.moduleId === m.id).reduce(
          (s, t) => s + ((t.endedAt ?? 0) - t.startedAt),
          0,
        ),
      })).filter((x) => x.totalMs > 0);
      return ok(list);
    },
    async homeSummary() {
      await delay();
      const summary: HomeSummary = {
        projects: PROJECTS.filter((p) => p.status === 'active').map(toProjectWithProgress),
        habits: HABITS.map((h) => ({
          ...h,
          currentStreak: HABIT_STREAK[h.id]?.current ?? 0,
          longestStreak: HABIT_STREAK[h.id]?.longest ?? 0,
          todayStatus: HABIT_TODAY[h.id],
        })),
        moduleTimeToday: moduleTotals(entriesOn(TODAY)),
      };
      return ok(summary);
    },
  },
  backup: {
    async exportJson() {
      await delay();
      return ok({ filePath: '~/Downloads/taskflow-backup.json' });
    },
  },
};
