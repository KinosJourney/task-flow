import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const drizzleDir = path.resolve(__dirname, '../drizzle');

interface Journal {
  entries: { idx: number; tag: string }[];
}

/**
 * 迁移是 append-only 的：改了 schema 忘记 drizzle-kit generate，
 * 或误删历史迁移，都会在这里暴露，而不是等到运行时启动失败。
 */
describe('drizzle 迁移', () => {
  const journalPath = path.join(drizzleDir, 'meta', '_journal.json');

  it('journal 存在且每条记录都有对应的 SQL 文件', () => {
    expect(fs.existsSync(journalPath)).toBe(true);

    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as Journal;
    expect(journal.entries.length).toBeGreaterThan(0);

    for (const entry of journal.entries) {
      expect(fs.existsSync(path.join(drizzleDir, `${entry.tag}.sql`))).toBe(true);
    }
  });

  it('首个迁移建出 app_meta 表', () => {
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as Journal;
    const first = journal.entries.find((e) => e.idx === 0);
    expect(first).toBeDefined();

    const sql = fs.readFileSync(path.join(drizzleDir, `${first!.tag}.sql`), 'utf8');
    expect(sql).toContain('CREATE TABLE `app_meta`');
  });
});
