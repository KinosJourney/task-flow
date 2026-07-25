import { sql } from 'drizzle-orm';
import { MODULE_SEED } from '@shared/modules';
import { getDb } from './connection';
import { modules } from './schema';

/**
 * 把 modules 表对齐到 src/shared/modules.ts。八个模块是固定枚举而不是用户数据，
 * 所以每次启动都 upsert：改了名字或配色，下次启动即生效，不必再写一条迁移。
 * 只覆盖显示属性，id 保持稳定，引用它的项目与任务不受影响。
 */
export function seedModules(): void {
  const db = getDb();
  const now = MODULE_SEED.map((m) => ({
    id: m.id,
    name: m.name,
    color: m.color,
    sortOrder: m.sortOrder,
  }));

  db.insert(modules)
    .values(now)
    .onConflictDoUpdate({
      target: modules.id,
      set: {
        name: sql`excluded.name`,
        color: sql`excluded.color`,
        sortOrder: sql`excluded.sort_order`,
      },
    })
    .run();
}
