import { describe, expect, it } from 'vitest';
import type { ModuleId } from '@shared/types';
import {
  recommendNextTask,
  sameModuleStreak,
  type RecommendCandidate,
  type RecommendInput,
} from '@main/domain/recommend';

/**
 * 六级优先级推荐（PRD 6.2、ipc-contract 3.2）。首页永远要能给出一件事（验收标准 4），
 * 连续做同一个模块之后要能提议换个模块（验收标准 5），这两条在这里锁住。
 */
const NOW = new Date(2026, 6, 26, 14).getTime();
const MIN = 60_000;

const candidate = (id: string, queueOrder: number, moduleId: ModuleId = 'work'): RecommendCandidate => ({
  id,
  moduleId,
  queueOrder,
});

function input(overrides: Partial<RecommendInput> = {}): RecommendInput {
  return {
    now: NOW,
    candidates: [candidate('a', 1), candidate('b', 2)],
    focusSlotOf: new Map(),
    startedTaskIds: new Set(),
    nextActionTaskIds: new Set(),
    ...overrides,
  };
}

describe('优先级顺序', () => {
  it('手动指定压过一切，连 excludeTaskId 也压过', () => {
    const result = recommendNextTask(input({ pinnedTaskId: 'z', excludeTaskId: 'z' }));
    expect(result.taskId).toBe('z');
    expect(result.reason?.rule).toBe('manual_pin');
  });

  it('正在计时的任务优先，且不必在今天的队列里', () => {
    const result = recommendNextTask(input({ activeTimerTaskId: 'running' }));
    expect(result.taskId).toBe('running');
    expect(result.reason?.rule).toBe('active_timer');
  });

  it('与今日三件事关联的排在队列顺序之前，理由里带上第几件', () => {
    const result = recommendNextTask(input({ focusSlotOf: new Map([['b', 2]]) }));
    expect(result.taskId).toBe('b');
    expect(result.reason?.rule).toBe('focus_linked');
    expect(result.reason?.message).toContain('第 2 件');
  });

  it('已经动过手的排在项目下一步之前', () => {
    const result = recommendNextTask(
      input({ startedTaskIds: new Set(['b']), nextActionTaskIds: new Set(['a']) }),
    );
    expect(result.taskId).toBe('b');
    expect(result.reason?.rule).toBe('in_progress');
  });

  it('都没有信号时按项目标好的下一步', () => {
    const result = recommendNextTask(input({ nextActionTaskIds: new Set(['b']) }));
    expect(result.taskId).toBe('b');
    expect(result.reason?.rule).toBe('project_next_action');
  });

  it('最后才按今日队列的手动排序', () => {
    const result = recommendNextTask(input());
    expect(result.taskId).toBe('a');
    expect(result.reason?.rule).toBe('today_queue_top');
  });
});

describe('换一个与空态', () => {
  it('排除当前推荐后给出下一个', () => {
    expect(recommendNextTask(input({ excludeTaskId: 'a' })).taskId).toBe('b');
  });

  it('队列里没有可做的就老实返回空，而不是硬凑一个', () => {
    const result = recommendNextTask(input({ candidates: [] }));
    expect(result).toEqual({ taskId: null, reason: null });
  });

  it('排除掉唯一一项后也是空态', () => {
    expect(recommendNextTask(input({ candidates: [candidate('a', 1)], excludeTaskId: 'a' })).taskId).toBeNull();
  });
});

describe('模块平衡（验收标准 5）', () => {
  const mixed = [candidate('work1', 1), candidate('work2', 2), candidate('run', 3, 'sport')];

  it('连续做够多件同模块后，改推荐别的模块', () => {
    const result = recommendNextTask(
      input({ candidates: mixed, recentStreak: { moduleId: 'work', count: 5 } }),
    );
    expect(result.taskId).toBe('run');
    expect(result.reason?.rule).toBe('module_balance');
    expect(result.reason?.message).toContain('运动');
    expect(result.reason?.context).toMatchObject({
      recentSameModuleCount: 5,
      suggestedModuleId: 'sport',
    });
  });

  it('连续专注够久也触发，即使没有连续完成记录', () => {
    const result = recommendNextTask(
      input({ candidates: mixed, continuousFocusMs: 120 * MIN }),
    );
    expect(result.taskId).toBe('run');
    expect(result.reason?.rule).toBe('module_balance');
  });

  it('刚做了一两件不折腾，还是按队列顺序', () => {
    const result = recommendNextTask(
      input({ candidates: mixed, recentStreak: { moduleId: 'work', count: 2 } }),
    );
    expect(result.taskId).toBe('work1');
    expect(result.reason?.rule).toBe('today_queue_top');
  });

  it('队列里全是同一个模块时不硬切，回落到队列顺序', () => {
    const result = recommendNextTask(
      input({
        candidates: [candidate('work1', 1), candidate('work2', 2)],
        recentStreak: { moduleId: 'work', count: 6 },
      }),
    );
    expect(result.taskId).toBe('work1');
    expect(result.reason?.rule).toBe('today_queue_top');
  });

  it('日程马上就要开始时不换模块，先把手上这件推完', () => {
    const result = recommendNextTask(
      input({
        candidates: mixed,
        recentStreak: { moduleId: 'work', count: 6 },
        upcomingScheduleAt: NOW + 10 * MIN,
      }),
    );
    expect(result.taskId).toBe('work1');
    expect(result.reason?.rule).toBe('today_queue_top');
  });

  it('日程还远就照常换模块', () => {
    const result = recommendNextTask(
      input({
        candidates: mixed,
        recentStreak: { moduleId: 'work', count: 6 },
        upcomingScheduleAt: NOW + 5 * 60 * MIN,
      }),
    );
    expect(result.reason?.rule).toBe('module_balance');
  });

  it('三件事关联的信号压过模块平衡：今天想要的结果更重要', () => {
    const result = recommendNextTask(
      input({
        candidates: mixed,
        focusSlotOf: new Map([['work1', 1]]),
        recentStreak: { moduleId: 'work', count: 6 },
      }),
    );
    expect(result.taskId).toBe('work1');
    expect(result.reason?.rule).toBe('focus_linked');
  });
});

describe('连续同模块的件数', () => {
  const done = (moduleId: ModuleId, hour: number) => ({
    moduleId,
    doneAt: new Date(2026, 6, 26, hour).getTime(),
  });

  it('从最新完成的往前数，模块一变就停', () => {
    const streak = sameModuleStreak([
      done('sport', 9),
      done('work', 10),
      done('work', 11),
      done('work', 12),
    ]);
    expect(streak).toEqual({ moduleId: 'work', count: 3 });
  });

  it('什么都没完成时没有连续记录', () => {
    expect(sameModuleStreak([])).toBeUndefined();
  });
});
