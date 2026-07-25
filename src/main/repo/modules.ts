import { asc } from 'drizzle-orm';
import type { Module, ModuleId } from '@shared/types';
import { getDb } from '../db/connection';
import { modules } from '../db/schema';

export function listModules(): Module[] {
  return getDb()
    .select()
    .from(modules)
    .orderBy(asc(modules.sortOrder))
    .all()
    .map((row) => ({
      id: row.id as ModuleId,
      name: row.name,
      color: row.color,
      sortOrder: row.sortOrder,
    }));
}
