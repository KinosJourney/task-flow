import { describe, expect, it } from 'vitest';
import {
  durationOf,
  msByDate,
  splitByDay,
  sumDuration,
  sumOnDate,
  totalsByKey,
  totalsByKeyOnDate,
} from '@main/domain/time';

/**
 * 计时是区间而不是日累计（data-model 1.2），所以跨天、多段、进行中都得靠计算得出。
 * 全部按本地时间构造：用 UTC 写测试的话，东八区的「23:30 跨午夜」根本跨不过去。
 */
const MIN = 60_000;
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 6, day, hour, minute).getTime();

const NOW = at(26, 12);

describe('单段时长', () => {
  it('已结束的段按区间长度算', () => {
    expect(durationOf({ startedAt: at(26, 9), endedAt: at(26, 10, 30) }, NOW)).toBe(90 * MIN);
  });

  it('进行中的段结算到 now', () => {
    expect(durationOf({ startedAt: at(26, 11, 30) }, NOW)).toBe(30 * MIN);
  });

  it('倒挂的区间算 0，不污染汇总', () => {
    expect(durationOf({ startedAt: at(26, 10), endedAt: at(26, 9) }, NOW)).toBe(0);
  });

  it('多段相加', () => {
    const entries = [
      { startedAt: at(26, 9), endedAt: at(26, 9, 30) },
      { startedAt: at(26, 11), endedAt: at(26, 11, 15) },
    ];
    expect(sumDuration(entries, NOW)).toBe(45 * MIN);
  });
});

describe('跨午夜切分', () => {
  it('23:30 做到次日 00:30 分别记进两天', () => {
    const slices = splitByDay({ startedAt: at(25, 23, 30), endedAt: at(26, 0, 30) }, NOW);
    expect(slices).toEqual([
      { date: '2026-07-25', ms: 30 * MIN },
      { date: '2026-07-26', ms: 30 * MIN },
    ]);
  });

  it('午夜整点归后一天，前一天不留 0 长度的碎片', () => {
    const slices = splitByDay({ startedAt: at(25, 23), endedAt: at(26, 0) }, NOW);
    expect(slices).toEqual([{ date: '2026-07-25', ms: 60 * MIN }]);
  });

  it('连着跨好几天的段每天都有一片，中间那天是整天', () => {
    const slices = splitByDay({ startedAt: at(24, 22), endedAt: at(26, 1) }, NOW);
    expect(slices.map((s) => s.date)).toEqual(['2026-07-24', '2026-07-25', '2026-07-26']);
    expect(slices[1].ms).toBe(24 * 60 * MIN);
  });

  it('空区间切不出东西', () => {
    expect(splitByDay({ startedAt: at(26, 9), endedAt: at(26, 9) }, NOW)).toEqual([]);
  });

  it('某天的汇总只含落在那天的部分', () => {
    const entries = [
      { startedAt: at(25, 23, 30), endedAt: at(26, 0, 30) },
      { startedAt: at(26, 9), endedAt: at(26, 10) },
    ];
    expect(sumOnDate(entries, '2026-07-26', NOW)).toBe(90 * MIN);
    expect(sumOnDate(entries, '2026-07-25', NOW)).toBe(30 * MIN);
  });

  it('按天铺开供时间轴与周复盘用', () => {
    const totals = msByDate([{ startedAt: at(25, 23, 30), endedAt: at(26, 0, 15) }], NOW);
    expect([...totals]).toEqual([
      ['2026-07-25', 30 * MIN],
      ['2026-07-26', 15 * MIN],
    ]);
  });
});

describe('按键汇总', () => {
  const entries = [
    { moduleId: 'work', startedAt: at(26, 9), endedAt: at(26, 10) },
    { moduleId: 'work', startedAt: at(26, 10), endedAt: at(26, 10, 30) },
    { moduleId: 'sport', startedAt: at(26, 11), endedAt: at(26, 11, 20) },
    // 还没归类的无任务计时：不该被摊到任何模块头上
    { moduleId: undefined, startedAt: at(26, 8), endedAt: at(26, 8, 45) },
  ];

  it('同一模块的多段累加，未归类的跳过', () => {
    const totals = totalsByKey(entries, (e) => e.moduleId, NOW);
    expect(totals.get('work')).toBe(90 * MIN);
    expect(totals.get('sport')).toBe(20 * MIN);
    expect(totals.size).toBe(2);
  });

  it('限定某天时，跨午夜的段只算那天那部分', () => {
    const crossing = [{ moduleId: 'work', startedAt: at(25, 23, 30), endedAt: at(26, 0, 30) }];
    expect(totalsByKeyOnDate(crossing, (e) => e.moduleId, '2026-07-26', NOW).get('work')).toBe(
      30 * MIN,
    );
  });
});
