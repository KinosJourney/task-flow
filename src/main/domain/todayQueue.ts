import { isoDateOf } from '@shared/date';
import type {
  BacklogItem,
  ModuleId,
  TaskDetail,
  TodayBacklog,
  TodayEntryStatus,
  TodayQueueGroup,
  TodayQueueNode,
} from '@shared/types';

/**
 * 今日队列的派生规则（data-model 1.1、ipc-contract 4.1）。队列按天归属：
 * 一个任务在哪天的队列里出现过就永久留在那天，跨天不做任何自动搬运。
 * 「那天的画面」全靠这里从 today_entries + tasks 还原出来。
 *
 * 这一层只决定结构——哪些节点露面、各自什么状态、怎么排序分组；
 * 每一行展示成什么由 `detailOf` 从仓储层填进来，于是规则可以脱离数据库单测。
 */

/** 算队列结构只要这几列 */
export interface QueueTask {
  id: string;
  parentId?: string;
  projectId?: string;
  isDone: boolean;
  doneAt?: number;
  sortOrder: number;
}

/** today_entries 的一行 */
export interface QueueEntry {
  date: string;
  taskId: string;
  sortOrder: number;
}

/** 分块标题要的项目信息 */
export interface QueueProject {
  id: string;
  name: string;
  defaultModuleId: ModuleId;
}

export interface QueueInput {
  date: string;
  tasks: QueueTask[];
  entries: QueueEntry[];
  projects: QueueProject[];
  detailOf: (taskId: string) => TaskDetail;
}

/** 排到最后：整块做完、或当天已达成的根项都用它当排序键 */
const LAST = Number.MAX_SAFE_INTEGER;

interface Index {
  byId: Map<string, QueueTask>;
  childrenOf: Map<string, QueueTask[]>;
  /** date -> taskId -> sortOrder，回答「某天队列里有没有它、排第几」 */
  queued: Map<string, Map<string, number>>;
}

