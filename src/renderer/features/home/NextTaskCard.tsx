import { useState } from 'react';
import { Button } from '@/components/comic/Button';
import { ModuleTag } from '@/components/comic/ModuleTag';
import { Assistant } from '@/components/assistant/Assistant';
import { Mascot } from '@/components/assistant/Mascot';
import { useCompleteTask, useNextTask, usePinNextTask } from '@/features/queries';
import { useTaskDrawer } from '@/features/task/useTaskDrawer';
import { formatDuration, formatStopwatch } from '@/lib/format';
import { useStopwatch } from '@/lib/useStopwatch';
import type { NextRule } from '@shared/types';

const MOOD_BY_RULE: Record<NextRule, 'happy' | 'cheer' | 'think'> = {
  manual_pin: 'cheer',
  active_timer: 'cheer',
  focus_linked: 'cheer',
  in_progress: 'happy',
  project_next_action: 'happy',
  today_queue_top: 'happy',
  module_balance: 'think',
};

export function NextTaskCard() {
  const [excludeId, setExcludeId] = useState<string | undefined>(undefined);
  const [timing, setTiming] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const { data, isLoading, refetch } = useNextTask(excludeId);
  const { elapsedMs, reset: resetTimer } = useStopwatch(timing);
  const complete = useCompleteTask();
  const pinNext = usePinNextTask();
  const drawer = useTaskDrawer();

  const task = data?.task ?? null;
  const reason = data?.reason ?? null;

  function handleSwap() {
    // 换一个即放弃手动指定，否则被指定的任务会一直排在最前
    if (reason?.rule === 'manual_pin') pinNext.mutate(null);
    setExcludeId(task?.id);
    setTiming(false);
    resetTimer();
  }
  function handleComplete() {
    if (task) complete.mutate(task.id);
    setCelebrate(true);
    setTiming(false);
    resetTimer();
    setTimeout(() => {
      setCelebrate(false);
      setExcludeId(task?.id);
      void refetch();
    }, 900);
  }

  return (
    <section className="relative">
      <div className="mb-2 flex items-center gap-2">
        <span className="tag bg-accent">NEXT TASK</span>
        <span className="text-sm text-ink-soft">现在最该做的一件事</span>
      </div>

      <div className="panel relative overflow-hidden p-6">
        <div className="halftone pointer-events-none absolute -right-6 -top-6 h-40 w-40 rounded-full" />

        {isLoading ? (
          <div className="py-10 text-center text-ink-soft">小电正在帮你挑…</div>
        ) : !task ? (
          <div className="py-6">
            <Assistant size={72} message="今日队列清空啦，去项目里挑点事，或者好好休息一下！" />
          </div>
        ) : celebrate ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            <div className="animate-pop font-display text-5xl font-extrabold text-accent">达成！</div>
            <Mascot size={72} mood="cheer" />
          </div>
        ) : (
          <div className="relative z-10">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {task.projectName && (
                <span className="text-sm font-bold text-ink-soft">{task.projectName}</span>
              )}
              <ModuleTag id={task.moduleId} />
              {task.linkedFocusSlot && (
                <span className="tag bg-pop text-ink">今日第 {task.linkedFocusSlot} 件事</span>
              )}
            </div>

            <h1 className="mb-4 text-3xl font-extrabold leading-tight">{task.title}</h1>

            <div className="mb-5 flex items-center gap-4 text-sm text-ink-soft">
              <span>已投入 {formatDuration(task.totalTimeMs)}</span>
              {timing ? (
                <span className="speedlines flex items-center gap-2 rounded px-2 py-0.5 font-bold text-ink">
                  计时中
                  <span className="font-display text-base tabular-nums">
                    {formatStopwatch(elapsedMs)}
                  </span>
                </span>
              ) : (
                elapsedMs > 0 && (
                  <span className="flex items-center gap-2 font-bold text-ink">
                    已暂停
                    <span className="font-display text-base tabular-nums">
                      {formatStopwatch(elapsedMs)}
                    </span>
                  </span>
                )
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="accent" icon={timing ? '⏸' : '▶'} onClick={() => setTiming((v) => !v)}>
                {timing ? '暂停' : '开始计时'}
              </Button>
              <Button variant="pop" icon="✓" onClick={handleComplete}>
                完成
              </Button>
              <Button icon="🔄" onClick={handleSwap}>
                换一个
              </Button>
              <Button icon="🔍" onClick={() => drawer.open(task.id)}>
                查看上下文
              </Button>
            </div>
          </div>
        )}
      </div>

      {task && reason && !celebrate && (
        <div className="mt-4">
          <Assistant size={56} mood={MOOD_BY_RULE[reason.rule]} message={reason.message} />
        </div>
      )}
    </section>
  );
}
