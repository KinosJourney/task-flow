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
  /** 任务描述：大纲编辑器里 Shift+Enter 写的那段正文，与 notes 的批注不是一回事 */
  description?: string;
  moduleId: ModuleId;
  isDone: boolean;
  doneAt?: number;
  /**
   * 今天的队列里是否有它。**派生值**，不是 tasks 表的列：队列按天归属（见 data-model 1.1），
   * 「在队列里」必须先说是哪一天，这里固定问的是今天，供「加入/移出今日队列」这类开关用。
   */
  inToday: boolean;
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
 * 队列行在**它所属那一天**的状态。完成状态是任务级的（`is_done`/`done_at` 只有一份），
 * 但「那天有没有做完」是行级的：同一个任务昨天没做完、今天顺延后完成，
 * 昨天那行该显示成「当天没做完」，今天那行才是「达成」。
 */
export type TodayEntryStatus =
  /** 至今未完成 */
  | 'pending'
  /** 就在那天完成的 */
  | 'done'
  /** 那天没做完，后来某天才完成 */
  | 'done_later';

/**
 * 今日队列里的一行。子级是队列任务的**全部后代**，不管后代自己有没有加入今日——
 * 首页要能直接看到「这件事拆开是什么」，而不是只看到一个笼统的父任务标题。
 * 因此 `inToday === false` 的节点表示它是被父任务带出来的上下文，不是独立队列项。
 */
export interface TodayQueueNode extends TaskDetail {
  status: TodayEntryStatus;
  /** 有值说明这行是顺延来的，值是它最早出现在队列里的那天。只有根行会有 */
  carriedFrom?: string;
  children: TodayQueueNode[];
}

export interface BacklogItem extends TaskDetail {
  /** 最早进入队列的那天，用来说明这件事拖了多久 */
  queuedDate: string;
}

/** 今天之前遗留的未完成队列项。顺延是手动的，所以这些东西要先被看见 */
export interface TodayBacklog {
  /** 按最早入队日期升序：拖得最久的排最前面 */
  items: BacklogItem[];
  /** 最早那天，用于「最久的一项拖了 N 天」的文案 */
  oldestDate?: string;
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

/** `today_entries` 一行：某个任务归属某一天的队列。见 data-model 1.1 */
export interface TodayEntry {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  taskId: string;
  /** 当天队列内的手动排序 */
  sortOrder: number;
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
  description?: string;
  projectId?: string;
  parentId?: string;
  moduleId?: ModuleId;
  inToday?: boolean;
}

/** null 表示清空该可选字段，undefined 表示不改动 */
export interface UpdateTaskInput {
  id: string;
  title?: string;
  description?: string | null;
  moduleId?: ModuleId;
  projectId?: string | null;
  dueDate?: string | null;
  scheduledAt?: number | null;
}

/**
 * 改任务在树里的位置：换父级、换项目、调同级顺序。大纲编辑器的
 * Tab / Shift+Tab 与拖拽排序都走这里，深度按整棵子树校验。
 */
export interface MoveTaskInput {
  id: string;
  /** `null` 升为顶层；省略表示不改父级。移动到父级下时项目跟随父级 */
  parentId?: string | null;
  /** 仅在不改父级时生效；`null` 表示变成不属于任何项目的散任务 */
  projectId?: string | null;
  /** 同级中的目标位置（0 基）。省略表示留在原位或放到末尾 */
  position?: number;
}

export interface CreateProjectInput {
  name: string;
  goal?: string;
  defaultModuleId: ModuleId;
  notes?: string;
}

/** null 表示清空该可选字段，undefined 表示不改动 */
export interface UpdateProjectInput {
  id: string;
  name?: string;
  goal?: string | null;
  defaultModuleId?: ModuleId;
  nextActionTaskId?: string | null;
  notes?: string | null;
  status?: 'active' | 'archived';
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
