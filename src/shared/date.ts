/**
 * 日期计算的纯函数，两端共用。队列按天归属、计时按天切分都要在主进程算，
 * 而中文展示格式（「7 月 26 日 · 周日」）只属于渲染层，留在 renderer/lib/date.ts。
 */

export const DAY_MS = 86_400_000;

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

/** 时间戳落在哪一天，用于把计时与日程按天分桶 */
export function isoDateOf(ts: number): string {
  return toIsoDate(new Date(ts));
}

/** 某天的本地 00:00。跨夏令时时它和「前一天 + 24h」不是一回事，所以按日历算 */
export function startOfDay(iso: string): number {
  return parseIsoDate(iso).getTime();
}

/** 某天的结束边界 = 次日 00:00。区间用半开 [start, end)，午夜那一刻归后一天 */
export function endOfDay(iso: string): number {
  return startOfDay(addDays(iso, 1));
}

/** 周一为一周之始（PRD 12：每周范围固定为周一至周日） */
export function weekStartOf(iso: string): string {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toIsoDate(d);
}
