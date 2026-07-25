import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { FALLBACK_MODULE_ID } from '@shared/modules';
import type {
  CreateTaskInput,
  ModuleId,
  MoveTaskInput,
  Task,
  TaskDetail,
  TaskFull,
  TaskNode,
  UpdateTaskInput,
} from '@shared/types';
import { getDb } from '../db/connection';
import { projects, tasks } from '../db/schema';
import {
  ancestorsOf,
  buildTree,
  depthForNewChild,
  planReparent,
  subtreeIds,
  type TaskLike,
} from '../domain/taskTree';
import { AppError } from '../errors';
import { newId, type DbLike } from './db';
import { clearConvertedPointers, getNote, listNotesByTask, markNoteConverted } from './notes';
import { recordTaskEvent } from './taskEvents';

type TaskRow = typeof tasks.$inferSelect;

/**
 * 行 -> 领域对象。`inToday` 与 `totalTimeMs` 在 M1 恒为默认值：
 * 队列归属（today_entries）与计时区间（time_entries）都是 M2 的表，
 * 这里先给出契约要求的形状，等表建好再接上真实来源。
 */
function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.projectId ?? undefined,
    parentId: row.parentId ?? undefined,
    depth: row.depth,
    title: row.title,
    description: row.description ?? undefined,
    moduleId: row.moduleId as ModuleId,
    isDone: row.isDone,
    doneAt: row.doneAt ?? undefined,
    inToday: false,
    dueDate: row.dueDate ?? undefined,
    scheduledAt: row.scheduledAt ?? undefined,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function allRows(db: DbLike = getDb()): TaskRow[] {
  return db.select().from(tasks).all();
}

function getRow(id: string, db: DbLike = getDb()): TaskRow {
  const row = db.select().from(tasks).where(eq(tasks.id, id)).get();
  if (!row) throw new AppError('NOT_FOUND', '任务不存在');
  return row;
}

/** 结构操作只要这几列，转成领域层的最小形状 */
function toTaskLike(row: TaskRow): TaskLike {
  return {
    id: row.id,
    parentId: row.parentId ?? undefined,
    projectId: row.projectId ?? undefined,
    depth: row.depth,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
  };
}

/**
 * 同级的范围：挂在父任务下时就是它的全部子级；顶层任务则是同一项目内的顶层任务，
 * 没有项目的散任务自成一组。
 */
function siblingScope(parentId: string | null, projectId: string | null) {
  if (parentId !== null) return eq(tasks.parentId, parentId);
  return and(
    isNull(tasks.parentId),
    projectId === null ? isNull(tasks.projectId) : eq(tasks.projectId, projectId),
  );
}

/**
 * 把一组同级任务的 sortOrder 重排成 1..n。移动之后立刻整理，
 * 免得反复插队之后序号挤在一起分不出先后。
 */
function resequence(
  db: DbLike,
  parentId: string | null,
  projectId: string | null,
  moved?: { id: string; position?: number },
): void {
  const rows = db
    .select()
    .from(tasks)
    .where(siblingScope(parentId, projectId))
    .all()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);

  let ordered = rows.map((r) => r.id);
  if (moved?.position !== undefined) {
    ordered = ordered.filter((id) => id !== moved.id);
    ordered.splice(Math.max(0, Math.min(moved.position, ordered.length)), 0, moved.id);
  }

  ordered.forEach((id, index) => {
    db.update(tasks).set({ sortOrder: index + 1 }).where(eq(tasks.id, id)).run();
  });
}

function nextSortOrder(db: DbLike, parentId: string | null, projectId: string | null): number {
  const rows = db.select().from(tasks).where(siblingScope(parentId, projectId)).all();
  return rows.reduce((max, row) => Math.max(max, row.sortOrder), 0) + 1;
}

function projectNameOf(projectId: string | null, db: DbLike = getDb()): string | undefined {
  if (!projectId) return undefined;
  return db.select().from(projects).where(eq(projects.id, projectId)).get()?.name;
}

/**
 * TaskDetail 比 Task 多出展示所需的三样。`totalTimeMs` 与 `linkedFocusSlot`
 * 分别要等 time_entries 与 daily_focus（M2）才有真实来源。
 */
