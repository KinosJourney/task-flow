const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const DAY_MS = 86_400_000;

/**
 * 本地时区的 `YYYY-MM-DD`。不能用 `toISOString().slice(0, 10)`：那是 UTC 日期，
 * 东八区凌晨会被算成前一天，于是「今天」在半夜就错了。
 */
export function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 每次调用都重新取，应用跨过午夜后「今天」会自然跟着走 */
export function todayIso(): string {
  return toIsoDate(new Date());
}

/** `new Date('2026-07-26')` 按 UTC 解析，所以手工拆成本地 00:00 */
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseIsoDate(value).getTime());
}

export function addDays(iso: string, delta: number): string {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + delta);
  return toIsoDate(d);
}

/** 相差天数（a - b）。跨夏令时那天两个午夜差 23 或 25 小时，所以取整而不是整除 */
export function diffDays(a: string, b: string): number {
  return Math.round((parseIsoDate(a).getTime() - parseIsoDate(b).getTime()) / DAY_MS);
}

export function isToday(iso: string): boolean {
  return iso === todayIso();
}

/** 时间戳落在哪一天，用于把计时与日程按天分桶 */
export function isoDateOf(ts: number): string {
  return toIsoDate(new Date(ts));
}

/** 「7 月 26 日 · 周日」 */
export function formatDateLabel(iso: string): string {
  const d = parseIsoDate(iso);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${WEEKDAYS[d.getDay()]}`;
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

/** 周一为一周之始（PRD 12：每周范围固定为周一至周日） */
export function weekStartOf(iso: string): string {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toIsoDate(d);
}

export function formatWeekRange(weekStart: string): string {
  const a = parseIsoDate(weekStart);
  const b = parseIsoDate(addDays(weekStart, 6));
  return `${a.getMonth() + 1} 月 ${a.getDate()} 日 – ${b.getMonth() + 1} 月 ${b.getDate()} 日`;
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
