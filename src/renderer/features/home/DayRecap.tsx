import { Assistant } from '@/components/assistant/Assistant';
import { Button } from '@/components/comic/Button';
import { Panel } from '@/components/comic/Panel';
import { ModuleTag } from '@/components/comic/ModuleTag';
import { diffDays, todayIso } from '@/lib/date';
import { formatDuration } from '@/lib/format';
import { MODULES } from '@/mock/data';
import type { TimelineData } from '@shared/types';

interface DayRecapProps {
  date: string;
  data?: TimelineData;
  onToday: () => void;
}

/**
 * 首页切到别的日期时顶替 Next Task 卡片的位置。
 * 「现在最该做什么」只对今天成立，回看时那张卡片会给出误导，所以换成当天投入的汇总，
 * 并常驻一个「回到今天」的出口，避免用户翻远了找不回来。
 */
export function DayRecap({ date, data, onToday }: DayRecapProps) {
  const isFuture = diffDays(date, todayIso()) > 0;
  const actual = data?.actual ?? [];
  const totalMs = actual.reduce((sum, e) => sum + ((e.endedAt ?? e.startedAt) - e.startedAt), 0);

  const byModule = MODULES.map((m) => ({
    id: m.id,
    totalMs: actual
      .filter((e) => e.moduleId === m.id)
      .reduce((sum, e) => sum + ((e.endedAt ?? e.startedAt) - e.startedAt), 0),
  })).filter((x) => x.totalMs > 0);

  const message = isFuture
    ? `这天还没到，所以只有排好的计划：${data?.planned.length ?? 0} 个时段。`
    : totalMs > 0
      ? `这天你投入了 ${formatDuration(totalMs)}，一共 ${actual.length} 段记录。`
      : '这天没留下计时记录。翻翻别的日子，或者回到今天继续干活？';

  return (
    <Panel className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <Assistant message={message} mood={isFuture ? 'think' : 'happy'} rotate={false} />
        <Button size="sm" icon="↩" onClick={onToday} className="shrink-0">
          回到今天
        </Button>
      </div>

      {byModule.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t-[3px] border-dashed border-line/30 pt-3">
          {byModule.map((m) => (
            <span key={m.id} className="flex items-center gap-1.5">
              <ModuleTag id={m.id} />
              <span className="text-sm font-bold">{formatDuration(m.totalMs)}</span>
            </span>
          ))}
        </div>
      )}
    </Panel>
  );
}
