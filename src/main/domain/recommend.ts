import { MODULE_SEED } from '@shared/modules';
import type { ModuleId, NextReason } from '@shared/types';

/**
 * Next Task 推荐引擎（PRD 6.2、ipc-contract 3.2）。纯函数：输入当前状态的快照，
 * 输出推荐哪个任务 + 结构化理由，理由直接喂给首页助手角色的气泡，
 * 让六级优先级对用户可解释。组装成 TaskDetail 是仓储层的事，这里只给 id。
 */

export interface RecommendCandidate {
  id: string;
  moduleId: ModuleId;
  /** 在今天队列里的手动排序 */
  queueOrder: number;
}

export interface RecommendInput {
  now: number;
  /** 「换一个」时排除当前推荐 */
  excludeTaskId?: string;
  /** 用户手动指定的任务（tasks.pinNext），优先于全部自动规则 */
  pinnedTaskId?: string;
  /** 今天队列里还没做完的任务。推荐只从这里挑：遗留没顺延过来就不该被推上主卡片 */
  candidates: RecommendCandidate[];
  /** 正在计时的那个任务，可能不在今天的队列里（比如从项目页直接开始的计时） */
  activeTimerTaskId?: string;
  /** 任务 id -> 关联的今日三件事槽位 */
  focusSlotOf: Map<string, number>;
  /** 已经有过计时、但还没完成的任务 */
  startedTaskIds: Set<string>;
  /** 各项目「下一步行动」指针指向的任务 */
  nextActionTaskIds: Set<string>;
  /** 最近连续完成的同模块任务 */
  recentStreak?: { moduleId: ModuleId; count: number };
  /** 当前这一段连续专注了多久 */
  continuousFocusMs?: number;
  /** 下一个日程的开始时刻（M3 的 schedule_events 接上后才有值） */
  upcomingScheduleAt?: number;
}

export interface Recommendation {
  taskId: string | null;
  reason: NextReason | null;
}

/** 连续做同一个模块多少件之后开始提议换换脑子。PRD 6.2 举的例子是连续五项工作任务 */
const SAME_MODULE_STREAK = 4;

/** 或者连续专注这么久也该换了 */
const CONTINUOUS_FOCUS_MS = 90 * 60_000;

/** 日程马上要开始时不折腾切换模块：先把手上这件推完，被打断也不亏 */
const SCHEDULE_SOON_MS = 30 * 60_000;

const MODULE_NAMES = new Map<string, string>(MODULE_SEED.map((m) => [m.id, m.name]));

function moduleName(moduleId: ModuleId): string {
  return MODULE_NAMES.get(moduleId) ?? moduleId;
}

const byQueueOrder = (a: RecommendCandidate, b: RecommendCandidate) => a.queueOrder - b.queueOrder;

/**
 * 该不该提议换个模块。三件事同时看（PRD 6.2）：连做同模块的件数、连续专注时长、
 * 以及即将开始的日程。不强制、不弹窗，只是把推荐换成另一个模块的任务。
 */
function shouldRebalance(input: RecommendInput): boolean {
  if (input.upcomingScheduleAt !== undefined) {
    const untilSchedule = input.upcomingScheduleAt - input.now;
    if (untilSchedule >= 0 && untilSchedule <= SCHEDULE_SOON_MS) return false;
  }
  const streak = input.recentStreak?.count ?? 0;
  const focused = input.continuousFocusMs ?? 0;
  return streak >= SAME_MODULE_STREAK || focused >= CONTINUOUS_FOCUS_MS;
}

