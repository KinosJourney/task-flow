import { endOfDay, isoDateOf } from '@shared/date';

/**
 * 计时的区间模型（data-model 1.2）。这里只处理「一段时间」，不关心它属于哪个任务，
 * 于是跨午夜切分、按天/按周汇总都是可以脱离数据库单测的纯函数。
 *
 * 约定：区间是半开的 `[startedAt, endedAt)`，午夜那一刻归后一天；
 * `endedAt` 为空表示进行中，一律按调用方给的 `now` 结算（`now` 注入而不是读时钟，方便测试）。
 */
export interface Interval {
  startedAt: number;
  endedAt?: number;
}

export interface DaySlice {
  /** YYYY-MM-DD */
  date: string;
  ms: number;
}

/** 区间的实际结束时刻：进行中的段结算到 now */
function endOf(interval: Interval, now: number): number {
  return interval.endedAt ?? now;
}

/**
 * 单个区间的时长。倒挂的区间（结束早于开始）算 0 而不是负数——
 * 手动补录和改错记录都可能填出倒挂，让它污染汇总不如当它没有。
 */
export function durationOf(interval: Interval, now: number): number {
  return Math.max(0, endOf(interval, now) - interval.startedAt);
}

export function sumDuration(intervals: Interval[], now: number): number {
  return intervals.reduce((total, interval) => total + durationOf(interval, now), 0);
}

/**
 * 把一个区间按本地午夜切成若干天。凌晨跨天的那段工作要分别记进两天，
 * 否则「昨天投入了多少」会把今天凌晨的部分算进去。
 *
 * 切分只在这里做，不进 SQL：SQL 里算本地午夜要牵扯时区与夏令时，得不偿失。
 */
export function splitByDay(interval: Interval, now: number): DaySlice[] {
  const end = endOf(interval, now);
  if (end <= interval.startedAt) return [];

  const slices: DaySlice[] = [];
  let cursor = interval.startedAt;
  // 一段计时跨的天数有限，guard 只为防夏令时算出不前进的边界导致死循环
  for (let guard = 0; cursor < end && guard < 400; guard++) {
    const date = isoDateOf(cursor);
    const boundary = Math.min(endOfDay(date), end);
    if (boundary <= cursor) break;
    slices.push({ date, ms: boundary - cursor });
    cursor = boundary;
  }
  return slices;
}

/** 一批区间落在某一天的总时长，跨午夜的只计那天的部分 */
export function sumOnDate(intervals: Interval[], date: string, now: number): number {
  return intervals.reduce((total, interval) => {
    const slice = splitByDay(interval, now).find((s) => s.date === date);
    return total + (slice?.ms ?? 0);
  }, 0);
}

/** 一批区间按天铺开，用于时间轴与周复盘的逐日汇总 */
export function msByDate(intervals: Interval[], now: number): Map<string, number> {
  const totals = new Map<string, number>();
  for (const interval of intervals) {
    for (const slice of splitByDay(interval, now)) {
      totals.set(slice.date, (totals.get(slice.date) ?? 0) + slice.ms);
    }
  }
  return totals;
}

/**
 * 按任意键汇总总时长（模块、任务、项目都用它）。键为空的条目跳过——
 * 无任务计时还没归类时，不该被摊到某个模块头上。
 */
export function totalsByKey<T extends Interval>(
  intervals: T[],
  keyOf: (interval: T) => string | undefined,
  now: number,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const interval of intervals) {
    const key = keyOf(interval);
    if (!key) continue;
    totals.set(key, (totals.get(key) ?? 0) + durationOf(interval, now));
  }
  return totals;
}

/** 同上，但只统计落在某一天的部分，供「今天各模块投入了多少」 */
export function totalsByKeyOnDate<T extends Interval>(
  intervals: T[],
  keyOf: (interval: T) => string | undefined,
  date: string,
  now: number,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const interval of intervals) {
    const key = keyOf(interval);
    if (!key) continue;
    const ms = splitByDay(interval, now).find((s) => s.date === date)?.ms ?? 0;
    if (ms > 0) totals.set(key, (totals.get(key) ?? 0) + ms);
  }
  return totals;
}
