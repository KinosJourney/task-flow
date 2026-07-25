import { useEffect, useRef, useState } from 'react';
import { Drawer } from '@/components/comic/Drawer';
import { Button } from '@/components/comic/Button';
import { ModuleDot } from '@/components/comic/ModuleTag';
import { Mascot } from '@/components/assistant/Mascot';
import { Section } from './Section';
import { TaskNotes } from './TaskNotes';
import { TaskSubtasks } from './TaskSubtasks';
import { TaskTimeEntries } from './TaskTimeEntries';
import { useTaskDrawer } from './useTaskDrawer';
import {
  useActiveTimer,
  useCompleteTask,
  useDeleteTask,
  useModules,
  usePinNextTask,
  useProjects,
  useReopenTask,
  useStartTimer,
  useStopTimer,
  useTask,
  useToggleToday,
  useUpdateTask,
} from '@/features/queries';
import { formatDuration, formatStopwatch, toDatetimeLocalValue } from '@/lib/format';
import { useNow } from '@/lib/useNow';
import type { ModuleId, TaskFull } from '@shared/types';

/**
 * 任务详情抽屉——全应用唯一的任务编辑界面（ui-spec 第 3 节）。
 * 挂在 AppShell 上，任意页面都能用 `?task=<id>` 唤起，不打断当前页面的执行流。
 */
export function TaskDetailDrawer() {
  const { taskId, close } = useTaskDrawer();
  const { data: task, isLoading, isError } = useTask(taskId);

  return (
    <Drawer open={Boolean(taskId)} onClose={close} label={task?.title ?? '任务详情'}>
      <header className="flex shrink-0 items-center gap-2 border-b-[3px] border-line bg-panel px-4 py-2.5">
        <span className="tag bg-accent">任务</span>
        <div className="flex-1" />
        {task && <CompleteToggle task={task} />}
        <button
          type="button"
          aria-label="关闭"
          className="flex h-8 w-8 items-center justify-center rounded-lg border-[2.5px] border-line bg-panel font-bold hover:bg-panel-alt"
          onClick={close}
        >
          ✕
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {isError ? (
          <div className="flex items-start gap-3 pt-4">
            <Mascot size={64} mood="think" />
            <div className="bubble text-sm">这件事已经不在了，可能被删掉了。</div>
          </div>
        ) : isLoading || !task ? (
          <Skeleton />
        ) : (
          <>
            <Identity task={task} />
            <Execution task={task} />
            <Timing task={task} />
            <TaskTimeEntries taskId={task.id} />
            <TaskSubtasks task={task} />
            <TaskNotes task={task} />
            <Footer task={task} onDeleted={close} />
          </>
        )}
      </div>
    </Drawer>
  );
}

function CompleteToggle({ task }: { task: TaskFull }) {
  const complete = useCompleteTask();
  const reopen = useReopenTask();
  return (
    <Button
      size="sm"
      variant={task.isDone ? 'default' : 'pop'}
      icon={task.isDone ? '↩' : '✓'}
      onClick={() => (task.isDone ? reopen.mutate(task.id) : complete.mutate(task.id))}
    >
      {task.isDone ? '取消完成' : '完成'}
    </Button>
  );
}

