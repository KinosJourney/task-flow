import { Panel } from '@/components/comic/Panel';
import { DateSwitcher } from '@/components/comic/DateSwitcher';
import { TimelineView } from '@/features/timeline/TimelineView';
import { useSelectedDate } from '@/features/date/useSelectedDate';
import { useTimeline } from '@/features/queries';
import { formatDateLabel } from '@/lib/date';

export function TimelinePage() {
  const { date, isToday, setDate, shiftDays, goToday } = useSelectedDate();
  const { data } = useTimeline(date);
  const empty = data && data.planned.length === 0 && data.actual.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold">
            {isToday ? '今日时间轴' : '当日时间轴'}
          </h1>
          <p className="text-sm text-ink-soft">
            {formatDateLabel(date)} · 左边是计划，右边是实际发生的计时。
          </p>
        </div>
        <DateSwitcher
          date={date}
          isToday={isToday}
          onShiftDays={shiftDays}
          onPick={setDate}
          onToday={goToday}
        />
      </header>

      <Panel className="p-5">
        {data ? <TimelineView data={data} date={date} /> : <p className="text-ink-soft">加载中…</p>}
      </Panel>

      {empty ? (
        <p className="text-sm text-ink-soft">这天既没有计划也没有计时记录，换个日期看看。</p>
      ) : (
        <div className="flex flex-wrap gap-4 text-sm text-ink-soft">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-5 rounded border-[2.5px] border-dashed border-line bg-white" /> 计划
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-5 rounded border-[2.5px] border-line bg-accent" /> 实际（计时）
          </span>
          <span className="flex items-center gap-1">
            <span className="speedlines inline-block h-3 w-5 rounded border-[2.5px] border-line" /> 手动补录
          </span>
        </div>
      )}
    </div>
  );
}
