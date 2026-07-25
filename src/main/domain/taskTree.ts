import { AppError } from '../errors';

/** PRD 4.3：任务最多三级，再往下的内容记成备注 */
export const MAX_TASK_DEPTH = 3;

/** 树形操作只关心结构，不关心标题与时间，因此用这个最小形状 */
export interface TaskLike {
  id: string;
  parentId?: string;
  projectId?: string;
  depth: number;
  sortOrder: number;
  createdAt: number;
}

export type TreeOf<T> = T & { children: TreeOf<T>[] };

/** 同级顺序由 sortOrder 决定；并列时按创建时间，保证每次返回的顺序稳定 */
function bySortOrder(a: TaskLike, b: TaskLike): number {
  return a.sortOrder - b.sortOrder || a.createdAt - b.createdAt;
}

export function childrenOf<T extends TaskLike>(tasks: T[], parentId?: string): T[] {
  return tasks.filter((t) => (t.parentId ?? undefined) === parentId).sort(bySortOrder);
}

/**
 * 组装成树。父级不在给定集合里的行按根处理——例如按项目取任务时，
 * 父任务被移到别的项目会留下这样的行，丢掉它们等于让任务凭空消失。
 */
export function buildTree<T extends TaskLike>(tasks: T[]): TreeOf<T>[] {
  const known = new Set(tasks.map((t) => t.id));
  const byParent = new Map<string | undefined, T[]>();

  for (const task of tasks) {
    const key = task.parentId && known.has(task.parentId) ? task.parentId : undefined;
    const bucket = byParent.get(key);
    if (bucket) bucket.push(task);
    else byParent.set(key, [task]);
  }

  const expand = (parentId: string | undefined): TreeOf<T>[] =>
    (byParent.get(parentId) ?? [])
      .slice()
      .sort(bySortOrder)
      .map((task) => ({ ...task, children: expand(task.id) }));

  return expand(undefined);
}

/** 根到父的链条，供抽屉的面包屑用 */
export function ancestorsOf<T extends TaskLike>(tasks: T[], taskId: string): T[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const chain: T[] = [];
  let cursor = byId.get(taskId)?.parentId;

  // 深度上限是 3，循环天然有界；仍留一个保险计数，脏数据成环时不至于挂死
  for (let guard = 0; cursor && guard <= MAX_TASK_DEPTH; guard++) {
    const parent = byId.get(cursor);
    if (!parent) break;
    chain.unshift(parent);
    cursor = parent.parentId;
  }
  return chain;
}

/** 自身 + 全部后代，删除与移动都要按整棵子树处理 */
export function subtreeIds<T extends TaskLike>(tasks: T[], rootId: string): string[] {
  const ids = [rootId];
  for (let i = 0; i < ids.length; i++) {
    for (const child of tasks.filter((t) => t.parentId === ids[i])) {
      if (!ids.includes(child.id)) ids.push(child.id);
    }
  }
  return ids;
}

/** 子树还有多高：叶子为 0，带一层子任务为 1。决定它还能不能往下塞 */
export function subtreeHeight<T extends TaskLike>(tasks: T[], rootId: string): number {
  const children = tasks.filter((t) => t.parentId === rootId);
  if (children.length === 0) return 0;
  return 1 + Math.max(...children.map((c) => subtreeHeight(tasks, c.id)));
}

export interface ReparentUpdate {
  id: string;
  depth: number;
  projectId?: string;
}

/**
 * 算出把一个任务挂到新父级下面之后，它和它的后代各自的新层级与所属项目。
 * 校验放在这里而不是 SQL 里：depth CHECK 只拦得住单行，拦不住「把一棵两层的子树
 * 挂到第二级」这种整体越界，那会让第四层悄悄出现。
 *
 * `newParentId` 为空表示升为顶层。移动到新父级时项目跟随父级——
 * 子任务和父任务分属两个项目，进度就没法算了。
 */
export function planReparent<T extends TaskLike>(
  tasks: T[],
  taskId: string,
  newParentId?: string,
  fallbackProjectId?: string,
): ReparentUpdate[] {
  const task = tasks.find((t) => t.id === taskId);
  if (!task) throw new AppError('NOT_FOUND', '任务不存在');

  const family = subtreeIds(tasks, taskId);
  let baseDepth = 1;
  let projectId = fallbackProjectId;

  if (newParentId) {
    if (family.includes(newParentId)) {
      throw new AppError('CONFLICT', '不能把任务移动到它自己或它的子任务下面');
    }
    const parent = tasks.find((t) => t.id === newParentId);
    if (!parent) throw new AppError('NOT_FOUND', '目标父任务不存在');
    baseDepth = parent.depth + 1;
    projectId = parent.projectId;
  }

  if (baseDepth + subtreeHeight(tasks, taskId) > MAX_TASK_DEPTH) {
    throw new AppError('DEPTH_EXCEEDED', '任务最多三级，再往下的内容请记为备注');
  }

  const shift = baseDepth - task.depth;
  return family.map((id) => {
    const node = tasks.find((t) => t.id === id)!;
    return { id, depth: node.depth + shift, projectId };
  });
}

/** 新建时的层级：跟在父级下一层，超出三级直接拒绝 */
export function depthForNewChild(parent?: TaskLike): number {
  const depth = parent ? parent.depth + 1 : 1;
  if (depth > MAX_TASK_DEPTH) {
    throw new AppError('DEPTH_EXCEEDED', '任务最多三级，再往下的内容请记为备注');
  }
  return depth;
}
