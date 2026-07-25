import { addDays, diffDays, parseIsoDate, todayIso, weekStartOf } from '@shared/date';

/**
 * 日期计算住在 @shared/date（主进程的队列与计时也要用同一套），这里再导出一遍，
 * 于是渲染层只认 `@/lib/date` 一个入口；本文件自己只负责中文展示格式。
 */
export {
  addDays,
  diffDays,
  isIsoDate,
  isoDateOf,
  parseIsoDate,
  toIsoDate,
  todayIso,
  weekStartOf,
} from '@shared/date';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function isToday(iso: string): boolean {
  return iso === todayIso();
}

/** 「7 月 26 日」 */
export function formatMonthDay(iso: string): string {
  const d = parseIsoDate(iso);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

/** 「7 月 26 日 · 周日」 */
export function formatDateLabel(iso: string): string {
  const d = parseIsoDate(iso);
  return `${formatMonthDay(iso)} · 周${WEEKDAYS[d.getDay()]}`;
}

/** 近几天给个口语称呼，远了就没有，让日期切换器一眼看出自己在哪 */
export function relativeDayName(iso: string): string | null {
  switch (diffDays(iso, todayIso())) {
    case 0:
      return '今天';
    case -1:
      return '昨天';
    case -2:
      return '前天';
    case 1:
      return '明天';
    default:
      return null;
  }
}

export function formatWeekRange(weekStart: string): string {
  return `${formatMonthDay(weekStart)} – ${formatMonthDay(addDays(weekStart, 6))}`;
}

export function relativeWeekName(weekStart: string): string | null {
  switch (diffDays(weekStart, weekStartOf(todayIso())) / 7) {
    case 0:
      return '本周';
    case -1:
      return '上周';
    case 1:
      return '下周';
    default:
      return null;
  }
}
