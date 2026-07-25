import { app } from 'electron';
import { eq } from 'drizzle-orm';
import type { DbCheckResult } from '@shared/types';
import { getDb, getDbPath, getForeignKeys, getJournalMode } from './connection';
import { appMeta, META_KEYS } from './schema';

function readMeta(key: string): string | undefined {
  const rows = getDb().select().from(appMeta).where(eq(appMeta.key, key)).all();
  return rows[0]?.value;
}

function writeMeta(key: string, value: string): void {
  getDb()
    .insert(appMeta)
    .values({ key, value })
    .onConflictDoUpdate({ target: appMeta.key, set: { value } })
    .run();
}

/**
 * M0 验收用的一次完整读写：写入自检时间与计数后立即读回。
 * 两条路径（npm run dev / 打包安装包）都要跑通，见 architecture.md 5.4。
 */
export function runDbSelfCheck(now = Date.now()): DbCheckResult {
  const previousCount = Number(readMeta(META_KEYS.dbCheckCount) ?? '0');
  const writeCount = previousCount + 1;

  writeMeta(META_KEYS.lastDbCheckAt, String(now));
  writeMeta(META_KEYS.dbCheckCount, String(writeCount));

  const readBackAt = Number(readMeta(META_KEYS.lastDbCheckAt) ?? '0');

  return {
    dbPath: getDbPath(),
    journalMode: getJournalMode(),
    foreignKeys: getForeignKeys(),
    packaged: app.isPackaged,
    nativeModuleOk: readBackAt === now,
    writtenAt: now,
    readBackAt,
    writeCount,
  };
}
