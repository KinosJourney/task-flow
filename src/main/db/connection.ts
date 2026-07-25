import path from 'node:path';
import Database from 'better-sqlite3';
import { app } from 'electron';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

let sqliteInstance: Database.Database | null = null;
let drizzleInstance: BetterSQLite3Database<typeof schema> | null = null;

export function getDbPath(): string {
  return path.join(app.getPath('userData'), 'taskflow.db');
}

/** 单例：多连接会导致 database is locked（architecture.md 第 4 节）。 */
export function getSqlite(): Database.Database {
  if (sqliteInstance) return sqliteInstance;
  const sqlite = new Database(getDbPath());
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 3000');
  sqliteInstance = sqlite;
  return sqlite;
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (drizzleInstance) return drizzleInstance;
  drizzleInstance = drizzle(getSqlite(), { schema });
  return drizzleInstance;
}

/**
 * 换掉底层连接。用于测试：仓储层跑在真实的 SQLite 上（`:memory:`）才算验证过，
 * 但测试环境没有 Electron 的 userData 目录，所以连接从外面注入。
 */
export function useSqlite(sqlite: Database.Database): void {
  sqliteInstance = sqlite;
  drizzleInstance = drizzle(sqlite, { schema });
}

export function closeDb(): void {
  sqliteInstance?.close();
  sqliteInstance = null;
  drizzleInstance = null;
}

function pragmaValue(name: string): string {
  const rows = getSqlite().pragma(name) as Record<string, unknown>[];
  const first = rows[0];
  return first ? String(Object.values(first)[0]) : '';
}

export function getJournalMode(): string {
  return pragmaValue('journal_mode');
}

export function getForeignKeys(): boolean {
  return pragmaValue('foreign_keys') === '1';
}
