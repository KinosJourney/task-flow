import { endOfDay, startOfDay, todayIso } from '@shared/date';
import type { HomeSummary, ModuleId, TimelineData } from '@shared/types';
import { getDb } from '../db/connection';
import { timeEntries } from '../db/schema';
import { listProjects } from './projects';
import { moduleTimeOnDate } from './timeEntries';

/**
 * 首页次级区域一次拉齐。`projects` 留在这里不是给首页用的——首页已经不展示项目进度
 * （PRD 第 8 节），它供 /projects 与周复盘复用（ipc-contract 12）。
 * `habits` 要等 M4 的 habits 表，先给空数组，首页那张卡片自己会显示空态。
 */
export function getHomeSummary(): HomeSummary {
  return {
    projects: listProjects('active'),
    habits: [],
    moduleTimeToday: moduleTimeOnDate(todayIso()),
  };
}

/**
 * 某天的时间轴：计划 vs 实际。跨午夜的计时段在这里裁到当天边界内，
 * 于是前端拿到的每一条都能直接按当天的坐标画。
 * `planned` 要等 M3 的 schedule_events，先是空的——时间轴先只画实际发生的事。
 */
export function getTimeline(date: string): TimelineData {
  const from = startOfDay(date);
  const to = endOfDay(date);

  const actual = getDb()
    .select()
    .from(timeEntries)
    .all()
    .filter((row) => {
      const end = row.endedAt ?? Date.now();
      return row.startedAt < to && end > from;
    })
    .map((row) => ({
      id: row.id,
      taskId: row.taskId ?? undefined,
      moduleId: (row.moduleId as ModuleId | null) ?? undefined,
      startedAt: Math.max(row.startedAt, from),
      // 进行中的段不裁结束时刻：前端按 active 状态画速度线；已结束的裁到当天边界内
      endedAt: row.endedAt === null ? undefined : Math.min(row.endedAt, to),
      source: row.source,
      note: row.note ?? undefined,
    }))
    .sort((a, b) => a.startedAt - b.startedAt);

  return { planned: [], actual };
}

export function getModuleTime(
  from: number,
  to: number,
): { moduleId: ModuleId; totalMs: number }[] {
  const rows = getDb().select().from(timeEntries).all();
  const totals = new Map<string, number>();

  for (const row of rows) {
    const start = Math.max(row.startedAt, from);
    const end = Math.min(row.endedAt ?? Date.now(), to);
    if (!row.moduleId || end <= start) continue;
    totals.set(row.moduleId, (totals.get(row.moduleId) ?? 0) + (end - start));
  }

  return [...totals].map(([moduleId, totalMs]) => ({ moduleId: moduleId as ModuleId, totalMs }));
}
