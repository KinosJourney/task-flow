import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Panel, PanelHeader } from '@/components/comic/Panel';
import {
  useCarryOver,
  useCompleteTask,
  usePinNextTask,
  useReopenTask,
  useTodayQueue,
} from '@/features/queries';
import { OutlineTitle } from '@/features/outline/TaskOutline';
import { useOutlineActions } from '@/features/outline/useOutlineActions';
import { KEY_HINT, useOutlineKeys, type OutlineRow } from '@/features/outline/useOutlineKeys';
import { useTaskFocus } from '@/features/outline/useTaskFocus';
import { formatMonthDay, isoDateOf, todayIso } from '@/lib/date';
import { formatDuration, moduleOf } from '@/lib/format';
import type { TodayQueueGroup, TodayQueueNode } from '@shared/types';

interface TodayQueueProps {
  date: string;
  isToday: boolean;
}

export function TodayQueue({ date, isToday }: TodayQueueProps) {
  const { data } = useTodayQueue(date);
  const complete = useCompleteTask();
  const reopen = useReopenTask();
  const pinNext = usePinNextTask();
  const carryOver = useCarryOver();
  const { reveal } = useTaskFocus();

  const groups = data ?? [];
  const todoCount = groups.reduce((sum, g) => sum + g.todoCount, 0);
  const doneCount = groups.reduce((sum, g) => sum + g.doneCount, 0);
  const busy = complete.isPending || reopen.isPending || pinNext.isPending || carryOver.isPending;

  // 队列行与项目大纲共用同一套键位（ui-spec 第 3 节）。只有今天可以就地编辑：
  // 往过去某天的队列里加行没有意义，回看时标题仍点得开、跳到项目大纲里改。
  const rows = useMemo(() => flattenQueue(groups), [groups]);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const outlineActions = useOutlineActions({ inToday: true });
  const keys = useOutlineKeys({ rows, actions: outlineActions });

  const actions: RowActions = {
    busy,
    isToday,
    keys: isToday ? keys : undefined,
    rowById,
    onToggleDone: (task) => (task.isDone ? reopen.mutate(task.id) : complete.mutate(task.id)),
    onPinNext: (task) => pinNext.mutate(task.id),
    onOpen: (task) => reveal(task),
    onCarryOver: (task) => carryOver.mutate({ date: todayIso(), taskIds: [task.id] }),
  };

  return (
    <Panel>
      <PanelHeader
        title={isToday ? '今日队列' : '当日队列'}
        icon="📋"
        action={
          <span className="text-xs text-ink-soft">
            {todoCount} 项{isToday ? '待做' : '没做完'}
            {doneCount > 0 && ` · 达成 ${doneCount}`}
          </span>
        }
      />
      <div className="flex flex-col gap-4 p-3">
        {groups.length ? (
          groups.map((group) => (
            <QueueGroup key={group.projectId ?? '__loose__'} group={group} actions={actions} />
          ))
        ) : (
          <p className="p-2 text-sm text-ink-soft">
            {isToday ? '队列空空的，从项目里加点事吧。' : '这天的队列是空的。'}
          </p>
        )}
        {isToday && groups.length > 0 && (
          <p className={`px-1 text-[11px] ${keys.flash ? 'font-bold text-accent' : 'text-ink-soft'}`}>
            {keys.flash ?? KEY_HINT}
          </p>
        )}
      </div>
    </Panel>
  );
}

/** 队列的分块结构拍平成大纲行：跨块不能互相缩进，所以块名进 groupKey */
function flattenQueue(groups: TodayQueueGroup[]): OutlineRow[] {
  const out: OutlineRow[] = [];
  const walk = (nodes: TodayQueueNode[], indent: number, groupKey: string, projectId?: string) => {
    for (const node of nodes) {
      out.push({
        id: node.id,
        parentId: node.parentId,
        projectId,
        depth: node.depth,
        indent,
        groupKey,
        title: node.title,
        description: node.description,
        isDone: node.isDone,
        moduleId: node.moduleId,
        inToday: node.inToday,
      });
      walk(node.children, indent + 1, groupKey, projectId);
    }
  };
  for (const group of groups) {
    walk(group.items, 0, group.projectId ?? '__loose__', group.projectId);
  }
  return out;
}

