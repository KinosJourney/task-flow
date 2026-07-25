import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcResult } from '@shared/ipc';
import type { TodayQueueGroup, TodayQueueNode } from '@shared/types';

/**
 * 队列按天归属的规则（data-model 1.1）：某天完成的、当天有进展的都留在那天，
 * 没做完的不会自动跟到第二天，要用户一键顺延。规则很容易在重构中被改坏，这里逐条锁住。
 *
 * mock 数据是模块级的可变数组，每个用例都重新加载模块以拿到干净的初始状态。
 */
async function fresh() {
  vi.resetModules();
  const api = (await import('@/mock/api')).mockApi;
  const data = await import('@/mock/data');
  return { api, ...data };
}

function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) throw new Error(`预期成功，实际失败：${result.error.message}`);
  return result.data;
}

function flatten(groups: TodayQueueGroup[]): TodayQueueNode[] {
  const out: TodayQueueNode[] = [];
  const walk = (nodes: TodayQueueNode[]) => {
    for (const n of nodes) {
      out.push(n);
      walk(n.children);
    }
  };
  groups.forEach((g) => walk(g.items));
  return out;
}

const idsOf = (groups: TodayQueueGroup[]) => flatten(groups).map((n) => n.id);
const rootIdsOf = (groups: TodayQueueGroup[]) => groups.flatMap((g) => g.items).map((n) => n.id);
const find = (groups: TodayQueueGroup[], id: string) => flatten(groups).find((n) => n.id === id);

let ctx: Awaited<ReturnType<typeof fresh>>;

beforeEach(async () => {
  ctx = await fresh();
});

describe('队列按天归属', () => {
  it('当天完成的任务留在当天，不出现在第二天', async () => {
    const { api, YESTERDAY, TODAY } = ctx;

    const yesterday = unwrap(await api.today.list({ date: YESTERDAY }));
    const done = find(yesterday, 't_progress');
    expect(done?.status).toBe('done');

    const today = unwrap(await api.today.list({ date: TODAY }));
    expect(idsOf(today)).not.toContain('t_progress');
  });

  it('那天没做完、后来才完成的行标成 done_later，而不是当天的成果', async () => {
    const { api, YESTERDAY, TODAY } = ctx;

    const yesterday = unwrap(await api.today.list({ date: YESTERDAY }));
    expect(find(yesterday, 't_read')?.status).toBe('done_later');

    // 同一个任务在今天那行才是达成
    const today = unwrap(await api.today.list({ date: TODAY }));
    expect(find(today, 't_read')?.status).toBe('done');
  });

  it('顺延过来的父任务只带没做完的子分支，昨天做完的子任务留在昨天', async () => {
    const { api, YESTERDAY, TODAY } = ctx;

    const yesterday = unwrap(await api.today.list({ date: YESTERDAY }));
    const parentYesterday = find(yesterday, 't_next_card');
    expect(parentYesterday?.children.map((c) => c.id)).toContain('t_card_layout');
    expect(find(yesterday, 't_card_layout')?.status).toBe('done');

    const today = unwrap(await api.today.list({ date: TODAY }));
    const parentToday = find(today, 't_next_card');
    expect(parentToday?.children.map((c) => c.id)).not.toContain('t_card_layout');
    // 没做完的分支照常跟过来
    expect(parentToday?.children.map((c) => c.id)).toContain('t_card_actions');
    // 顺延来的行标出来历
    expect(parentToday?.carriedFrom).toBe(YESTERDAY);
  });

  it('父子同时入队时只保留父级作为根行', async () => {
    const { api, TODAY } = ctx;
    unwrap(await api.today.add({ taskId: 't_card_actions', date: TODAY }));

    const today = unwrap(await api.today.list({ date: TODAY }));
    expect(rootIdsOf(today)).not.toContain('t_card_actions');
    expect(find(today, 't_next_card')?.children.map((c) => c.id)).toContain('t_card_actions');
  });

  it('移出某天的队列不影响别的日期', async () => {
    const { api, YESTERDAY, TODAY } = ctx;
    unwrap(await api.today.remove({ taskId: 't_next_card', date: TODAY }));

    expect(rootIdsOf(unwrap(await api.today.list({ date: TODAY })))).not.toContain('t_next_card');
    expect(rootIdsOf(unwrap(await api.today.list({ date: YESTERDAY })))).toContain('t_next_card');
  });
});

