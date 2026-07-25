import { Link } from 'react-router-dom';
import { Panel, PanelHeader } from '@/components/comic/Panel';
import { DateSwitcher } from '@/components/comic/DateSwitcher';
import { NextTaskCard } from '@/features/home/NextTaskCard';
import { CarryOverBanner } from '@/features/home/CarryOverBanner';
import { DayRecap } from '@/features/home/DayRecap';
import { TodayFocus } from '@/features/home/TodayFocus';
import { TodayQueue } from '@/features/home/TodayQueue';
import { HabitStrip } from '@/features/home/HabitStrip';
import { QuickCapture } from '@/features/home/QuickCapture';
import { TimelineView } from '@/features/timeline/TimelineView';
import { useSelectedDate } from '@/features/date/useSelectedDate';
import { useTimeline } from '@/features/queries';
import { diffDays, formatDateLabel, todayIso } from '@/lib/date';

function headline(date: string, isToday: boolean): string {
  if (isToday) return '早上好，今天想搞定什么？';
  return diffDays(date, todayIso()) > 0 ? '这天还没到，先看看排了什么' : '这天你做了这些';
}

export function HomePage() {
  const { date, isToday, setDate, shiftDays, goToday } = useSelectedDate();
  const { data: timeline } = useTimeline(date);
  const timelineEmpty = timeline && timeline.planned.length === 0 && timeline.actual.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold">{headline(date, isToday)}</h1>
          <p className="text-sm text-ink-soft">{formatDateLabel(date)}</p>
        </div>
        <DateSwitcher
          date={date}
          isToday={isToday}
          onShiftDays={shiftDays}
          onPick={setDate}
          onToday={goToday}
        />
      </header>

      {isToday ? <NextTaskCard /> : <DayRecap date={date} data={timeline} onToday={goToday} />}

      {/* 遗留只在今天问「要不要带过来」；回看过去某天时该做的是逐行顺延 */}
      {isToday && <CarryOverBanner />}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TodayFocus date={date} isToday={isToday} />
        <Panel>
          <PanelHeader
            title={isToday ? '今日时间轴' : '当日时间轴'}
            icon="⏱️"
            action={
              <Link
                to={isToday ? '/timeline' : `/timeline?date=${date}`}
                className="text-xs font-bold text-accent hover:underline"
              >
                展开 →
              </Link>
            }
          />
          <div className="p-3">
            {timeline ? (
              <TimelineView data={timeline} date={date} compact />
            ) : (
              <p className="text-sm text-ink-soft">加载中…</p>
            )}
            <div className="mt-2 flex gap-4 text-[11px] text-ink-soft">
              {timelineEmpty ? (
                <span>这天既没有计划也没有计时记录。</span>
              ) : (
                <>
                  <span>◻ 虚线 = 计划</span>
                  <span>■ 实心 = 实际</span>
                  <span>▨ 斜纹 = 补录</span>
                </>
              )}
            </div>
          </div>
        </Panel>
        {/* 队列按天归属，回看时显示那天的队列；习惯与快速记录只有「今天」一种状态 */}
        <div className="md:col-span-2">
          <TodayQueue date={date} isToday={isToday} />
        </div>
        {isToday && (
          <>
            <HabitStrip />
            <QuickCapture />
          </>
        )}
      </div>

      <Link
        to="/import"
        className="panel panel-hover flex items-center justify-center gap-2 py-4 font-display text-lg font-bold"
      >
        📥 粘贴一段文字，智能导入为任务
      </Link>
    </div>
  );
}