function buildIndex(tasks: QueueTask[], entries: QueueEntry[]): Index {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const childrenOf = new Map<string, QueueTask[]>();
  for (const task of tasks) {
    if (!task.parentId) continue;
    const siblings = childrenOf.get(task.parentId);
    if (siblings) siblings.push(task);
    else childrenOf.set(task.parentId, [task]);
  }
  for (const siblings of childrenOf.values()) {
    siblings.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const queued = new Map<string, Map<string, number>>();
  for (const entry of entries) {
    let byTask = queued.get(entry.date);
    if (!byTask) {
      byTask = new Map();
      queued.set(entry.date, byTask);
    }
    byTask.set(entry.taskId, entry.sortOrder);
  }

  return { byId, childrenOf, queued };
}

function isQueuedOn(index: Index, taskId: string, date: string): boolean {
  return index.queued.get(date)?.has(taskId) ?? false;
}

/**
 * 这行在**它所属那一天**的状态。完成状态只有一份（`is_done`/`done_at`），
 * 但「那天有没有做完」是行级的：昨天没做完、今天顺延后完成，
 * 昨天那行要如实显示成没做完，今天那行才是达成。
 */
export function statusOn(task: QueueTask, date: string): TodayEntryStatus {
  if (!task.isDone) return 'pending';
  if (task.doneAt === undefined) return 'done';
  // 完成于这天之后 = 那天终究没做完；完成于这天或更早都算这天的成果
  return isoDateOf(task.doneAt) > date ? 'done_later' : 'done';
}

/**
 * 某天的队列里该不该显示这个后代节点。没做完的一直跟着父任务露面；
 * 已完成的只在**它完成的那天**露面。于是顺延一个「子任务做了一半」的父任务时，
 * 昨天做完的子任务不跟到今天，今天看到的只剩没做完的分支（PRD 5.4）。
 * 自己在那天有队列行的无条件显示。
 */
function visibleOn(index: Index, task: QueueTask, date: string): boolean {
  if (isQueuedOn(index, task.id, date)) return true;
  if (!task.isDone) return true;
  return task.doneAt !== undefined && isoDateOf(task.doneAt) === date;
}

/** 父级链上有没有任务也在那天的队列里。有的话自己就不是根行，避免同一件事出现两次 */
function hasAncestorQueuedOn(index: Index, task: QueueTask, date: string): boolean {
  let cursor = task.parentId ? index.byId.get(task.parentId) : undefined;
  // 最多三级，深度天然有界；guard 只为防脏数据成环
  for (let guard = 0; cursor && guard < 3; guard++) {
    if (isQueuedOn(index, cursor.id, date)) return true;
    cursor = cursor.parentId ? index.byId.get(cursor.parentId) : undefined;
  }
  return false;
}

/**
 * 这个任务此前最早出现在哪天的队列里。有值说明当天这行是顺延来的，
 * 用来告诉用户「这件事拖了几天」。
 */
export function carriedFrom(
  entries: QueueEntry[],
  taskId: string,
  date: string,
): string | undefined {
  let earliest: string | undefined;
  for (const entry of entries) {
    if (entry.taskId !== taskId || entry.date >= date) continue;
    if (!earliest || entry.date < earliest) earliest = entry.date;
  }
  return earliest;
}

/** 队列行的子级：后代里那天该露面的。按 sortOrder 保持结构顺序，完成**不**沉底 */
function queueChildren(input: QueueInput, index: Index, parentId: string): TodayQueueNode[] {
  return (index.childrenOf.get(parentId) ?? [])
    .filter((child) => visibleOn(index, child, input.date))
    .map((child) => ({
      ...input.detailOf(child.id),
      status: statusOn(child, input.date),
      children: queueChildren(input, index, child.id),
    }));
}

/** 计入块内展示出来的每个节点，含被父任务带出的子任务 */
function countNodes(nodes: TodayQueueNode[]): { todo: number; done: number } {
  return nodes.reduce(
    (acc, node) => {
      const sub = countNodes(node.children);
      // done_later 算在 todo 里：那天它确实没做完
      const done = node.status === 'done';
      return {
        todo: acc.todo + sub.todo + (done ? 0 : 1),
        done: acc.done + sub.done + (done ? 1 : 0),
      };
    },
    { todo: 0, done: 0 },
  );
}

export function buildTodayQueue(input: QueueInput): TodayQueueGroup[] {
  const index = buildIndex(input.tasks, input.entries);
  const orderOf = (taskId: string) => index.queued.get(input.date)?.get(taskId) ?? LAST;

  const roots = input.entries
    .filter((entry) => entry.date === input.date)
    .map((entry) => index.byId.get(entry.taskId))
    .filter((task): task is QueueTask => Boolean(task))
    .filter((task) => !hasAncestorQueuedOn(index, task, input.date))
    .sort((a, b) => {
      // 当天达成的沉到块末尾而不是消失，让那天的成果一直看得见
      const aDone = statusOn(a, input.date) === 'done';
      const bDone = statusOn(b, input.date) === 'done';
      if (aDone !== bDone) return aDone ? 1 : -1;
      if (aDone && bDone) return (a.doneAt ?? 0) - (b.doneAt ?? 0);
      return orderOf(a.id) - orderOf(b.id);
    });

  const projectById = new Map(input.projects.map((p) => [p.id, p]));
  const groups = new Map<string, TodayQueueGroup>();

  for (const task of roots) {
    // 散任务归入 projectId 为空的那一块
    const key = task.projectId ?? '';
    let group = groups.get(key);
    if (!group) {
      const project = task.projectId ? projectById.get(task.projectId) : undefined;
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
      ...input.detailOf(task.id),
      status: statusOn(task, input.date),
      carriedFrom: carriedFrom(input.entries, task.id, input.date),
      children: queueChildren(input, index, task.id),
    });
  }

  /** 块的排序依据：还没达成的最靠前那一项的队列序，于是用户的手动排序仍然说了算 */
  const groupRank = (items: TodayQueueNode[]) => {
    const pending = items.filter((item) => item.status !== 'done');
    return pending.length ? Math.min(...pending.map((item) => orderOf(item.id))) : LAST;
  };

  return [...groups.values()]
    .map((group) => {
      const { todo, done } = countNodes(group.items);
      return { ...group, todoCount: todo, doneCount: done };
    })
    .sort((a, b) => groupRank(a.items) - groupRank(b.items));
}

export interface BacklogInput {
  before: string;
  tasks: QueueTask[];
  entries: QueueEntry[];
  detailOf: (taskId: string) => TaskDetail;
}

/**
 * `before` 之前还没做完的队列项（ipc-contract 4.2）。三条都要满足：
 * 早于 `before` 入过队、任务至今未完成、`before` 那天还没有行（已经顺延过来的不算欠账）。
 * 被父任务带出来的子任务不单列——顺延父任务时它们自然跟着走。
 */
export function buildBacklog(input: BacklogInput): TodayBacklog {
  const index = buildIndex(input.tasks, input.entries);

  const earliest = new Map<string, string>();
  for (const entry of input.entries) {
    if (entry.date >= input.before) continue;
    const known = earliest.get(entry.taskId);
    if (!known || entry.date < known) earliest.set(entry.taskId, entry.date);
  }

  const items: BacklogItem[] = [];
  for (const [taskId, queuedDate] of earliest) {
    const task = index.byId.get(taskId);
    if (!task || task.isDone) continue;
    if (isQueuedOn(index, taskId, input.before)) continue;
    if (hasAncestorQueuedOn(index, task, queuedDate)) continue;
    items.push({ ...input.detailOf(taskId), queuedDate });
  }

  // 拖得最久的排最前面
  items.sort((a, b) => a.queuedDate.localeCompare(b.queuedDate));
  return { items, oldestDate: items[0]?.queuedDate };
}