function Identity({ task }: { task: TaskFull }) {
  const { open } = useTaskDrawer();
  const update = useUpdateTask();
  const { data: modules } = useModules();
  const { data: projects } = useProjects();

  return (
    <section className="flex flex-col gap-2">
      <nav className="flex flex-wrap items-center gap-1 text-[11px] text-ink-soft">
        {task.projectName && <span className="font-bold">{task.projectName}</span>}
        {task.ancestors.map((a) => (
          <span key={a.id} className="flex items-center gap-1">
            <span>›</span>
            <button type="button" className="hover:underline" onClick={() => open(a.id)}>
              {a.title}
            </button>
          </span>
        ))}
      </nav>

      <TitleEditor task={task} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-1.5 text-[11px] font-bold text-ink-soft">
          模块
          <ModuleDot id={task.moduleId} />
          <select
            className="field"
            value={task.moduleId}
            onChange={(e) => update.mutate({ id: task.id, moduleId: e.target.value as ModuleId })}
          >
            {(modules ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[11px] font-bold text-ink-soft">
          项目
          <select
            className="field"
            value={task.projectId ?? ''}
            onChange={(e) => update.mutate({ id: task.id, projectId: e.target.value || null })}
          >
            <option value="">（无项目）</option>
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

function TitleEditor({ task }: { task: TaskFull }) {
  const update = useUpdateTask();
  const [draft, setDraft] = useState(task.title);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(task.title);
  }, [task.id, task.title]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  function commit() {
    const next = draft.trim();
    if (!next || next === task.title) {
      setDraft(task.title);
      return;
    }
    update.mutate({ id: task.id, title: next });
  }

  return (
    <textarea
      ref={ref}
      rows={1}
      value={draft}
      aria-label="任务标题"
      className={`w-full resize-none overflow-hidden rounded-lg border-[2.5px] border-transparent bg-transparent px-1.5 py-0.5 text-xl font-extrabold leading-snug outline-none hover:border-line/25 focus:border-line focus:bg-white ${
        task.isDone ? 'text-ink-soft line-through' : ''
      }`}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          // 第一下 Esc 撤销这次编辑，别顺手把抽屉也关了
          e.stopPropagation();
          setDraft(task.title);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function Execution({ task }: { task: TaskFull }) {
  const toggleToday = useToggleToday();
  const pinNext = usePinNextTask();
  const start = useStartTimer();
  const stop = useStopTimer();
  const { data: active } = useActiveTimer();

  const running = Boolean(active && active.taskId === task.id);
  const now = useNow(running);
  const elapsed = running && active ? now - active.startedAt : 0;

  return (
    <Section title="执行" icon="🚀">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={running ? 'pop' : 'accent'}
          icon={running ? '⏸' : '▶'}
          disabled={task.isDone}
          onClick={() => (running ? stop.mutate() : start.mutate(task.id))}
        >
          {running ? '停止计时' : '开始计时'}
        </Button>
        <Button
          size="sm"
          icon={task.inToday ? '−' : '＋'}
          onClick={() => toggleToday.mutate({ taskId: task.id, inToday: !task.inToday })}
        >
          {task.inToday ? '移出今日队列' : '加入今日队列'}
        </Button>
        <Button size="sm" icon="📌" disabled={task.isDone} onClick={() => pinNext.mutate(task.id)}>
          设为 Next Task
        </Button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-ink-soft">
        <span>
          已投入 <b className="text-ink">{formatDuration(task.totalTimeMs)}</b>
        </span>
        {running && (
          <span className="speedlines flex items-center gap-1.5 rounded px-2 py-0.5 font-bold text-ink">
            计时中
            <span className="font-display tabular-nums">{formatStopwatch(elapsed)}</span>
          </span>
        )}
        {task.linkedFocusSlot && (
          <span className="tag bg-pop text-ink">今日第 {task.linkedFocusSlot} 件事</span>
        )}
      </div>
    </Section>
  );
}

function Timing({ task }: { task: TaskFull }) {
  const update = useUpdateTask();
  return (
    <Section title="时间" icon="📅">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-[11px] font-bold text-ink-soft">
          截止日期
          <input
            type="date"
            className="field"
            value={task.dueDate ?? ''}
            onChange={(e) => update.mutate({ id: task.id, dueDate: e.target.value || null })}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-bold text-ink-soft">
          日程时间
          <input
            type="datetime-local"
            className="field"
            value={toDatetimeLocalValue(task.scheduledAt)}
            onChange={(e) =>
              update.mutate({
                id: task.id,
                scheduledAt: e.target.value ? new Date(e.target.value).getTime() : null,
              })
            }
          />
        </label>
      </div>
      <p className="mt-2 text-[11px] text-ink-soft">
        截止日期只是提示，不做强制管理；填了日程时间就会出现在时间轴的「计划」轨。
      </p>
    </Section>
  );
}

function Footer({ task, onDeleted }: { task: TaskFull; onDeleted: () => void }) {
  const remove = useDeleteTask();
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    await remove.mutateAsync(task.id);
    onDeleted();
  }

  return (
    <div className="flex items-center justify-between gap-3 px-1 pb-2 text-[11px] text-ink-soft">
      <span>创建于 {new Date(task.createdAt).toLocaleDateString('zh-CN')}</span>
      {confirming ? (
        <span className="flex items-center gap-2">
          连子任务和批注一起删？
          <button type="button" className="font-bold text-accent" onClick={() => void handleDelete()}>
            确认删除
          </button>
          <button type="button" onClick={() => setConfirming(false)}>
            取消
          </button>
        </span>
      ) : (
        <button type="button" className="hover:underline" onClick={() => setConfirming(true)}>
          删除这个任务
        </button>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-7 w-2/3 rounded-lg bg-panel-alt" />
      <div className="h-4 w-1/3 rounded bg-panel-alt" />
      <div className="subpanel h-24 bg-panel-alt/60" />
      <div className="subpanel h-20 bg-panel-alt/60" />
    </div>
  );
}
