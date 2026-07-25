import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { todayIso } from '@/lib/date';
import type { CreateTaskInput, MoveTaskInput, NoteKind, UpdateTaskInput } from '@shared/types';

/**
 * 改一个任务会牵动很多处展示：模块影响周复盘口径，完成状态影响项目进度与推荐，
 * 计时影响时间轴。所以任务写操作后统一失效这一批，而不是各自挑几个 key。
 */
const TASK_SCOPE = ['task', 'taskTime', 'today', 'backlog', 'nextTask', 'projectTree', 'projects', 'homeSummary', 'timeline', 'timerActive'];

function invalidateTaskScope(qc: QueryClient) {
  for (const key of TASK_SCOPE) {
    void qc.invalidateQueries({ queryKey: [key] });
  }
}

/** M0：验证渲染进程 -> preload -> 主进程 -> SQLite 整条链路 */
export function useEnvCheck() {
  return useQuery({
    queryKey: ['envCheck'],
    queryFn: async () => {
      const ping = unwrap(await api.system.ping({ message: 'hello from renderer' }));
      const db = await api.system.dbCheck();
      return { ping, db };
    },
    retry: false,
  });
}

export function useNextTask(excludeTaskId?: string) {
  return useQuery({
    queryKey: ['nextTask', excludeTaskId ?? null],
    queryFn: async () => unwrap(await api.tasks.getNext({ now: Date.now(), excludeTaskId })),
  });
}

/** 某天的队列。队列按天归属，所以「今日队列」也得说清是哪一天 */
export function useTodayQueue(date: string) {
  return useQuery({
    queryKey: ['today', date],
    queryFn: async () => unwrap(await api.today.list({ date })),
  });
}

/** `before` 之前没做完的遗留项，供首页的顺延提示条 */
export function useBacklog(before: string) {
  return useQuery({
    queryKey: ['backlog', before],
    queryFn: async () => unwrap(await api.today.backlog({ before })),
  });
}

/** 一键顺延：不传 taskIds 表示把全部遗留带到 date 那天 */
export function useCarryOver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { date: string; taskIds?: string[] }) =>
      unwrap(await api.today.carryOver(p)),
    onSuccess: () => invalidateTaskScope(qc),
  });
}

/** 某天的三件事。历史日期同样可看可补写（PRD 14.9），所以日期是参数而不是写死今天 */
export function useFocusDay(date: string) {
  return useQuery({
    queryKey: ['focus', date],
    queryFn: async () => unwrap(await api.focus.getDay({ date })),
  });
}

export function useHomeSummary() {
  return useQuery({
    queryKey: ['homeSummary'],
    queryFn: async () => unwrap(await api.stats.homeSummary()),
  });
}

export function useTimeline(date: string) {
  return useQuery({
    queryKey: ['timeline', date],
    queryFn: async () => unwrap(await api.stats.timeline({ date })),
  });
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => unwrap(await api.projects.list()),
  });
}

export function useProjectTree(projectId: string) {
  return useQuery({
    queryKey: ['projectTree', projectId],
    queryFn: async () => unwrap(await api.tasks.tree({ projectId })),
  });
}

export function useHabits() {
  return useQuery({
    queryKey: ['habits'],
    queryFn: async () => unwrap(await api.habits.list()),
  });
}

export function useModules() {
  return useQuery({
    queryKey: ['modules'],
    queryFn: async () => unwrap(await api.modules.list()),
  });
}

export function useWeek(weekStart: string) {
  return useQuery({
    queryKey: ['week', weekStart],
    queryFn: async () => unwrap(await api.review.getWeek({ weekStart })),
  });
}

export function useWeekList() {
  return useQuery({
    queryKey: ['weekList'],
    queryFn: async () => unwrap(await api.review.listWeeks()),
  });
}