export function recommendNextTask(input: RecommendInput): Recommendation {
  // 规则 0：手动指定优先于 excludeTaskId，所以「换一个」要先取消指定再排除当前任务
  if (input.pinnedTaskId) {
    return {
      taskId: input.pinnedTaskId,
      reason: { rule: 'manual_pin', message: '这件是你自己挑出来的，那就先干它！' },
    };
  }

  // 规则 1：正在计时的任务就是当下正在做的事，不必再挑
  if (input.activeTimerTaskId && input.activeTimerTaskId !== input.excludeTaskId) {
    return {
      taskId: input.activeTimerTaskId,
      reason: { rule: 'active_timer', message: '这件正在计时，接着做完它吧。' },
    };
  }

  const candidates = input.candidates
    .filter((c) => c.id !== input.excludeTaskId)
    .sort(byQueueOrder);
  if (candidates.length === 0) return { taskId: null, reason: null };

  // 规则 2：与今日三件事关联的，今天想要的结果就指着它
  const focusLinked = candidates.find((c) => input.focusSlotOf.has(c.id));
  if (focusLinked) {
    return {
      taskId: focusLinked.id,
      reason: {
        rule: 'focus_linked',
        message: `这关系到你今天想要的第 ${input.focusSlotOf.get(focusLinked.id)} 件事，先推进它吧。`,
      },
    };
  }

  // 规则 3：已经开始但没做完的，接着做比另开一件划算
  const started = candidates.find((c) => input.startedTaskIds.has(c.id));
  if (started) {
    return {
      taskId: started.id,
      reason: { rule: 'in_progress', message: '这件已经动过手了，一口气收尾吧。' },
    };
  }

  // 规则 4：项目自己标出来的下一步
  const nextAction = candidates.find((c) => input.nextActionTaskIds.has(c.id));
  if (nextAction) {
    return {
      taskId: nextAction.id,
      reason: { rule: 'project_next_action', message: '这是项目里标好的下一步。' },
    };
  }

  /*
   * 规则 5 与规则 6 在同一步里定：都是「从今天的队列里挑」，区别只在挑选依据。
   *
   * PRD 6.2 把模块平衡列为第 6 条，但它要是严格排在「队列靠前」之后，
   * 只要队列非空就永远轮不到它，验收标准 5「连续工作后可推荐其他模块」就永远不成立。
   * 所以它不是又一个候选来源，而是在这一步换掉排序依据：疲劳信号出现时优先挑别的模块，
   * 挑不出来（全队列都是同一个模块）就照旧按手动排序来。
   */
  if (shouldRebalance(input)) {
    /*
     * 要避开的是「不换的话就会被推荐的那个模块」。连续完成记录能直接给出它；
     * 只有「专注了很久」这一个信号时不知道在专注什么，就拿队列首项的模块顶上——
     * 反正它就是下一步默认会被推荐的那个。
     */
    const tiredModule = input.recentStreak?.moduleId ?? candidates[0].moduleId;
    const fresh = candidates.find((c) => c.moduleId !== tiredModule);
    if (fresh) {
      return {
        taskId: fresh.id,
        reason: {
          rule: 'module_balance',
          message: input.recentStreak
            ? `你已经连续投入「${moduleName(tiredModule)}」一阵子了，换个「${moduleName(fresh.moduleId)}」的事换换脑子？`
            : `专注了挺久了，换个「${moduleName(fresh.moduleId)}」的事换换脑子？`,
          context: {
            recentSameModuleCount: input.recentStreak?.count,
            continuousFocusMs: input.continuousFocusMs,
            suggestedModuleId: fresh.moduleId,
            upcomingScheduleAt: input.upcomingScheduleAt,
          },
        },
      };
    }
  }

  return {
    taskId: candidates[0].id,
    reason: { rule: 'today_queue_top', message: '你把它排在了今日队列最前面。' },
  };
}

/**
 * 最近连续完成的同模块任务数：从最新完成的那件往前数，模块一变就停。
 * 用于模块平衡的疲劳判断，所以只看「连续」，历史上做过多少件同模块的不算。
 */
export function sameModuleStreak(
  doneTasks: { moduleId: ModuleId; doneAt: number }[],
): { moduleId: ModuleId; count: number } | undefined {
  const ordered = [...doneTasks].sort((a, b) => b.doneAt - a.doneAt);
  const latest = ordered[0];
  if (!latest) return undefined;

  let count = 0;
  for (const task of ordered) {
    if (task.moduleId !== latest.moduleId) break;
    count++;
  }
  return { moduleId: latest.moduleId, count };
}