function toTaskDetail(row: TaskRow, db: DbLike = getDb()): TaskDetail {
  return {
    ...toTask(row),
    projectName: projectNameOf(row.projectId, db),
    totalTimeMs: 0,
    notes: listNotesByTask(row.id, db),
    linkedFocusSlot: undefined,
  };
}

export function getTask(id: string): TaskFull {
  const db = getDb();
  const row = getRow(id, db);
  const rows = allRows(db);
  const titles = new Map(rows.map((r) => [r.id, r.title]));

  return {
    ...toTaskDetail(row, db),
    children: db
      .select()
      .from(tasks)
      .where(eq(tasks.parentId, id))
      .orderBy(asc(tasks.sortOrder))
      .all()
      .map(toTask),
    ancestors: ancestorsOf(rows.map(toTaskLike), id).map((a) => ({
      id: a.id,
      title: titles.get(a.id) ?? '',
    })),
  };
}

/** 项目下的三级任务树 */
export function listTaskTree(projectId: string): TaskNode[] {
  const rows = getDb().select().from(tasks).where(eq(tasks.projectId, projectId)).all();
  return buildTree(rows.map(toTask));
}

/** 进度计算的数据源：全量取一次，按项目分桶算，避免每个项目查一次库 */
export function listProgressTasks(): { id: string; parentId?: string; projectId?: string; isDone: boolean }[] {
  return allRows().map((row) => ({
    id: row.id,
    parentId: row.parentId ?? undefined,
    projectId: row.projectId ?? undefined,
    isDone: row.isDone,
  }));
}

export function createTask(input: CreateTaskInput): Task {
  return getDb().transaction((tx) => {
    const parent = input.parentId ? getRow(input.parentId, tx) : undefined;
    const depth = depthForNewChild(parent ? toTaskLike(parent) : undefined);

    const title = input.title.trim();
    if (!title) throw new AppError('VALIDATION', '任务标题不能为空');

    // 子任务跟随父任务的项目：父子分属两个项目，进度就没法算了
    const projectId = parent ? parent.projectId : (input.projectId ?? null);
    const project = projectId
      ? tx.select().from(projects).where(eq(projects.id, projectId)).get()
      : undefined;
    if (projectId && !project) throw new AppError('NOT_FOUND', '项目不存在');

    const now = Date.now();
    const row: TaskRow = {
      id: newId('t'),
      projectId,
      parentId: parent?.id ?? null,
      depth,
      title,
      description: input.description?.trim() || null,
      // 模块默认继承：父任务 -> 项目默认模块 -> 兜底（PRD 4.1）
      moduleId: input.moduleId ?? parent?.moduleId ?? project?.defaultModuleId ?? FALLBACK_MODULE_ID,
      isDone: false,
      doneAt: null,
      dueDate: null,
      scheduledAt: null,
      sortOrder: nextSortOrder(tx, parent?.id ?? null, projectId),
      createdAt: now,
      updatedAt: now,
    };

    tx.insert(tasks).values(row).run();
    recordTaskEvent(row.id, 'created', undefined, tx);
    return toTask(row);
  });
}

export function updateTask(input: UpdateTaskInput): Task {
  return getDb().transaction((tx) => {
    const row = getRow(input.id, tx);
    const patch: Partial<TaskRow> = { updatedAt: Date.now() };

    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) throw new AppError('VALIDATION', '任务标题不能为空');
      patch.title = title;
    }
    if (input.description !== undefined) patch.description = input.description?.trim() || null;
    if (input.moduleId !== undefined) patch.moduleId = input.moduleId;
    if (input.dueDate !== undefined) patch.dueDate = input.dueDate;
    if (input.scheduledAt !== undefined) patch.scheduledAt = input.scheduledAt;

    /*
     * 改所属项目会连同整棵子树一起搬，并把任务提到顶层：子任务留在原项目、
     * 父任务跑到新项目，两边的进度都会算错。
     */
    if (input.projectId !== undefined && input.projectId !== row.projectId) {
      const target = input.projectId ?? null;
      if (target && !tx.select().from(projects).where(eq(projects.id, target)).get()) {
        throw new AppError('NOT_FOUND', '项目不存在');
      }
      const structure = allRows(tx).map(toTaskLike);
      for (const update of planReparent(structure, row.id, undefined, target ?? undefined)) {
        tx.update(tasks)
          .set({ depth: update.depth, projectId: target, updatedAt: Date.now() })
          .where(eq(tasks.id, update.id))
          .run();
      }
      patch.parentId = null;
      patch.sortOrder = nextSortOrder(tx, null, target);
      recordTaskEvent(row.id, 'moved', { projectId: target }, tx);
    }

    tx.update(tasks).set(patch).where(eq(tasks.id, row.id)).run();
    return toTask(getRow(row.id, tx));
  });
}

