import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDays, isIsoDate, isToday, todayIso } from '@/lib/date';

const PARAM = 'date';

/**
 * 首页与时间轴共用的「正在看哪一天」，放在查询参数里（`?date=YYYY-MM-DD`）而不是组件 state，
 * 与定位任务的 `?focus=` 同一套做法：前进/后退可切、刷新能恢复、链接可复制（ui-spec 2.6）。
 *
 * 参数缺失或不合法都回落到今天，于是首页默认永远停在今天；切回今天时删掉参数而不是写上
 * 今天的日期，URL 因此保持干净，也不会在明天变成一条指向昨天的旧链接。
 */
export function useSelectedDate() {
  const [params, setParams] = useSearchParams();
  const raw = params.get(PARAM);
  const date = raw && isIsoDate(raw) ? raw : todayIso();

  const setDate = useCallback(
    (next: string) => {
      const p = new URLSearchParams(params);
      if (isToday(next)) p.delete(PARAM);
      else p.set(PARAM, next);
      setParams(p);
    },
    [params, setParams],
  );

  const shiftDays = useCallback((delta: number) => setDate(addDays(date, delta)), [date, setDate]);
  const goToday = useCallback(() => setDate(todayIso()), [setDate]);

  return { date, isToday: isToday(date), setDate, shiftDays, goToday };
}
