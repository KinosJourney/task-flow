import type { Module, ModuleId } from './types';

/**
 * 八个生活模块（PRD 4.1）。id 用稳定 slug 而非自增，导出恢复与代码引用都靠它。
 * 这里是唯一的事实来源：数据库的 modules 表在每次启动时按它对齐（src/main/db/seedModules.ts），
 * 因此改颜色或改名只要动这一处。
 */
export const MODULE_SEED: readonly Module[] = [
  { id: 'work', name: '工作', color: '#ff5d5d', sortOrder: 1 },
  { id: 'hobby', name: '兴趣', color: '#ff9f43', sortOrder: 2 },
  { id: 'growth', name: '个人提升', color: '#5b8def', sortOrder: 3 },
  { id: 'sport', name: '运动', color: '#22c1a4', sortOrder: 4 },
  { id: 'diet', name: '饮食', color: '#f6c445', sortOrder: 5 },
  { id: 'expense', name: '支出', color: '#a66cff', sortOrder: 6 },
  { id: 'social', name: '人际', color: '#ff6fb5', sortOrder: 7 },
  { id: 'other', name: '其他', color: '#8a94a6', sortOrder: 8 },
];

export const MODULE_IDS = MODULE_SEED.map((m) => m.id) as [ModuleId, ...ModuleId[]];

/** 无法判断模块时的兜底：一个任务只归属一个主模块，不允许为空 */
export const FALLBACK_MODULE_ID: ModuleId = 'other';
