import { addDays, todayIso } from '@/lib/date';
import type {
  DailyFocus,
  Habit,
  HabitLogStatus,
  Module,
  Note,
  Project,
  ScheduleEvent,
  Task,
  TimeEntry,
} from '@shared/types';

export const MODULES: Module[] = [
  { id: 'work', name: '工作', color: '#ff5d5d', sortOrder: 1 },
  { id: 'hobby', name: '兴趣', color: '#ff9f43', sortOrder: 2 },
  { id: 'growth', name: '个人提升', color: '#5b8def', sortOrder: 3 },
  { id: 'sport', name: '运动', color: '#22c1a4', sortOrder: 4 },
  { id: 'diet', name: '饮食', color: '#f6c445', sortOrder: 5 },
  { id: 'expense', name: '支出', color: '#a66cff', sortOrder: 6 },
  { id: 'social', name: '人际', color: '#ff6fb5', sortOrder: 7 },
  { id: 'other', name: '其他', color: '#8a94a6', sortOrder: 8 },
];

const now = Date.now();
const HOUR = 3600_000;
const MIN = 60_000;
export const TODAY = todayIso();
export const YESTERDAY = addDays(TODAY, -1);
export const DAY_BEFORE = addDays(TODAY, -2);

/** 某天的某个钟点。`dayOffset` 让样例数据能铺到前几天，日期切换才有东西可看 */
function at(h: number, m = 0, dayOffset = 0): number {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

export const PROJECTS: Project[] = [
  {
    id: 'p_togoal',
    name: 'ToGoal',
    goal: '把周目标、项目和今日执行连起来',
    defaultModuleId: 'work',
    nextActionTaskId: 't_next_card',
    notes: '核心闭环优先，视觉最后打磨。',
    status: 'active',
    sortOrder: 1,
    createdAt: now - 30 * 24 * HOUR,
    updatedAt: now,
  },
  {
    id: 'p_furdiary',
    name: 'FurDiary',
    goal: '记录每天的小事与心情',
    defaultModuleId: 'hobby',
    nextActionTaskId: 't_fur_layout',
    status: 'active',
    sortOrder: 2,
    createdAt: now - 20 * 24 * HOUR,
    updatedAt: now,
  },
  {
    id: 'p_cheki',
    name: 'ChekiKaeshi',
    goal: '整理拍立得收藏与交换记录',
    defaultModuleId: 'hobby',
    status: 'active',
    sortOrder: 3,
    createdAt: now - 10 * 24 * HOUR,
    updatedAt: now,
  },
];

export const TASKS: Task[] = [
  mkTask('t_next_card', 'p_togoal', undefined, 1, '实现 Next Task 主卡片交互', 'work', {
    inToday: true,
    todaySortOrder: 1,
    dueDate: TODAY,
  }),
  mkTask('t_card_layout', 'p_togoal', 't_next_card', 2, '主卡片的分镜布局', 'work', {
    sortOrder: 1,
    isDone: true,
    doneAt: at(11, 30),
  }),
  mkTask('t_card_actions', 'p_togoal', 't_next_card', 2, '四个操作按钮的状态机', 'work', {
    sortOrder: 2,
  }),
  mkTask('t_card_swap', 'p_togoal', 't_card_actions', 3, '「换一个」的排除逻辑', 'work', {}),
  mkTask('t_recommend', 'p_togoal', undefined, 1, '打磨推荐理由的气泡文案', 'work', {
    inToday: true,
    todaySortOrder: 2,
  }),
  mkTask('t_progress', 'p_togoal', undefined, 1, '项目进度按叶子任务计算', 'work', {
    isDone: true,
    doneAt: at(12, 0, -1),
  }),
  mkTask('t_timeline', 'p_togoal', undefined, 1, '时间轴区分计划与实际', 'work', {}),
  mkTask('t_fur_layout', 'p_furdiary', undefined, 1, '设计日记卡片的分镜布局', 'hobby', {
    inToday: true,
    todaySortOrder: 3,
  }),
  mkTask('t_fur_export', 'p_furdiary', undefined, 1, '导出为图片', 'hobby', {}),
  mkTask('t_cheki_scan', 'p_cheki', undefined, 1, '扫描本月新增拍立得', 'hobby', {}),
  mkTask('t_run', undefined, undefined, 1, '慢跑 3 公里', 'sport', {
    inToday: true,
    todaySortOrder: 4,
  }),
  mkTask('t_read', undefined, undefined, 1, '读《重构》一章', 'growth', { inToday: true, todaySortOrder: 5 }),
];

function mkTask(
  id: string,
  projectId: string | undefined,
  parentId: string | undefined,
  depth: number,
  title: string,
  moduleId: Task['moduleId'],
  opts: Partial<Task>,
): Task {
  return {
    id,
    projectId,
    parentId,
    depth,
    title,
    moduleId,
    isDone: false,
    inToday: false,
    todaySortOrder: 0,
    sortOrder: 0,
    createdAt: now - 5 * 24 * HOUR,
    updatedAt: now,
    ...opts,
  };
}

export const NOTES: Note[] = [
  {
    id: 'n1',
    taskId: 't_next_card',
    kind: 'idea',
    content: '主卡片完成时来个「达成！」的拟声词分镜。',
    createdAt: now - 2 * HOUR,
  },
  {
    id: 'n2',
    taskId: 't_next_card',
    kind: 'question',
    content: '「换一个」要不要限制次数？',
    createdAt: now - 1 * HOUR,
  },
  {
    id: 'n3',
    taskId: 't_next_card',
    kind: 'note',
    content: '卡片内不要放网点，装饰只留在卡片外围。',
    createdAt: now - 40 * MIN,
  },
  {
    id: 'n4',
    taskId: 't_next_card',
    kind: 'link',
    content: '分镜排版参考',
    url: 'https://example.com/comic-panel-layout',
    createdAt: now - 20 * MIN,
  },
];

export const FOCUS: DailyFocus[] = [
  { id: 'f1', date: TODAY, slot: 1, content: '完成 Next Task 卡片', projectId: 'p_togoal', isDone: false, taskIds: ['t_next_card'] },
  { id: 'f2', date: TODAY, slot: 2, content: '读一章技术书', isDone: false, taskIds: ['t_read'] },
  { id: 'f3', date: TODAY, slot: 3, content: '慢跑放松', isDone: false, taskIds: ['t_run'] },
  { id: 'f1y', date: YESTERDAY, slot: 1, content: '把项目进度算对', projectId: 'p_togoal', isDone: true, taskIds: ['t_progress'] },
  { id: 'f2y', date: YESTERDAY, slot: 2, content: '整理拍立得清单', projectId: 'p_cheki', isDone: true, taskIds: [] },
  { id: 'f3y', date: YESTERDAY, slot: 3, content: '拉伸 15 分钟', isDone: false, taskIds: [] },
  { id: 'f1b', date: DAY_BEFORE, slot: 1, content: '定下时间轴的画法', projectId: 'p_togoal', isDone: true, taskIds: ['t_timeline'] },
  { id: 'f2b', date: DAY_BEFORE, slot: 2, content: '给日记卡片起个稿', projectId: 'p_furdiary', isDone: false, taskIds: [] },
];

export const TIME_ENTRIES: TimeEntry[] = [
  { id: 'te1', taskId: 't_progress', moduleId: 'work', startedAt: at(9, 10), endedAt: at(10, 25), source: 'timer' },
  { id: 'te2', taskId: 't_next_card', moduleId: 'work', startedAt: at(10, 40), endedAt: at(11, 30), source: 'timer' },
  { id: 'te3', taskId: 't_fur_layout', moduleId: 'hobby', startedAt: at(14, 0), endedAt: at(14, 45), source: 'manual' },
  { id: 'te1y', taskId: 't_progress', moduleId: 'work', startedAt: at(9, 30, -1), endedAt: at(12, 0, -1), source: 'timer' },
  { id: 'te2y', taskId: 't_cheki_scan', moduleId: 'hobby', startedAt: at(14, 15, -1), endedAt: at(15, 40, -1), source: 'timer' },
  { id: 'te3y', taskId: 't_read', moduleId: 'growth', startedAt: at(21, 0, -1), endedAt: at(21, 35, -1), source: 'manual' },
  { id: 'te1b', taskId: 't_timeline', moduleId: 'work', startedAt: at(10, 0, -2), endedAt: at(11, 50, -2), source: 'timer' },
  { id: 'te2b', taskId: 't_run', moduleId: 'sport', startedAt: at(18, 10, -2), endedAt: at(18, 55, -2), source: 'timer' },
];

export const SCHEDULE: ScheduleEvent[] = [
  { id: 's1', title: '晨会', startAt: at(9, 0), endAt: at(9, 30), moduleId: 'work' },
  { id: 's2', taskId: 't_run', title: '慢跑', startAt: at(18, 0), endAt: at(18, 40), moduleId: 'sport' },
  { id: 's1y', title: '晨会', startAt: at(9, 0, -1), endAt: at(9, 30, -1), moduleId: 'work' },
  { id: 's2y', title: '和设计对一版配色', startAt: at(16, 0, -1), endAt: at(17, 0, -1), moduleId: 'work' },
  { id: 's1b', title: '晨会', startAt: at(9, 0, -2), endAt: at(9, 30, -2), moduleId: 'work' },
  // 未来日期只有计划没有实际，正好体现时间轴两条轨的区别
  { id: 's1t', title: '晨会', startAt: at(9, 0, 1), endAt: at(9, 30, 1), moduleId: 'work' },
  { id: 's2t', taskId: 't_fur_export', title: '做导出功能', startAt: at(10, 0, 1), endAt: at(12, 0, 1), moduleId: 'hobby' },
];

export const HABITS: Habit[] = [
  { id: 'h_water', name: '喝够 8 杯水', moduleId: 'diet', repeatType: 'daily', isPaused: false },
  { id: 'h_read', name: '阅读 30 分钟', moduleId: 'growth', repeatType: 'daily', isPaused: false },
  { id: 'h_gym', name: '力量训练', moduleId: 'sport', repeatType: 'weekly_count', weeklyTarget: 3, isPaused: false },
];

export const HABIT_TODAY: Record<string, HabitLogStatus | undefined> = {
  h_water: 'done',
  h_read: undefined,
  h_gym: 'done',
};

export const HABIT_STREAK: Record<string, { current: number; longest: number }> = {
  h_water: { current: 6, longest: 21 },
  h_read: { current: 3, longest: 12 },
  h_gym: { current: 2, longest: 8 },
};

export const CONTINUOUS_WORK_MIN = 5;
export { HOUR, MIN };
