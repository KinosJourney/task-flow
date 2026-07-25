import { asc, eq, inArray } from 'drizzle-orm';
import type { Note, NoteKind } from '@shared/types';
import { getDb } from '../db/connection';
import { notes, tasks } from '../db/schema';
import { AppError } from '../errors';
import { newId, type DbLike } from './db';

type NoteRow = typeof notes.$inferSelect;

export function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    taskId: row.taskId ?? undefined,
    kind: row.kind,
    content: row.content,
    url: row.url ?? undefined,
    convertedTaskId: row.convertedTaskId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listNotesByTask(taskId: string, db: DbLike = getDb()): Note[] {
  return db
    .select()
    .from(notes)
    .where(eq(notes.taskId, taskId))
    .orderBy(asc(notes.createdAt))
    .all()
    .map(toNote);
}

/** 项目内所有任务的批注。详情页一次画完整棵大纲的批注，不必逐行再查 */
export function listNotesByProject(projectId: string, db: DbLike = getDb()): Note[] {
  return db
    .select({ note: notes })
    .from(notes)
    .innerJoin(tasks, eq(notes.taskId, tasks.id))
    .where(eq(tasks.projectId, projectId))
    .orderBy(asc(notes.createdAt))
    .all()
    .map((row) => toNote(row.note));
}

/** 一次取多个任务的批注，避免任务列表逐个查（N+1） */
export function listNotesByTasks(taskIds: string[], db: DbLike = getDb()): Map<string, Note[]> {
  const grouped = new Map<string, Note[]>();
  if (taskIds.length === 0) return grouped;

  for (const row of db.select().from(notes).where(inArray(notes.taskId, taskIds)).all()) {
    if (!row.taskId) continue;
    const bucket = grouped.get(row.taskId);
    if (bucket) bucket.push(toNote(row));
    else grouped.set(row.taskId, [toNote(row)]);
  }
  return grouped;
}

export function getNote(id: string, db: DbLike = getDb()): Note {
  const row = db.select().from(notes).where(eq(notes.id, id)).get();
  if (!row) throw new AppError('NOT_FOUND', '这条批注不存在');
  return toNote(row);
}

export interface CreateNoteInput {
  taskId?: string;
  kind: NoteKind;
  content: string;
  url?: string;
}

export function createNote(input: CreateNoteInput, db: DbLike = getDb()): Note {
  const content = input.content.trim();
  if (!content) throw new AppError('VALIDATION', '内容不能为空');

  const now = Date.now();
  const row: NoteRow = {
    id: newId('n'),
    taskId: input.taskId ?? null,
    kind: input.kind,
    content,
    url: input.url ?? null,
    convertedTaskId: null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(notes).values(row).run();
  return toNote(row);
}

export function updateNote(
  input: { id: string; content?: string; url?: string | null },
  db: DbLike = getDb(),
): Note {
  const existing = getNote(input.id, db);
  const patch: Partial<NoteRow> = { updatedAt: Date.now() };

  if (input.content !== undefined) {
    const content = input.content.trim();
    if (!content) throw new AppError('VALIDATION', '内容不能为空');
    patch.content = content;
  }
  if (input.url !== undefined) patch.url = input.url;

  db.update(notes).set(patch).where(eq(notes.id, existing.id)).run();
  return getNote(existing.id, db);
}

export function deleteNote(id: string, db: DbLike = getDb()): void {
  getNote(id, db);
  db.delete(notes).where(eq(notes.id, id)).run();
}

/** 想法/问题转正后回填指向新任务的指针，原批注保留 */
export function markNoteConverted(id: string, taskId: string, db: DbLike = getDb()): void {
  db.update(notes).set({ convertedTaskId: taskId, updatedAt: Date.now() }).where(eq(notes.id, id)).run();
}

/** 删任务时清掉指向它的转正指针：notes.converted_task_id 没有外键，得手动收拾 */
export function clearConvertedPointers(taskIds: string[], db: DbLike = getDb()): void {
  if (taskIds.length === 0) return;
  db.update(notes)
    .set({ convertedTaskId: null })
    .where(inArray(notes.convertedTaskId, taskIds))
    .run();
}
