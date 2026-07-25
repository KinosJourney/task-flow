import { getDb } from '../db/connection';
import { taskEvents } from '../db/schema';
import { newId, type DbLike } from './db';

/**
 * 任务事件类型（data-model 4.11）。历史追溯与周复盘靠这条流，
 * 而不是按天给任务拍快照。
 */
export type TaskEventType =
  | 'created'
  | 'completed'
  | 'reopened'
  | 'moved'
  | 'added_to_today'
  | 'removed_from_today'
  | 'postponed'
  | 'returned_to_pool'
  | 'split'
  | 'abandoned';

export function recordTaskEvent(
  taskId: string,
  type: TaskEventType,
  payload?: Record<string, unknown>,
  db: DbLike = getDb(),
): void {
  db.insert(taskEvents)
    .values({
      id: newId('ev'),
      taskId,
      type,
      payload: payload ? JSON.stringify(payload) : null,
      createdAt: Date.now(),
    })
    .run();
}
