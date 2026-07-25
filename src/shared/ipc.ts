import type {
  CreateProjectInput,
  CreateTaskInput,
  DailyFocus,
  DbCheckResult,
  HabitWithStreak,
  HomeSummary,
  ImportPreview,
  ModuleId,
  MoveTaskInput,
  Note,
  NoteKind,
  NextTaskResult,
  PingResult,
  Project,
  ProjectWithProgress,
  ScheduleEvent,
  Task,
  TaskFull,
  TaskNode,
  TimeEntry,
  TimelineData,
  TodayBacklog,
  TodayQueueGroup,
  UpdateProjectInput,
  UpdateTaskInput,
  WeeklyReview,
  WeeklySummary,
} from './types';

export type ErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'DEPTH_EXCEEDED'
  | 'IMPORT_PARSE'
  | 'BACKUP_IO'
  | 'INTERNAL';

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string } };

/** 频道名统一 `域.动作`，由 preload 与主进程 handler 共用同一份常量。 */
export const CHANNELS = {
  systemPing: 'system.ping',
  systemDbCheck: 'system.dbCheck',

  modulesList: 'modules.list',

  projectsList: 'projects.list',
  projectsCreate: 'projects.create',
  projectsUpdate: 'projects.update',
  projectsArchive: 'projects.archive',
  projectsReorder: 'projects.reorder',

  tasksTree: 'tasks.tree',
  tasksGet: 'tasks.get',
  tasksCreate: 'tasks.create',
  tasksUpdate: 'tasks.update',
  tasksMove: 'tasks.move',
  tasksComplete: 'tasks.complete',
  tasksReopen: 'tasks.reopen',
  tasksDelete: 'tasks.delete',

  notesListByTask: 'notes.listByTask',
  notesCreate: 'notes.create',
  notesUpdate: 'notes.update',
  notesDelete: 'notes.delete',
  notesConvertToTask: 'notes.convertToTask',
  notesQuickCapture: 'notes.quickCapture',
} as const;

export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS];

/**
 * Api 的形状与 docs/ipc-contract.md 对应。第一版 UI 用 mock 实现，
 * 之后在 Electron 中由 preload 暴露的 window.api 提供同一形状。
 */
