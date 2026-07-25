export type ModuleId =
  | 'work'
  | 'hobby'
  | 'growth'
  | 'sport'
  | 'diet'
  | 'expense'
  | 'social'
  | 'other';

export interface Module {
  id: ModuleId;
  name: string;
  color: string;
  sortOrder: number;
}

export interface Project {
  id: string;
  name: string;
  goal?: string;
  defaultModuleId: ModuleId;
  nextActionTaskId?: string;
  notes?: string;
  status: 'active' | 'archived';
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface Progress {
  doneLeaves: number;
  totalLeaves: number;
  ratio: number;
}

export interface ProjectWithProgress extends Project {
  progress: Progress;
  totalTimeMs: number;
}

export interface Task {
  id: string;
  projectId?: string;
  parentId?: string;
  depth: number;
  title: string;
  moduleId: ModuleId;
  isDone: boolean;
  doneAt?: number;
  inToday: boolean;
  todaySortOrder: number;
  dueDate?: string;
  scheduledAt?: number;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface TaskDetail extends Task {
  projectName?: string;
  totalTimeMs: number;
  notes: Note[];
  linkedFocusSlot?: number;
}

export interface TaskNode extends Task {
  children: TaskNode[];
}

/**
 * 今日队列里的一行。子级是队列任务的**全部后代**，不管后代自己有没有加入今日——
 * 首页要能直接看到「这件事拆开是什么」，而不是只看到一个笼统的父任务标题。
 * 因此 `inToday === false` 的节点表示它是被父任务带出来的上下文，不是独立队列项。
 */
export interface TodayQueueNode extends TaskDetail {
  children: TodayQueueNode[];
}

/**
 * 今日队列按项目切块：同一项目的任务聚成一块，不属于任何项目的散任务归入
 * `projectId` 为空的那一块。首页不再单列「项目进度」，项目以此形式进入今日队列。
 */
export interface TodayQueueGroup {
  /** 空表示散任务块 */
  projectId?: string;
  projectName?: string;
  /** 项目默认模块，供分块标题的模块色点使用；散任务块没有 */
  moduleId?: ModuleId;
  items: TodayQueueNode[];
  /** 计入块内展示出来的每个节点（含被带出的子任务），它们今天都要动 */
  todoCount: number;
  doneCount: number;
}

export interface TaskAncestor {
  id: string;
  title: string;
}

/**
 * 任务详情抽屉一次拉齐所需的形状：在 TaskDetail 之上补直接子级与祖先面包屑。
 * 只取一层子级——抽屉只展示直接子任务，更深的层级由被点开的子任务自己展示。
 */
export interface TaskFull extends TaskDetail {
  children: Task[];
  ancestors: TaskAncestor[];
}

export interface CreateTaskInput {
  title: string;
  projectId?: string;
  parentId?: string;
  moduleId?: ModuleId;
  inToday?: boolean;
}

/** null 表示清空该可选字段，undefined 表示不改动 */
export interface UpdateTaskInput {
  id: string;
  title?: string;
  moduleId?: ModuleId;
  projectId?: string | null;
  dueDate?: string | null;
  scheduledAt?: number | null;
}

export type NextRule =
  | 'manual_pin'
  | 'active_timer'
  | 'focus_linked'
  | 'in_progress'
  | 'project_next_action'
  | 'today_queue_top'
  | 'module_balance';

export interface NextReason {
  rule: NextRule;
  message: string;
  context?: {
    recentSameModuleCount?: number;
    continuousFocusMs?: number;
    suggestedModuleId?: ModuleId;
    upcomingScheduleAt?: number;
  };
}

export interface NextTaskResult {
  task: TaskDetail | null;
  reason: NextReason | null;
}

export interface DailyFocus {
  id: string;
  date: string;
  slot: number;
  content?: string;
  projectId?: string;
  isDone: boolean;
  taskIds: string[];
}

export interface TimeEntry {
  id: string;
  taskId?: string;
  moduleId?: ModuleId;
  startedAt: number;
  endedAt?: number;
  source: 'timer' | 'manual';
  note?: string;
}

export interface ScheduleEvent {
  id: string;
  taskId?: string;
  title: string;
  startAt: number;
  endAt: number;
  moduleId?: ModuleId;
}

export type HabitRepeatType = 'daily' | 'weekdays' | 'weekly_count';
export type HabitLogStatus = 'done' | 'missed' | 'leave' | 'makeup';

export interface Habit {
  id: string;
  name: string;
  moduleId: ModuleId;
  repeatType: HabitRepeatType;
  repeatWeekdays?: number[];
  weeklyTarget?: number;
  isPaused: boolean;
}

export interface HabitWithStreak extends Habit {
  currentStreak: number;
  longestStreak: number;
  todayStatus?: HabitLogStatus;
}

export type NoteKind = 'note' | 'idea' | 'question' | 'link';

export interface Note {
  id: string;
  taskId?: string;
  kind: NoteKind;
  content: string;
  url?: string;
  convertedTaskId?: string;
  createdAt: number;
}

export interface TimelineData {
  planned: ScheduleEvent[];
  actual: TimeEntry[];
}

export interface HomeSummary {
  projects: ProjectWithProgress[];
  habits: HabitWithStreak[];
  moduleTimeToday: { moduleId: ModuleId; totalMs: number }[];
}

export interface WeeklyGoal {
  id: string;
  weekStart: string;
  content: string;
  projectId?: string;
  sortOrder: number;
}

export interface WeeklySummary {
  weekStart: string;
  moduleTasks: { moduleId: ModuleId; doneCount: number }[];
  moduleTime: { moduleId: ModuleId; totalMs: number }[];
  focusCompletion: { total: number; done: number };
  habitCompletion: { habitId: string; name: string; doneCount: number; streak: number }[];
  unfinishedInQueue: number;
}

export interface WeeklyReview {
  weekStart: string;
  summary: WeeklySummary;
  bestResult?: string;
  blockers?: string;
  energy?: string;
  lessons?: string;
  nextWeekGoal?: string;
  confirmedAt?: number;
  goals: WeeklyGoal[];
}

export interface ImportPreviewItem {
  lineNo: number;
  parsedKind: 'task' | 'note' | 'date_header' | 'project_header';
  depth?: number;
  content: string;
  isDone?: boolean;
}

export interface ImportPreview {
  items: ImportPreviewItem[];
}

export interface PingResult {
  pong: true;
  echo: string;
  at: number;
  versions: { electron: string; chrome: string; node: string };
}

/** 数据库自检结果：M0 用它证明 dev 与打包两条路径都能打开并读写 SQLite。 */
export interface DbCheckResult {
  dbPath: string;
  journalMode: string;
  foreignKeys: boolean;
  packaged: boolean;
  nativeModuleOk: boolean;
  /** 写入后再读回来的时间戳，相等即代表一次完整读写成功 */
  writtenAt: number;
  readBackAt: number;
  writeCount: number;
}
