import { useEffect, useRef } from 'react';
import { moduleOf } from '@/lib/format';
import { KEY_HINT, useOutlineKeys, type OutlineActions, type OutlineRow } from './useOutlineKeys';

interface TaskOutlineProps {
  rows: OutlineRow[];
  actions: OutlineActions;
  /** 外部要求把光标放到某一行（首页「查看上下文」跳过来，见 ui-spec 3.5） */
  focusTaskId?: string | null;
  onFocusConsumed?: () => void;
  emptyHint?: string;
}

type OutlineKeys = ReturnType<typeof useOutlineKeys>;

/** 项目页用的默认大纲视觉；首页队列复用 useOutlineKeys 但保留自己的行样式 */
export function TaskOutline({
  rows,
  actions,
  focusTaskId,
  onFocusConsumed,
  emptyHint = '按 Enter 或点这里开始写',
}: TaskOutlineProps) {
  const keys = useOutlineKeys({ rows, actions });
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusTaskId) return;
    const el = container.current?.querySelector<HTMLInputElement>(`[data-task-id="${focusTaskId}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus();
    el.select();
    onFocusConsumed?.();
  }, [focusTaskId, rows, onFocusConsumed]);

  return (
    <div ref={container}>
      {rows.length === 0 ? (
        <button
          type="button"
          onClick={() => void keys.startFirstRow()}
          className="w-full rounded-lg border-[2.5px] border-dashed border-line/40 px-3 py-3 text-left text-sm text-ink-soft hover:border-line hover:bg-white"
        >
          ＋ {emptyHint}
        </button>
      ) : (
        <div className="flex flex-col gap-0.5">
          {rows.map((row) => (
            <div key={row.id} style={{ paddingLeft: row.indent * 22 }}>
              <div className="group/row flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => actions.toggleDone(row.id, !row.isDone)}
                  title={row.isDone ? `恢复「${row.title}」为未完成` : `完成「${row.title}」`}
                  aria-label={row.isDone ? `恢复 ${row.title} 为未完成` : `完成 ${row.title}`}
                  aria-pressed={row.isDone}
                  className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 border-line text-[10px] font-extrabold leading-none text-ink transition-transform hover:scale-125"
                  style={{ backgroundColor: moduleOf(row.moduleId).color }}
                >
                  <span className={row.isDone ? '' : 'invisible group-hover/row:visible'}>✓</span>
                </button>
                <OutlineTitle row={row} keys={keys} />
              </div>
              {keys.hasDescription(row) && <OutlineDescription row={row} keys={keys} />}
            </div>
          ))}
        </div>
      )}

      <p className={`mt-2 px-1 text-[11px] ${keys.flash ? 'font-bold text-accent' : 'text-ink-soft'}`}>
        {keys.flash ?? KEY_HINT}
      </p>
    </div>
  );
}

/** 标题输入框：无边框直到悬停/聚焦，读起来像一份清单而不是一堆表单 */
export function OutlineTitle({
  row,
  keys,
  className = '',
}: {
  row: OutlineRow;
  keys: OutlineKeys;
  className?: string;
}) {
  return (
    <input
      key={row.id}
      data-task-id={row.id}
      placeholder="写点什么…"
      aria-label="任务标题"
      className={`flex-1 rounded-md border-2 border-transparent bg-transparent px-1.5 py-1 text-sm outline-none hover:border-line/20 focus:border-line focus:bg-white ${
        row.isDone ? 'font-bold line-through' : ''
      } ${className}`}
      {...keys.titleProps(row)}
    />
  );
}

/** 描述用手写批注样式，明确区别于任务行：它不进待办统计也不算进度 */
export function OutlineDescription({ row, keys }: { row: OutlineRow; keys: OutlineKeys }) {
  const { ref, ...rest } = keys.descriptionProps(row);
  return (
    <textarea
      key={`d:${row.id}`}
      rows={1}
      placeholder="描述…"
      aria-label="任务描述"
      className="annotation ml-[26px] mb-1.5 mt-1 w-[calc(100%-26px)] resize-none overflow-hidden px-2.5 py-1.5 text-[13px] text-ink-soft outline-none focus:text-ink"
      onInput={(e) => autoGrow(e.currentTarget)}
      ref={(el) => {
        ref(el);
        if (el) autoGrow(el);
      }}
      {...rest}
    />
  );
}

function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}
