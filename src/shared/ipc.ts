import type {
  CreateTaskInput,
  DailyFocus,
  DbCheckResult,
  HabitWithStreak,
  HomeSummary,
  ImportPreview,
  ModuleId,
  Note,
  NoteKind,
  NextTaskResult,
  PingResult,
  ProjectWithProgress,
  ScheduleEvent,
  Task,
  TaskFull,
  TaskNode,
  TimeEntry,
  TimelineData,
  TodayQueueGroup,
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
    list(p?: { status?: 'active' | 'archived' }): Promise<IpcResult<ProjectWithProgress[]>>;
  };
  tasks: {
    tree(p: { projectId: string }): Promise<IpcResult<TaskNode[]>>;
    /** 任务详情抽屉的数据源：一次拉齐批注、计时汇总、直接子级与祖先面包屑 */
    get(p: { id: string }): Promise<IpcResult<TaskFull>>;
    getNext(p: { now: number; excludeTaskId?: string }): Promise<IpcResult<NextTaskResult>>;
    create(p: CreateTaskInput): Promise<IpcResult<Task>>;
    update(p: UpdateTaskInput): Promise<IpcResult<Task>>;
    complete(p: { id: string }): Promise<IpcResult<Task>>;
    reopen(p: { id: string }): Promise<IpcResult<Task>>;
    delete(p: { id: string }): Promise<IpcResult<void>>;
    /** 手动指定下一件事；`id: null` 取消指定，回到自动推荐 */
    pinNext(p: { id: string | null }): Promise<IpcResult<void>>;
  };
  today: {
    /** 按项目分块、块内展开子任务；散任务归入没有 projectId 的那一块 */
    list(): Promise<IpcResult<TodayQueueGroup[]>>;
    add(p: { taskId: string }): Promise<IpcResult<void>>;
    remove(p: { taskId: string }): Promise<IpcResult<void>>;
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
 * preload 按里程碑逐域实现 Api：已实现的域走真实 IPC，未实现的域
 * 由渲染进程回落到 mock（见 src/renderer/lib/api.ts）。
 */
export type PartialApi = { [K in keyof Api]?: Api[K] };

declare global {
  interface Window {
    api?: PartialApi;
  }
}
