import type { ModuleId } from '@shared/types';

/** PRD 4.3 限定最多三级 */
export const MAX_DEPTH = 3;

export interface OutlineRow {
  id: string;
  parentId?: string;
  /** 新建同级行时跟着它走，这样在首页队列的项目分块里加行也落在对的项目下 */
  projectId?: string;
  /** 真实层级（1..3），三级上限按它判定 */
  depth: number;
  /** 视觉缩进级，0 起算。首页队列的根行可能本身是第二三级，所以与 depth 分开 */
  indent: number;
  /**
   * 同一块的标识。首页队列按项目分块，跨块不能互相缩进——
   * 否则 Tab 一下就把任务挪进了另一个项目。
   */
  groupKey?: string;
  title: string;
  description?: string;
  isDone: boolean;
  moduleId: ModuleId;
  inToday?: boolean;
}

export function siblingsOf(rows: OutlineRow[], row: OutlineRow): OutlineRow[] {
  return rows.filter((r) => r.parentId === row.parentId && r.groupKey === row.groupKey);
}

export function childrenOf(rows: OutlineRow[], id: string): OutlineRow[] {
  return rows.filter((r) => r.parentId === id);
}

export function indexAmongSiblings(rows: OutlineRow[], row: OutlineRow): number {
  return siblingsOf(rows, row).findIndex((r) => r.id === row.id);
}

/** 这一行连同后代共占几层 */
export function heightOf(rows: OutlineRow[], id: string): number {
  const kids = childrenOf(rows, id);
  return kids.length ? 1 + Math.max(...kids.map((k) => heightOf(rows, k.id))) : 1;
}

export type IndentPlan =
  | { ok: true; parentId: string; position: number }
  | { ok: false; reason: 'no_sibling' | 'too_deep' };

/**
 * Tab 的落点：挂到上一个同级任务下、排在它现有子级之后。
 * 判定用的是「新层级 + 子树高度」——只看被移动那一行，会让带着子任务的行捅破三级。
 */
export function planIndent(rows: OutlineRow[], row: OutlineRow): IndentPlan {
  const siblings = siblingsOf(rows, row);
  const at = siblings.findIndex((r) => r.id === row.id);
  const prev = at > 0 ? siblings[at - 1] : undefined;
  if (!prev) return { ok: false, reason: 'no_sibling' };
  if (row.depth + heightOf(rows, row.id) > MAX_DEPTH) return { ok: false, reason: 'too_deep' };
  return { ok: true, parentId: prev.id, position: childrenOf(rows, prev.id).length };
}

export type OutdentPlan =
  | { ok: true; parentId: string | undefined; position: number }
  | { ok: false; reason: 'already_root' | 'parent_missing' };

/** ⌫ / Shift+Tab 的落点：升到父级的同级、紧跟在原父级后面 */
export function planOutdent(rows: OutlineRow[], row: OutlineRow): OutdentPlan {
  if (!row.parentId) return { ok: false, reason: 'already_root' };
  const parent = rows.find((r) => r.id === row.parentId);
  // 父任务不在这份列表里（例如首页队列只带出了部分层级），这里算不出落点
  if (!parent) return { ok: false, reason: 'parent_missing' };
  return { ok: true, parentId: parent.parentId, position: indexAmongSiblings(rows, parent) + 1 };
}
