import { Panel, PanelHeader } from '@/components/comic/Panel';
import { ModuleTag } from '@/components/comic/ModuleTag';
import { Button } from '@/components/comic/Button';
import { PeriodStepper } from '@/components/comic/PeriodStepper';
import { useSelectedWeek } from '@/features/date/useSelectedWeek';
import { useWeek, useWeekList } from '@/features/queries';
import { formatWeekRange, relativeWeekName } from '@/lib/date';
import { formatDuration } from '@/lib/format';

export function ReviewPage() {
  const { weekStart, isThisWeek, shiftWeeks, goThisWeek } = useSelectedWeek();
  const { data: weeks } = useWeekList();
  const { data: review } = useWeek(weekStart);
  const s = review?.summary;
  const confirmed = weeks?.find((w) => w.weekStart === weekStart)?.confirmed ?? false;
  const relative = relativeWeekName(weekStart);

  const fields: { key: string; label: string; placeholder: string }[] = [
    { key: 'best', label: '本周最满意的成果', placeholder: '这周你最想给自己点赞的是…' },
    { key: 'blockers', label: '遇到的阻碍', placeholder: '什么卡住了你？' },
    { key: 'energy', label: '精力与状态', placeholder: '这周状态怎么样？' },
    { key: 'lessons', label: '得到的经验', placeholder: '下次可以怎么做得更好？' },
    { key: 'next', label: '下周希望完成的结果', placeholder: '下周想要什么成果？' },
  ];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold">
            周复盘{relative && relative !== '本周' && ` · ${relative}`}
          </h1>
          <p className="text-sm text-ink-soft">
            {formatWeekRange(weekStart)}（周一至周日）
            {confirmed && ' · 已冻结'}
          </p>
        </div>
        <PeriodStepper
          onPrev={() => shiftWeeks(-1)}
          onNext={() => shiftWeeks(1)}
          prevLabel="看上一周"
          nextLabel="看下一周"
          onReset={isThisWeek ? undefined : goThisWeek}
          resetLabel="回到本周"
        >
          <span className="rounded-lg border-[2.5px] border-line bg-white px-3 py-1 text-sm font-bold whitespace-nowrap shadow-[2px_2px_0_0_var(--color-line)]">
            {relative ?? weekStart}
          </span>
        </PeriodStepper>
      </header>

      <Panel>
        <PanelHeader title="自动汇总" icon="📊" action={<span className="text-xs text-ink-soft">系统自动统计</span>} />
        <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-bold">各模块完成任务</h3>
            <div className="flex flex-wrap gap-2">
              {s?.moduleTasks.map((m) => (
                <span key={m.moduleId} className="flex items-center gap-1">
                  <ModuleTag id={m.moduleId} />
                  <span className="text-sm font-bold">×{m.doneCount}</span>
                </span>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-bold">各模块投入时间</h3>
            <div className="flex flex-wrap gap-2">
              {s?.moduleTime.map((m) => (
                <span key={m.moduleId} className="flex items-center gap-1">
                  <ModuleTag id={m.moduleId} />
                  <span className="text-sm font-bold">{formatDuration(m.totalMs)}</span>
                </span>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-bold">今日三件事完成</h3>
            <p className="text-sm">
              {s ? `${s.focusCompletion.done} / ${s.focusCompletion.total}` : '—'}
            </p>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-bold">仍在今日队列</h3>
            <p className="text-sm">{s?.unfinishedInQueue ?? 0} 项未完成</p>
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="手动复盘" icon="✍️" />
        <div className="flex flex-col gap-4 p-4">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-sm font-bold">{f.label}</label>
              <textarea
                rows={2}
                placeholder={f.placeholder}
                className="w-full resize-none rounded-lg border-[2.5px] border-line bg-white px-3 py-2 text-sm outline-none focus:bg-panel-alt"
              />
            </div>
          ))}
          <div className="flex justify-end">
            <Button variant="accent" icon="🔒" disabled={confirmed}>
              {confirmed ? '这一周已冻结' : `确认并冻结${relative === '本周' ? '本周' : '这一周'}复盘`}
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
