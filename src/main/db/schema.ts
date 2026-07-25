import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Drizzle 表定义，与 docs/data-model.md 的建表 SQL 一一对应。
 * M0 只建 app_meta（4.12）：业务表按里程碑推进时以新的迁移文件追加，
 * 迁移 append-only，永不修改已发布的历史迁移。
 */
export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** app_meta 中已使用的键 */
export const META_KEYS = {
  /** 导出 JSON 的格式版本（M8 恢复时按此迁移） */
  formatVersion: 'format_version',
  /** 最近一次数据库自检时间（毫秒） */
  lastDbCheckAt: 'last_db_check_at',
  /** 自检累计次数，用于确认写入真的落盘 */
  dbCheckCount: 'db_check_count',
} as const;