export interface Api {
  /** 打通渲染进程到数据库的最小链路：ping 验证桥，dbCheck 验证原生模块与读写 */
  system: {
    ping(p?: { message?: string }): Promise<IpcResult<PingResult>>;
    dbCheck(): Promise<IpcResult<DbCheckResult>>;
  };
  modules: {
    list(): Promise<IpcResult<import('./types').Module[]>>;
  };
  projects: {
    /** 列表即详情的数据源：进度与累计时间都在这里，详情页再配一次 tasks.tree 就够了 */
    list(p?: { status?: 'active' | 'archived' }): Promise<IpcResult<ProjectWithProgress[]>>;
    create(p: CreateProjectInput): Promise<IpcResult<Project>>;
    update(p: UpdateProjectInput): Promise<IpcResult<Project>>;
    /** 归档而非删除：任务与历史时间都留着，只是不再出现在活跃列表 */
    archive(p: { id: string }): Promise<IpcResult<Project>>;
    reorder(p: { orderedIds: string[] }): Promise<IpcResult<void>>;
  };
  tasks: {
    tree(p: { projectId: string }): Promise<IpcResult<TaskNode[]>>;
    /** 任务详情抽屉的数据源：一次拉齐批注、计时汇总、直接子级与祖先面包屑 */
    get(p: { id: string }): Promise<IpcResult<TaskFull>>;
    getNext(p: { now: number; excludeTaskId?: string }): Promise<IpcResult<NextTaskResult>>;
    create(p: CreateTaskInput): Promise<IpcResult<Task>>;
    update(p: UpdateTaskInput): Promise<IpcResult<Task>>;
    /** 换父级/换项目/调同级顺序；超过三级返回 DEPTH_EXCEEDED */
    move(p: MoveTaskInput): Promise<IpcResult<Task>>;
    complete(p: { id: string }): Promise<IpcResult<Task>>;
    reopen(p: { id: string }): Promise<IpcResult<Task>>;
    delete(p: { id: string }): Promise<IpcResult<void>>;
    /** 手动指定下一件事；`id: null` 取消指定，回到自动推荐 */
    pinNext(p: { id: string | null }): Promise<IpcResult<void>>;
  };
  today: {
    /** 某天的队列，按项目分块、块内展开子任务；散任务归入没有 projectId 的那一块 */
    list(p: { date: string }): Promise<IpcResult<TodayQueueGroup[]>>;
    add(p: { taskId: string; date: string }): Promise<IpcResult<void>>;
    remove(p: { taskId: string; date: string }): Promise<IpcResult<void>>;
    /** `date` 之前还没做完的队列项。顺延是手动的，先让用户看见有多少 */
    backlog(p: { before: string }): Promise<IpcResult<TodayBacklog>>;
    /**
     * 一键顺延：把遗留项插入 `date` 那天的队列，原来那天的行**保持不动**。
     * 省略 `taskIds` 表示把 `date` 之前的全部遗留一次带过来。
     */
    carryOver(p: { date: string; taskIds?: string[] }): Promise<IpcResult<{ carriedCount: number }>>;
  };
  focus: {
    getDay(p: { date: string }): Promise<IpcResult<DailyFocus[]>>;
    /** 按 date + slot upsert；content 传空字符串表示清空该槽 */
    set(p: { date: string; slot: number; content?: string; projectId?: string }): Promise<
      IpcResult<DailyFocus>
    >;
    toggleDone(p: { focusId: string; isDone: boolean }): Promise<IpcResult<DailyFocus>>;
  };
  timer: {
    active(): Promise<IpcResult<TimeEntry | null>>;
    start(p: { taskId?: string; now: number }): Promise<IpcResult<TimeEntry>>;
    stop(p: { now: number }): Promise<IpcResult<TimeEntry | null>>;
    /** 某任务的全部计时分段，供任务详情抽屉的计时记录分区 */
    listByTask(p: { taskId: string }): Promise<IpcResult<TimeEntry[]>>;
  };
  schedule: {
    listRange(p: { from: number; to: number }): Promise<IpcResult<ScheduleEvent[]>>;
  };
  habits: {
    list(): Promise<IpcResult<HabitWithStreak[]>>;
  };
  notes: {
    listByTask(p: { taskId: string }): Promise<IpcResult<Note[]>>;
    create(p: { taskId?: string; kind: NoteKind; content: string; url?: string }): Promise<IpcResult<Note>>;
    update(p: { id: string; content?: string; url?: string | null }): Promise<IpcResult<Note>>;
    delete(p: { id: string }): Promise<IpcResult<void>>;
    /** 想法/问题转为正式任务，回填 convertedTaskId */
    convertToTask(p: { id: string; projectId?: string; moduleId?: ModuleId }): Promise<IpcResult<Task>>;
    quickCapture(p: { content: string; kind?: NoteKind }): Promise<IpcResult<Note>>;
  };
  import: {
    parse(p: { rawText: string }): Promise<IpcResult<ImportPreview>>;
  };
  review: {
    getWeek(p: { weekStart: string }): Promise<IpcResult<WeeklyReview>>;
    summary(p: { weekStart: string }): Promise<IpcResult<WeeklySummary>>;
    listWeeks(): Promise<IpcResult<{ weekStart: string; confirmed: boolean }[]>>;
  };
  stats: {
    timeline(p: { date: string }): Promise<IpcResult<TimelineData>>;
    moduleTime(p: { from: number; to: number }): Promise<IpcResult<{ moduleId: ModuleId; totalMs: number }[]>>;
    homeSummary(): Promise<IpcResult<HomeSummary>>;
  };
  backup: {
    exportJson(): Promise<IpcResult<{ filePath: string }>>;
  };
}

/**
 * preload 按里程碑逐个方法实现 Api：已实现的走真实 IPC，其余回落到 mock
 * （见 src/renderer/lib/api.ts）。粒度是方法而不是整个域——像 `tasks` 这样
 * 横跨两个里程碑的域（CRUD 在 M1、getNext 在 M2），否则没法分批接上去。
 */
export type PartialApi = { [K in keyof Api]?: Partial<Api[K]> };

declare global {
  interface Window {
    api?: PartialApi;
  }
}
