import type { Progress } from '@shared/types';

/** 计算进度只需要这三样，因此不依赖完整的 Task，纯函数可脱离数据库单测 */
export interface ProgressTask {
  id: string;
  parentId?: string;
  projectId?: string;
  isDone: boolean;
}

export function emptyProgress(): Progress {
  return { doneLeaves: 0, totalLeaves: 0, ratio: 0 };
}

/** 有子任务的都不是叶子。父级只是容器，把它也算一份会让进度虚高 */
function parentIds(tasks: ProgressTask[]): Set<string> {
  const ids = new Set<string>();
  for (const task of tasks) {
    if (task.parentId) ids.add(task.parentId);
  }
  return ids;
}

function toProgress(leaves: ProgressTask[]): Progress {
  const totalLeaves = leaves.length;
  const doneLeaves = leaves.filter((t) => t.isDone).length;
  return { doneLeaves, totalLeaves, ratio: totalLeaves ? doneLeaves / totalLeaves : 0 };
}

/**
 * 项目进度 = 已完成叶子任务数 ÷ 全部叶子任务数（PRD 第 8 节、验收标准 6）。
 * 备注、想法、问题、链接都不在 tasks 表里，天然不参与；父级任务在这里被排除。
 * 第一版所有叶子权重相同。没有叶子时返回 0，而不是「100% 完成」——
 * 一个还没拆出任何事情的项目，说它做完了是错的。
 */
export function computeProgress(tasks: ProgressTask[]): Progress {
  const parents = parentIds(tasks);
  return toProgress(tasks.filter((t) => !parents.has(t.id)));
}

/**
 * 一次算完所有项目的进度，供项目列表用。叶子的判定是全局的：
 * 子任务始终跟随父任务所在的项目，所以按项目分桶再判定结果相同，但少一次分组。
 * 不属于任何项目的散任务不计入任何项目。
 */
export function progressByProject(tasks: ProgressTask[]): Map<string, Progress> {
  const parents = parentIds(tasks);
  const buckets = new Map<string, ProgressTask[]>();

  for (const task of tasks) {
    if (!task.projectId || parents.has(task.id)) continue;
    const bucket = buckets.get(task.projectId);
    if (bucket) bucket.push(task);
    else buckets.set(task.projectId, [task]);
  }

  return new Map([...buckets].map(([projectId, leaves]) => [projectId, toProgress(leaves)]));
}
