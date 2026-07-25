import { moduleOf, formatClock } from '@/lib/format';
import { parseIsoDate } from '@/lib/date';
import type { TimelineData } from '@shared/types';

interface TimelineViewProps {
  data: TimelineData;
  /** 渲染哪一天（`YYYY-MM-DD`）：刻度原点跟着它走，否则回看昨天会把块画到轨道外 */
  date: string;
  startHour?: number;
  endHour?: number;
  compact?: boolean;
}

export function TimelineView({
  data,
  date,
  startHour = 8,
  endHour = 20,
  compact = false,
}: TimelineViewProps) {
  const dayStart = parseIsoDate(date);
  dayStart.setHours(startHour, 0, 0, 0);
  const spanMs = (endHour - startHour) * 3600_000;
  const rowH = compact ? 150 : 340;

  const pos = (ts: number) => ((ts - dayStart.getTime()) / spanMs) * rowH;
  const height = (a: number, b: number) => Math.max(14, ((b - a) / spanMs) * rowH);
  /** 只有今天才可能有进行中的段；历史日期的未结束段截到当天可见范围的末尾 */
  const endOf = (entryEnd?: number) => entryEnd ?? Math.min(Date.now(), dayStart.getTime() + spanMs);

  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

  return (
    <div className="flex gap-3">
      {/* 小时刻度 */}
      <div className="relative shrink-0 text-right text-[11px] text-ink-soft" style={{ height: rowH, width: 34 }}>
        {hours.map((h) => (
          <div
            key={h}
            className="absolute right-0 -translate-y-1/2"
            style={{ top: ((h - startHour) / (endHour - startHour)) * rowH }}
          >
            {String(h).padStart(2, '0')}:00
          </div>
        ))}
      </div>

      {/* 计划轨道 */}
      <Track label="计划" rowH={rowH} hours={hours} startHour={startHour} endHour={endHour}>
        {data.planned.map((e) => (
          <div
            key={e.id}
            className="absolute left-1 right-1 rounded-md border-[2.5px] border-dashed border-line bg-white/70 px-1.5 py-0.5 text-[11px]"
            style={{ top: pos(e.startAt), height: height(e.startAt, e.endAt) }}
            title={`${e.title} ${formatClock(e.startAt)}–${formatClock(e.endAt)}`}
          >
            <span className="line-clamp-1 font-bold">{e.title}</span>
          </div>
        ))}
      </Track>

      {/* 实际轨道 */}
      <Track label="实际" rowH={rowH} hours={hours} startHour={startHour} endHour={endHour}>
        {data.actual.map((e) => {
          const m = e.moduleId ? moduleOf(e.moduleId) : moduleOf('other');
          const end = endOf(e.endedAt);
          return (
            <div
              key={e.id}
              className={`absolute left-1 right-1 overflow-hidden rounded-md border-[2.5px] border-line px-1.5 py-0.5 text-[11px] text-white ${
                e.source === 'manual' ? 'speedlines' : ''
              }`}
              style={{
                top: pos(e.startedAt),
                height: height(e.startedAt, end),
                backgroundColor: e.source === 'manual' ? undefined : m.color,
              }}
              title={`${formatClock(e.startedAt)}–${formatClock(end)}${e.source === 'manual' ? '（补录）' : ''}`}
            >
              <span className="line-clamp-1 font-bold text-ink">
                {formatClock(e.startedAt)}
              </span>
            </div>
          );
        })}
      </Track>
    </div>
  );
}

interface TrackProps {
  label: string;
  rowH: number;
  hours: number[];
  startHour: number;
  endHour: number;
  children: React.ReactNode;
}

function Track({ label, rowH, hours, startHour, endHour, children }: TrackProps) {
  return (
    <div className="flex-1">
      <div className="mb-1 text-center text-[11px] font-bold text-ink-soft">{label}</div>
      <div
        className="relative rounded-lg border-[2.5px] border-line bg-panel"
        style={{ height: rowH }}
      >
        {hours.map((h) => (
          <div
            key={h}
            className="absolute left-0 right-0 border-t border-dashed border-line/25"
            style={{ top: ((h - startHour) / (endHour - startHour)) * rowH }}
          />
        ))}
        {children}
      </div>
    </div>
  );
}
