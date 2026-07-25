import { useState } from 'react';
import { Button } from '@/components/comic/Button';
import { Panel } from '@/components/comic/Panel';
import { ModuleDot } from '@/components/comic/ModuleTag';
import { useBacklog, useCarryOver } from '@/features/queries';
import { diffDays, formatMonthDay, todayIso } from '@/lib/date';

/**
 * 昨天以前没做完的事**不会自动跟到今天**（PRD 5.4）：跨天时它们留在原本那一天，
 * 要不要捡起来由用户决定。这条提示负责让遗留被看见，并给出一次点击就能全部顺延的出口。
 * 无遗留时整条不渲染——没有欠账的早晨不该被提醒有欠账。
 */
export function CarryOverBanner() {
  const today = todayIso();
  const { data } = useBacklog(today);
  const carryOver = useCarryOver();
  const [expanded, setExpanded] = useState(false);

  const items = data?.items ?? [];
  if (items.length === 0) return null;

  const oldestDays = data?.oldestDate ? diffDays(today, data.oldestDate) : 0;

  return (
    <Panel className="flex flex-col gap-3 border-dashed bg-panel-alt p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-display text-base font-extrabold">
          还有 {items.length} 项没做完
        </span>
        <span className="text-sm text-ink-soft">
          {oldestDays > 1 ? `最久的一项从 ${oldestDays} 天前拖到现在` : '来自昨天'}
          ，要一起带到今天吗？
        </span>
        <div className="ml-auto flex shrink-0 gap-2">
          <Button size="sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? '收起' : '看看是哪些'}
          </Button>
          <Button
            size="sm"
            variant="accent"
            icon="↷"
            disabled={carryOver.isPending}
            onClick={() => carryOver.mutate({ date: today })}
          >
            全部顺延到今天
          </Button>
        </div>
      </div>

      {expanded && (
        <ul className="flex flex-col gap-1.5 border-t-[2.5px] border-dashed border-line/30 pt-3">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-sm">
              <ModuleDot id={item.moduleId} />
              <span className="truncate">{item.title}</span>
              {item.projectName && (
                <span className="shrink-0 text-[11px] text-ink-soft">{item.projectName}</span>
              )}
              <span className="ml-auto shrink-0 text-[11px] whitespace-nowrap text-ink-soft">
                {formatMonthDay(item.queuedDate)}起
              </span>
              <button
                type="button"
                disabled={carryOver.isPending}
                onClick={() => carryOver.mutate({ date: today, taskIds: [item.id] })}
                title={`只把「${item.title}」顺延到今天`}
                aria-label={`把 ${item.title} 顺延到今天`}
                className="shrink-0 font-display text-base font-extrabold leading-none transition-transform hover:scale-125 disabled:cursor-progress"
              >
                ↷
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
