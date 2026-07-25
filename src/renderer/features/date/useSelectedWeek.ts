import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDays, isIsoDate, todayIso, weekStartOf } from '@/lib/date';

const PARAM = 'week';

/**
 * 周复盘看的是哪一周（PRD 12：周一至周日，复盘归属被复盘的自然周而非填写日期）。
 * 参数一律规范化成该周的周一，于是 `?week=2026-07-24` 和 `?week=2026-07-20` 指向同一周。
 */
export function useSelectedWeek() {
  const [params, setParams] = useSearchParams();
  const raw = params.get(PARAM);
  const thisWeek = weekStartOf(todayIso());
  const weekStart = raw && isIsoDate(raw) ? weekStartOf(raw) : thisWeek;

  const setWeek = useCallback(
    (next: string) => {
      const start = weekStartOf(next);
      const p = new URLSearchParams(params);
      if (start === weekStartOf(todayIso())) p.delete(PARAM);
      else p.set(PARAM, start);
      setParams(p);
    },
    [params, setParams],
  );

  const shiftWeeks = useCallback(
    (delta: number) => setWeek(addDays(weekStart, delta * 7)),
    [weekStart, setWeek],
  );
  const goThisWeek = useCallback(() => setWeek(todayIso()), [setWeek]);

  return { weekStart, isThisWeek: weekStart === thisWeek, setWeek, shiftWeeks, goThisWeek };
}