interface RowActions {
  busy: boolean;
  isToday: boolean;
  /** 只有今天的队列可以就地编辑；回看历史时为 undefined，标题退回只读 */
  keys?: ReturnType<typeof useOutlineKeys>;
  rowById: Map<string, OutlineRow>;
  onToggleDone: (task: TodayQueueNode) => void;
  onPinNext: (task: TodayQueueNode) => void;
  onOpen: (task: TodayQueueNode) => void;
  onCarryOver: (task: TodayQueueNode) => void;
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
          {group.todoCount} 项{actions.isToday ? '待做' : '没做完'}
          {group.doneCount > 0 && ` · 达成 ${group.doneCount}`}
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
  const doneThatDay = task.status === 'done';
  return (
    <div
      className={`group/row flex items-center gap-2 rounded-lg px-3 py-2 ${
        isRoot ? 'border-[2.5px] border-line' : 'py-1'
      } ${doneThatDay ? 'bg-panel-alt' : isRoot ? 'bg-white' : ''}`}
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
      <QueueTitle task={task} actions={actions} isRoot={isRoot} doneThatDay={doneThatDay} />
      <RowNote task={task} />
      <span className="ml-auto" />
      {task.totalTimeMs > 0 && (
        <span className="text-xs text-ink-soft">{formatDuration(task.totalTimeMs)}</span>
      )}
      <RowAction task={task} actions={actions} />
    </div>
  );
}

/**
 * 今天的队列里标题就是输入框，键位与项目大纲完全一致；
 * 回看历史时退回按钮，点它跳到项目大纲里改（`?focus=`，见 ui-spec 3.5）。
 */
function QueueTitle({
  task,
  actions,
  isRoot,
  doneThatDay,
}: {
  task: TodayQueueNode;
  actions: RowActions;
  isRoot: boolean;
  doneThatDay: boolean;
}) {
  const size = isRoot ? 'text-sm' : 'text-[13px]';
  const done = doneThatDay ? 'font-bold line-through' : '';
  const row = actions.rowById.get(task.id);

  if (actions.keys && row) {
    return <OutlineTitle row={row} keys={actions.keys} className={`${size} ${done}`} />;
  }

  return (
    <button
      type="button"
      onClick={() => actions.onOpen(task)}
      title={`在项目大纲里定位「${task.title}」`}
      className={`truncate text-left hover:underline ${size} ${done}`}
    >
      {task.title}
    </button>
  );
}

/** 行内的来历/结局注记：这行是顺延来的，还是那天终究没做完 */
function RowNote({ task }: { task: TodayQueueNode }) {
  if (task.status === 'done_later' && task.doneAt) {
    return (
      <span className="shrink-0 text-[11px] whitespace-nowrap text-ink-soft">
        当天没做完 · {formatMonthDay(isoDateOf(task.doneAt))}才完成
      </span>
    );
  }
  if (task.carriedFrom) {
    return (
      <span
        className="shrink-0 rounded-full border-2 border-line bg-pop px-1.5 text-[10px] leading-tight whitespace-nowrap"
        title={`${formatMonthDay(task.carriedFrom)}就进了队列，一直顺延到现在`}
      >
        顺延
      </span>
    );
  }
  return null;
}

/**
 * 行尾操作槽。今天的行给「设为 Next Task」；回看过去某天、那天没做完的行给「顺延到今天」——
 * 顺延永远是手动的，系统不会替用户把旧事搬到今天。
 */
function RowAction({ task, actions }: { task: TodayQueueNode; actions: RowActions }) {
  if (task.isDone) {
    // 占位保持行尾对齐：已完成的任务既不能设为 Next Task 也不用顺延
    return <span className="w-5 shrink-0" />;
  }

  if (!actions.isToday) {
    return (
      <button
        type="button"
        disabled={actions.busy}
        onClick={() => actions.onCarryOver(task)}
        title={`把「${task.title}」顺延到今天`}
        aria-label={`把 ${task.title} 顺延到今天`}
        className="invisible w-5 shrink-0 text-center font-display text-lg font-extrabold leading-none text-ink transition-transform hover:scale-125 group-hover/row:visible group-focus-within/row:visible"
      >
        ↷
      </button>
    );
  }

  return (
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
  );
}