describe('遗留与一键顺延', () => {
  it('遗留只含没做完且还没顺延过来的，按拖得最久的排前面', async () => {
    const { api, TODAY, YESTERDAY, DAY_BEFORE } = ctx;

    const backlog = unwrap(await api.today.backlog({ before: TODAY }));
    expect(backlog.items.map((i) => i.id)).toEqual(['t_timeline', 't_cheki_scan']);
    expect(backlog.oldestDate).toBe(DAY_BEFORE);
    expect(backlog.items[1].queuedDate).toBe(YESTERDAY);
  });

  it('已完成的和已经顺延到今天的都不算遗留', async () => {
    const { api, TODAY } = ctx;
    const ids = unwrap(await api.today.backlog({ before: TODAY })).items.map((i) => i.id);

    expect(ids).not.toContain('t_progress'); // 昨天完成
    expect(ids).not.toContain('t_read'); // 昨天入队、今天完成
    expect(ids).not.toContain('t_next_card'); // 已经顺延到今天
  });

  it('跨天不自动搬运：不调 carryOver 的话遗留不会出现在今天', async () => {
    const { api, TODAY } = ctx;
    const today = unwrap(await api.today.list({ date: TODAY }));

    expect(idsOf(today)).not.toContain('t_timeline');
    expect(idsOf(today)).not.toContain('t_cheki_scan');
  });

  it('一键顺延把全部遗留带到今天，原来那天的行保持不动', async () => {
    const { api, TODAY, YESTERDAY, DAY_BEFORE } = ctx;

    const result = unwrap(await api.today.carryOver({ date: TODAY }));
    expect(result.carriedCount).toBe(2);

    const today = unwrap(await api.today.list({ date: TODAY }));
    expect(rootIdsOf(today)).toEqual(expect.arrayContaining(['t_timeline', 't_cheki_scan']));
    expect(find(today, 't_timeline')?.carriedFrom).toBe(DAY_BEFORE);

    // 留在当日：顺延是复制一行而不是把行搬走
    expect(rootIdsOf(unwrap(await api.today.list({ date: DAY_BEFORE })))).toContain('t_timeline');
    expect(rootIdsOf(unwrap(await api.today.list({ date: YESTERDAY })))).toContain('t_cheki_scan');

    // 捡完就没有遗留了
    expect(unwrap(await api.today.backlog({ before: TODAY })).items).toHaveLength(0);
  });

  it('可以只顺延指定的一项', async () => {
    const { api, TODAY } = ctx;

    expect(unwrap(await api.today.carryOver({ date: TODAY, taskIds: ['t_cheki_scan'] })).carriedCount).toBe(1);

    expect(rootIdsOf(unwrap(await api.today.list({ date: TODAY })))).toContain('t_cheki_scan');
    expect(unwrap(await api.today.backlog({ before: TODAY })).items.map((i) => i.id)).toEqual([
      't_timeline',
    ]);
  });

  it('重复顺延同一项不会在同一天留下两行', async () => {
    const { api, TODAY } = ctx;
    unwrap(await api.today.carryOver({ date: TODAY, taskIds: ['t_timeline'] }));
    const second = await api.today.carryOver({ date: TODAY, taskIds: ['t_timeline'] });

    // 第二次它已经不在遗留清单里了，按契约报 NOT_FOUND 而不是静默重复入队
    expect(second.ok).toBe(false);
    expect(rootIdsOf(unwrap(await api.today.list({ date: TODAY }))).filter((id) => id === 't_timeline')).toHaveLength(1);
  });
});

describe('Next Task 推荐', () => {
  it('只从今天的队列里挑，没顺延过来的遗留不会被推上主卡片', async () => {
    const { api, TODAY } = ctx;

    const before = unwrap(await api.tasks.getNext({ now: Date.now() }));
    expect(before.task?.id).not.toBe('t_timeline');

    unwrap(await api.today.carryOver({ date: TODAY, taskIds: ['t_timeline'] }));
    const candidates = unwrap(await api.today.list({ date: TODAY }));
    expect(rootIdsOf(candidates)).toContain('t_timeline');
  });
});