/** 任务详情抽屉的数据源；taskId 为空时不发请求 */
export function useTask(taskId: string | null) {
  return useQuery({
    queryKey: ['task', taskId],
    queryFn: async () => unwrap(await api.tasks.get({ id: taskId! })),
    enabled: Boolean(taskId),
    retry: false,
  });
}

export function useTaskTimeEntries(taskId: string | null) {
  return useQuery({
    queryKey: ['taskTime', taskId],
    queryFn: async () => unwrap(await api.timer.listByTask({ taskId: taskId! })),
    enabled: Boolean(taskId),
  });
}

export function useActiveTimer() {
  return useQuery({
    queryKey: ['timerActive'],
    queryFn: async () => unwrap(await api.timer.active()),
  });
}

/** 完成任务会同时改变队列、推荐、项目进度和首页汇总 */
export function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => unwrap(await api.tasks.complete({ id: taskId })),
    onSuccess: () => invalidateTaskScope(qc),
  });
}

export function useReopenTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => unwrap(await api.tasks.reopen({ id: taskId })),
    onSuccess: () => invalidateTaskScope(qc),
  });
}

/** 字段级即时保存：抽屉里没有保存按钮，每次改动都是一次 update */
export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: UpdateTaskInput) => unwrap(await api.tasks.update(patch)),
    onSuccess: () => invalidateTaskScope(qc),
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTaskInput) => unwrap(await api.tasks.create(input)),
    onSuccess: () => invalidateTaskScope(qc),
  });
}

/** 大纲里的 Tab / ⌫ 与拖拽排序都走这里：换父级、换项目、调同级顺序 */
export function useMoveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: MoveTaskInput) => unwrap(await api.tasks.move(input)),
    onSuccess: () => invalidateTaskScope(qc),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => unwrap(await api.tasks.delete({ id: taskId })),
    onSuccess: () => invalidateTaskScope(qc),
  });
}

/** 加入/移出某天的队列，默认今天 */
export function useToggleToday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      taskId,
      inToday,
      date = todayIso(),
    }: {
      taskId: string;
      inToday: boolean;
      date?: string;
    }) => unwrap(await (inToday ? api.today.add({ taskId, date }) : api.today.remove({ taskId, date }))),
    onSuccess: () => invalidateTaskScope(qc),
  });
}

export function useStartTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => unwrap(await api.timer.start({ taskId, now: Date.now() })),
    onSuccess: () => invalidateTaskScope(qc),
  });
}

export function useStopTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await api.timer.stop({ now: Date.now() })),
    onSuccess: () => invalidateTaskScope(qc),
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { taskId?: string; kind: NoteKind; content: string; url?: string }) =>
      unwrap(await api.notes.create(input)),
    onSuccess: () => invalidateTaskScope(qc),
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await api.notes.delete({ id })),
    onSuccess: () => invalidateTaskScope(qc),
  });
}

/** 想法/问题转为正式任务，返回新任务以便抽屉切过去 */
export function useConvertNoteToTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await api.notes.convertToTask({ id })),
    onSuccess: () => invalidateTaskScope(qc),
  });
}

/** 手动指定 Next Task；传 null 取消指定回到自动推荐 */
export function usePinNextTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string | null) => unwrap(await api.tasks.pinNext({ id: taskId })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nextTask'] }),
  });
}

/** 三件事既影响推荐（focus_linked 规则）也进周复盘汇总 */
function useFocusMutation<T>(mutationFn: (input: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      for (const key of ['focus', 'nextTask', 'week']) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

/** 填写/清空某一槽，按 date + slot upsert */
export function useSetFocus() {
  return useFocusMutation(async (p: { date: string; slot: number; content: string }) =>
    unwrap(await api.focus.set({ date: p.date, slot: p.slot, content: p.content })),
  );
}

export function useToggleFocusDone() {
  return useFocusMutation(async (p: { focusId: string; isDone: boolean }) =>
    unwrap(await api.focus.toggleDone(p)),
  );
}

export function useQuickCapture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) => unwrap(await api.notes.quickCapture({ content })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });
}
