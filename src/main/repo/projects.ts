import { asc, eq } from 'drizzle-orm';
import type {
  CreateProjectInput,
  ModuleId,
  Project,
  ProjectDetail,
  ProjectWithProgress,
  UpdateProjectInput,
} from '@shared/types';
import { getDb } from '../db/connection';
import { projects } from '../db/schema';
import { emptyProgress, progressByProject } from '../domain/progress';
import { AppError } from '../errors';
import { newId, type DbLike } from './db';
import { listNotesByProject } from './notes';
import { findTask, listProgressTasks, listTaskTree } from './tasks';
import { projectTimeTotals } from './timeEntries';

type ProjectRow = typeof projects.$inferSelect;

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    goal: row.goal ?? undefined,
    defaultModuleId: row.defaultModuleId as ModuleId,
    nextActionTaskId: row.nextActionTaskId ?? undefined,
    notes: row.notes ?? undefined,
    status: row.status,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function getRow(id: string, db: DbLike = getDb()): ProjectRow {
  const row = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!row) throw new AppError('NOT_FOUND', '项目不存在');
  return row;
}

/**
 * 项目列表带实时进度与累计时间。两者都不落库（data-model 第 5 节），
 * 每次现算——落成可变字段迟早会和任务、计时段对不上。
 */
export function listProjects(status: 'active' | 'archived' = 'active'): ProjectWithProgress[] {
  const rows = getDb()
    .select()
    .from(projects)
    .where(eq(projects.status, status))
    .orderBy(asc(projects.sortOrder))
    .all();

  const progress = progressByProject(listProgressTasks());
  const time = projectTimeTotals();
  return rows.map((row) => ({
    ...toProject(row),
    progress: progress.get(row.id) ?? emptyProgress(),
    totalTimeMs: time.get(row.id) ?? 0,
  }));
}

/**
 * 项目详情：列表里那份进度之外，再带上任务树、下一步指向的任务和项目内批注。
 * 一次取齐是因为详情页这三块要同时画出来，分成三个频道只会让页面分三次闪。
 * `nextActionTaskId` 可能指向已删除的任务（那一列没有外键），所以查不到就当没有。
 */
export function getProject(id: string): ProjectDetail {
  const db = getDb();
  const row = getRow(id, db);

  return {
    ...toProject(row),
    progress: progressByProject(listProgressTasks()).get(row.id) ?? emptyProgress(),
    totalTimeMs: projectTimeTotals().get(row.id) ?? 0,
    tree: listTaskTree(row.id),
    nextAction: row.nextActionTaskId ? findTask(row.nextActionTaskId, db) : undefined,
    taskNotes: listNotesByProject(row.id, db),
  };
}

export function createProject(input: CreateProjectInput): Project {
  const name = input.name.trim();
  if (!name) throw new AppError('VALIDATION', '项目名称不能为空');

  const db = getDb();
  const now = Date.now();
  const maxOrder = db
    .select()
    .from(projects)
    .all()
    .reduce((max, row) => Math.max(max, row.sortOrder), 0);

  const row: ProjectRow = {
    id: newId('p'),
    name,
    goal: input.goal?.trim() || null,
    defaultModuleId: input.defaultModuleId,
    nextActionTaskId: null,
    notes: input.notes?.trim() || null,
    status: 'active',
    sortOrder: maxOrder + 1,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(projects).values(row).run();
  return toProject(row);
}

export function updateProject(input: UpdateProjectInput): Project {
  const db = getDb();
  const row = getRow(input.id, db);
  const patch: Partial<ProjectRow> = { updatedAt: Date.now() };

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new AppError('VALIDATION', '项目名称不能为空');
    patch.name = name;
  }
  if (input.goal !== undefined) patch.goal = input.goal;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.defaultModuleId !== undefined) patch.defaultModuleId = input.defaultModuleId;
  if (input.nextActionTaskId !== undefined) patch.nextActionTaskId = input.nextActionTaskId;
  if (input.status !== undefined) patch.status = input.status;

  db.update(projects).set(patch).where(eq(projects.id, row.id)).run();
  return toProject(getRow(row.id, db));
}

/** 归档不是删除：项目下的任务与历史时间都留着，只是不再出现在活跃列表里 */
export function archiveProject(id: string): Project {
  return updateProject({ id, status: 'archived' });
}

export function reorderProjects(orderedIds: string[]): void {
  const db = getDb();
  db.transaction((tx) => {
    orderedIds.forEach((id, index) => {
      tx.update(projects)
        .set({ sortOrder: index + 1, updatedAt: Date.now() })
        .where(eq(projects.id, id))
        .run();
    });
  });
}
