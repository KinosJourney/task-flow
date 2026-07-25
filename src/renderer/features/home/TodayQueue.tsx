import { Link } from 'react-router-dom';
import { Panel, PanelHeader } from '@/components/comic/Panel';
import { useCompleteTask, usePinNextTask, useReopenTask, useTodayQueue } from '@/features/queries';
import { useTaskDrawer } from '@/features/task/useTaskDrawer';
import { formatDuration, moduleOf } from '@/lib/format';
import type { TodayQueueGroup, TodayQueueNode } from '@shared/types';

export function TodayQueue() {
  const { data } = useTodayQueue();
  const complete = useCompleteTask();
  const reopen = useReopenTask();
  const pinNext = usePinNextTask();
  const drawer = useTaskDrawer();

  const groups = data ?? [];
  const todoCount = groups.reduce((sum, g) => sum + g.todoCount, 0);
  const doneCount = groups.reduce((sum, g) => sum + g.doneCount, 0);
  const busy = complete.isPending || reopen.isPending || pinNext.isPending;

  const actions: RowActions = {
    busy,
    onToggleDone: (task) => (task.isDone ? reopen.mutate(task.id) : complete.mutate(task.id)),
    onPinNext: (task) => pinNext.mutate(task.id),
    onOpen: (task) => drawer.open(task.id),
  };

  return (
    <Panel>
      <PanelHeader
        title="今日队列"
        icon="📋"
        action={
          <span className="text-xs text-ink-soft">
            {todoCount} 项待做{doneCount > 0 && ` · 已完成 ${doneCount}`}
          </span>
        }
      />
      <div className="flex flex-col gap-4 p-3">
        {groups.length ? (
          groups.map((group) => (
            <QueueGroup key={group.projectId ?? '__loose__'} group={group} actions={actions} />
          ))
        ) : (
          <p className="p-2 text-sm text-ink-soft">队列空空的，从项目里加点事吧。</p>
        )}
      </div>
    </Panel>
  );
}

interface RowActions {
  busy: boolean;
  onToggleDone: (task: TodayQueueNode) => void;
  onPinNext: (task: TodayQueueNode) => void;
  onOpen: (task: TodayQueueNode) => void;
}

/** 一个项目一块；不属于任何项目的散任务共用最后那块 */
function QueueGroup({ group, actions }: { group: TodayQueueGroup; actions: RowActions }) {
  const color = group.moduleId ? moduleOf(group.moduleId).color : undefined;
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 border-b-2 border-dashed border-line/40 pb-1">
        {color ? (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-line"
            style={{ backgroundColor: color }}
            aria-hidden
          />
        ) : null}
        {group.projectId ? (
          <Link
            to={`/projects/${group.projectId}`}
            className="font-display text-sm font-extrabold hover:underline"
          >
            {group.projectName}
          </Link>
        ) : (
          <h3 className="font-display text-sm font-extrabold text-ink-soft">零散任务</h3>
        )}
        <span className="ml-auto text-[11px] text-ink-soft">
          {group.todoCount} 项待做{group.doneCount > 0 && ` · 已完成 ${group.doneCount}`}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {group.items.map((task) => (
          <QueueBranch key={task.id} task={task} depth={0} actions={actions} />
        ))}
      </div>
    </section>
  );
}

/** 一行队列任务连同它的整棵子任务树；子任务靠缩进与竖线表达从属关系 */
function QueueBranch({
  task,
  depth,
  actions,
}: {
  task: TodayQueueNode;
  depth: number;
  actions: RowActions;
}) {
  return (
    <div>
      <QueueRow task={task} depth={depth} actions={actions} />
      {task.children.length > 0 && (
        <div className="ml-[9px] mt-1.5 flex flex-col gap-1.5 border-l-[2.5px] border-line/25 pl-3">
          {task.children.map((child) => (
            <QueueBranch key={child.id} task={child} depth={depth + 1} actions={actions} />
          ))}
        </div>
      )}
    </div>
  );
}

function QueueRow({
  task,
  depth,
  actions,
}: {
  task: TodayQueueNode;
  depth: number;
  actions: RowActions;
}) {
  const module = moduleOf(task.moduleId);
  const isRoot = depth === 0;
  return (
    <div
      className={`group/row flex items-center gap-2 rounded-lg px-3 py-2 ${
        isRoot ? 'border-[2.5px] border-line' : 'py-1'
      } ${task.isDone ? 'bg-panel-alt' : isRoot ? 'bg-white' : ''}`}
    >
      <button
        type="button"
        disabled={actions.busy}
        onClick={() => actions.onToggleDone(task)}
        title={task.isDone ? `恢复「${task.title}」为未完成` : `完成「${task.title}」`}
        aria-label={task.isDone ? `恢复 ${task.title} 为未完成` : `完成 ${task.title}`}
        aria-pressed={task.isDone}
        className={`group/check flex shrink-0 items-center justify-center rounded-full border-2 border-line font-extrabold leading-none text-ink transition-transform hover:scale-125 disabled:cursor-progress ${
          isRoot ? 'h-[18px] w-[18px] text-[10px]' : 'h-[14px] w-[14px] text-[8px]'
        }`}
        style={{ backgroundColor: module.color }}
      >
        <span className={task.isDone ? '' : 'invisible group-hover/check:visible'}>✓</span>
      </button>
      {/* 完成保持黑色加粗划线，不置灰：达成是成果不是废弃（与今日三件事一致） */}
      <button
        type="button"
        onClick={() => actions.onOpen(task)}
        title={`打开「${task.title}」的详情`}
        className={`flex-1 truncate text-left hover:underline ${isRoot ? 'text-sm' : 'text-[13px]'} ${
          task.isDone ? 'font-bold line-through' : ''
        }`}
      >
        {task.title}
      </button>
      {task.totalTimeMs > 0 && (
        <span className="text-xs text-ink-soft">{formatDuration(task.totalTimeMs)}</span>
      )}
      {task.isDone ? (
        // 占位保持行尾对齐：已完成的任务不能再设为 Next Task
        <span className="w-5 shrink-0" />
      ) : (
        <button
          type="button"
          disabled={actions.busy}
          onClick={() => actions.onPinNext(task)}
          title={`把「${task.title}」设为 Next Task`}
          aria-label={`把 ${task.title} 设为 Next Task`}
          className="invisible w-5 shrink-0 text-center font-display text-lg font-extrabold leading-none text-ink transition-transform hover:scale-125 group-hover/row:visible group-focus-within/row:visible"
        >
          →
        </button>
      )}
    </div>
  );
}
