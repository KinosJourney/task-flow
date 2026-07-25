import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';

/**
 * Drizzle 表定义，与 docs/data-model.md 的建表 SQL 一一对应。
 * 表按里程碑追加，迁移 append-only，永不修改已发布的历史迁移。
 * M0：app_meta（4.12）。M1：modules、projects、tasks、task_events、notes。
 * M2：today_entries、time_entries、daily_focus、daily_focus_tasks。
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
  /**
   * 用户手动指定的 Next Task（tasks.pinNext）。是用户的明确选择，
   * 重开应用该还记得，所以落库而不是放内存；只有一个值，不值得为它建表。
   */
  pinnedNextTaskId: 'pinned_next_task_id',
} as const;

/** 生活模块（data-model 4.1）。内容由 src/shared/modules.ts 在启动时对齐 */
export const modules = sqliteTable('modules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

/** 项目（data-model 4.2）。进度与累计时间都是派生值，不落库 */
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  goal: text('goal'),
  defaultModuleId: text('default_module_id')
    .notNull()
    .references(() => modules.id),
  /**
   * 下一步行动指向的任务。这里**不加外键**：projects 与 tasks 互相引用会成环，
   * SQLite 建表顺序无解。改由仓储层在删除任务时清掉指针（repo/tasks.ts）。
   */
  nextActionTaskId: text('next_action_task_id'),
  notes: text('notes'),
  status: text('status', { enum: ['active', 'archived'] })
    .notNull()
    .default('active'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * 任务（data-model 4.3）。最多三级，由 depth CHECK 与插入/移动时的校验共同保证。
 * 队列归属不在这里：任务在哪天的队列里是 today_entries 的事（M2），
 * 放一个 in_today 布尔列就说不清「昨天那行」和「今天那行」的区别。
 */
export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').references(() => projects.id),
    parentId: text('parent_id').references((): AnySQLiteColumn => tasks.id),
    depth: integer('depth').notNull().default(1),
    title: text('title').notNull(),
    /** 任务描述：大纲编辑器里 Shift+Enter 写的那段，与 notes 的批注不是一回事 */
    description: text('description'),
    moduleId: text('module_id')
      .notNull()
      .references(() => modules.id),
    isDone: integer('is_done', { mode: 'boolean' }).notNull().default(false),
    doneAt: integer('done_at'),
    dueDate: text('due_date'),
    scheduledAt: integer('scheduled_at'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('idx_tasks_project').on(t.projectId),
    index('idx_tasks_parent').on(t.parentId),
    check('tasks_depth_range', sql`${t.depth} between 1 and 3`),
  ],
);

/**
 * 任务事件流（data-model 4.11）。历史追溯不靠按天快照，靠这里。
 * type: created/completed/reopened/moved/added_to_today/removed_from_today
 *       /postponed/returned_to_pool/split/abandoned
 */
export const taskEvents = sqliteTable(
  'task_events',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    payload: text('payload'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('idx_taskevents_task').on(t.taskId),
    index('idx_taskevents_time').on(t.createdAt),
  ],
);

/** 批注（data-model 4.8）：备注/想法/问题/链接。不进待办统计，也不进进度计算 */
export const notes = sqliteTable(
  'notes',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['note', 'idea', 'question', 'link'] }).notNull(),
    content: text('content').notNull(),
    url: text('url'),
    /** 想法/问题转正后生成的任务；同样不加外键，理由同 projects.next_action_task_id */
    convertedTaskId: text('converted_task_id'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('idx_notes_task').on(t.taskId)],
);

/**
 * 今日队列，按天归属（data-model 1.1、4.4）：一个任务在哪天的队列里出现过就永久留在那天。
 * 顺延是往新的一天 INSERT 一行，原来那天的行不动，于是每一天的画面都能精确还原。
 * `UNIQUE(date, task_id)` 让重复顺延幂等。
 */
export const todayEntries = sqliteTable(
  'today_entries',
  {
    id: text('id').primaryKey(),
    /** YYYY-MM-DD，这一行归属哪天的队列 */
    date: text('date').notNull(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    unique('today_entries_date_task').on(t.date, t.taskId),
    index('idx_today_date').on(t.date),
    index('idx_today_task').on(t.taskId),
  ],
);

/**
 * 计时区间（data-model 1.2、4.5）。存区间而非日累计，跨天与多段天然成立：
 * 暂停 = 结束当前段，继续 = 开一条新段。`ended_at IS NULL` 表示进行中，
 * 同一时刻全表最多一条，由仓储层在开始计时时先结束旧段来保证。
 */
export const timeEntries = sqliteTable(
  'time_entries',
  {
    id: text('id').primaryKey(),
    /** 可空：支持先无任务计时、结束后再归类。删任务时置空而不是删记录，见 repo/timeEntries.ts */
    taskId: text('task_id').references(() => tasks.id),
    /**
     * 模块快照：记录产生时任务属于哪个模块就固定下来。任务日后改了模块，
     * 不会篡改历史周复盘的时间统计口径（data-model 1.2）。
     */
    moduleId: text('module_id').references(() => modules.id),
    startedAt: integer('started_at').notNull(),
    /** NULL = 进行中 */
    endedAt: integer('ended_at'),
    source: text('source', { enum: ['timer', 'manual'] })
      .notNull()
      .default('timer'),
    note: text('note'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('idx_time_task').on(t.taskId), index('idx_time_started').on(t.startedAt)],
);

/**
 * 今日三件事（data-model 4.7）。按 date + slot upsert：新的一天 date 变了就是空白，
 * 旧记录按日期天然归档可回看，不自动复制（验收标准 3）。
 */
export const dailyFocus = sqliteTable(
  'daily_focus',
  {
    id: text('id').primaryKey(),
    /** YYYY-MM-DD */
    date: text('date').notNull(),
    slot: integer('slot').notNull(),
    content: text('content'),
    projectId: text('project_id').references(() => projects.id),
    isDone: integer('is_done', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    unique('daily_focus_date_slot').on(t.date, t.slot),
    check('daily_focus_slot_range', sql`${t.slot} between 1 and 3`),
  ],
);

/** 一件事可关联多个任务（PRD 4.4）。推荐引擎的 focus_linked 规则读的就是这张表 */
export const dailyFocusTasks = sqliteTable(
  'daily_focus_tasks',
  {
    focusId: text('focus_id')
      .notNull()
      .references(() => dailyFocus.id, { onDelete: 'cascade' }),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.focusId, t.taskId] })],
);
