import { FALLBACK_MODULE_ID, MODULE_SEED } from '@shared/modules';
import type { Module, ModuleId } from '@shared/types';

export function formatDuration(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
}

/** 秒表样式：mm:ss，超过一小时为 h:mm:ss */
export function formatStopwatch(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 毫秒时间戳 -> `<input type="datetime-local">` 需要的本地时间字符串 */
export function toDatetimeLocalValue(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 模块的名字与颜色。取自 `@shared/modules` 这唯一的事实来源——数据库的 modules 表
 * 每次启动都按它对齐（seedModules.ts），所以同步拿常量与异步查库的结果一致，
 * 而画一个模块色点不必先等一次 IPC。
 */
export function moduleOf(id: ModuleId): Module {
  const fallback = MODULE_SEED.find((m) => m.id === FALLBACK_MODULE_ID)!;
  return MODULE_SEED.find((m) => m.id === id) ?? fallback;
}
