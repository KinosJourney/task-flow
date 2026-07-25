import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { getDb } from './connection';
import { seedModules } from './seedModules';

/**
 * 迁移文件所在目录。开发/未打包时在项目根的 drizzle/（相对已构建的
 * out/main 定位，不依赖启动方式）；打包后由 electron-builder 的
 * extraResources 复制到 resources/drizzle。
 */
export function getMigrationsFolder(): string {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'drizzle')]
    : [path.resolve(__dirname, '../../drizzle'), path.join(app.getAppPath(), 'drizzle')];

  const found = candidates.find((dir) => fs.existsSync(path.join(dir, 'meta', '_journal.json')));
  if (!found) {
    throw new Error(`找不到迁移目录，已尝试: ${candidates.join(', ')}`);
  }
  return found;
}

/** 在建窗之前执行（architecture.md 第 4 节）。 */
export function runMigrations(): void {
  migrate(getDb(), { migrationsFolder: getMigrationsFolder() });
  seedModules();
}
