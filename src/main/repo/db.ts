import { randomUUID } from 'node:crypto';
import { getDb } from '../db/connection';

/** 事务句柄的类型：drizzle 没导出它，从 transaction 的回调参数上取 */
export type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

/** 仓储函数统一接受「库或事务」，于是可以自由地组合进更大的事务 */
export type DbLike = ReturnType<typeof getDb> | Tx;

/** 主键用应用层生成的 id，导出恢复时引用才稳定（data-model 开头的约定）。前缀纯粹为了肉眼可读 */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