/**
 * 移动任务：换父级、换项目、调同级顺序。大纲编辑器的 Tab / Shift+Tab 走的就是这里，
 * 所以深度校验按整棵子树来算（domain/taskTree.planReparent）。
 */
export function moveTask(input: MoveTaskInput): Task {
  return getDb().transaction((tx) => {
    const row = getRow(input.id, tx);
    const structure = allRows(tx).map(toTaskLike);

    const oldParentId = row.parentId;
    const oldProjectId = row.projectId;
    const changesParent = input.parentId !== undefined;
    const newParentId = changesParent ? (input.parentId ?? null) : oldParentId;

    let newProjectId = oldProjectId;
    if (newParentId !== null) {
      newProjectId = getRow(newParentId, tx).projectId;
    } else if (input.projectId !== undefined) {
      newProjectId = input.projectId;
    }

    if (changesParent || newProjectId !== oldProjectId) {
      const updates = planReparent(
        structure,
        row.id,
        newParentId ?? undefined,
        newProjectId ?? undefined,
      );
      for (const update of updates) {
        tx.update(tasks)
          .set({ depth: update.depth, projectId: newProjectId, updatedAt: Date.now() })
          .where(eq(tasks.id, update.id))
          .run();
      }
      tx.update(tasks)
        .set({ parentId: newParentId, updatedAt: Date.now() })
        .where(eq(tasks.id, row.id))
        .run();
      recordTaskEvent(row.id, 'moved', { parentId: newParentId, projectId: newProjectId }, tx);
    }

    resequence(tx, newParentId, newProjectId, { id: row.id, position: input.position });
    // 离开的那一组也要补齐序号，否则中间会留个洞
    if (newParentId !== oldParentId || newProjectId !== oldProjectId) {
      resequence(tx, oldParentId, oldProjectId);
    }

    return toTask(getRow(row.id, tx));
  });
}

export function setTaskDone(id: string, done: boolean): Task {
  return getDb().transaction((tx) => {
    getRow(id, tx);
    const now = Date.now();
    tx.update(tasks)
      .set({ isDone: done, doneAt: done ? now : null, updatedAt: now })
      .where(eq(tasks.id, id))
      .run();
    recordTaskEvent(id, done ? 'completed' : 'reopened', undefined, tx);
    return toTask(getRow(id, tx));
  });
}

export function deleteTask(id: string): void {
  getDb().transaction((tx) => {
    const structure = allRows(tx).map(toTaskLike);
    if (!structure.some((t) => t.id === id)) throw new AppError('NOT_FOUND', '任务不存在');

    const ids = subtreeIds(structure, id);
    // 指向被删任务的两处指针都没有外键（见 db/schema.ts），得手动清
    tx.update(projects)
      .set({ nextActionTaskId: null })
      .where(inArray(projects.nextActionTaskId, ids))
      .run();
    clearConvertedPointers(ids, tx);

    // 自底向上删：parent_id 外键是立即校验的，先删父级会让子级悬空
    for (const taskId of [...ids].reverse()) {
      tx.delete(tasks).where(eq(tasks.id, taskId)).run();
    }
  });
}

/** 想法/问题转为正式任务：新任务落在原任务所属的项目里，原批注留下指针 */
export function convertNoteToTask(input: {
  id: string;
  projectId?: string;
  moduleId?: ModuleId;
}): Task {
  const note = getNote(input.id);
  if (note.convertedTaskId) throw new AppError('CONFLICT', '这条已经转成任务了');

  const origin = note.taskId ? getRow(note.taskId) : undefined;
  const created = createTask({
    title: note.content,
    projectId: input.projectId ?? origin?.projectId ?? undefined,
    moduleId: input.moduleId ?? (origin?.moduleId as ModuleId | undefined),
  });
  markNoteConverted(note.id, created.id);
  return created;
}
