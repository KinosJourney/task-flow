import { useEffect, useRef, useState } from 'react';
import { Panel, PanelHeader } from '@/components/comic/Panel';
import { Stamp } from '@/components/comic/Stamp';
import { useFocusDay, useSetFocus, useToggleFocusDone } from '@/features/queries';
import type { DailyFocus } from '@shared/types';

const SLOTS = [1, 2, 3];

interface TodayFocusProps {
  /** 看哪天的三件事；历史日期照样能改，PRD 允许任意日期补写 */
  date: string;
  isToday: boolean;
}

export function TodayFocus({ date, isToday }: TodayFocusProps) {
  const { data } = useFocusDay(date);
  const setFocus = useSetFocus();
  const toggleDone = useToggleFocusDone();
  const busy = setFocus.isPending || toggleDone.isPending;
  const doneCount = data?.filter((f) => f.content && f.isDone).length ?? 0;
  const allClear = doneCount === SLOTS.length;

  return (
    <Panel className="relative">
      <PanelHeader
        title={isToday ? '今日三件事' : '当日三件事'}
        icon="🌟"
        action={<span className="text-xs text-ink-soft">{doneCount} / 3 达成</span>}
      />
      {allClear && (
        <Stamp
          text="Mission Clear"
          sub={data?.[0]?.date}
          className="absolute right-3 bottom-4 z-10"
        />
      )}
      <div className="flex flex-col gap-2 p-3">
        {SLOTS.map((slot) => {
          const focus = data?.find((f) => f.slot === slot);
          return (
            <FocusRow
              // 带上日期：换天时整行重挂，未提交的草稿不会跟着漂到另一天
              key={`${date}-${slot}`}
              slot={slot}
              focus={focus}
              isToday={isToday}
              busy={busy}
              onCommit={(content) => setFocus.mutate({ date, slot, content })}
              onToggleDone={() => {
                if (focus) toggleDone.mutate({ focusId: focus.id, isDone: !focus.isDone });
              }}
            />
          );
        })}
      </div>
    </Panel>
  );
}

interface FocusRowProps {
  slot: number;
  focus?: DailyFocus;
  isToday: boolean;
  busy: boolean;
  onCommit: (content: string) => void;
  onToggleDone: () => void;
}

function FocusRow({ slot, focus, isToday, busy, onCommit, onToggleDone }: FocusRowProps) {
  const saved = focus?.content ?? '';
  const isDone = Boolean(focus?.isDone);
  const [draft, setDraft] = useState(saved);
  const editingRef = useRef(false);

  // 正在输入时不让后台刷新回来的值覆盖草稿
  useEffect(() => {
    if (!editingRef.current) setDraft(saved);
  }, [saved]);

  function commit() {
    editingRef.current = false;
    const next = draft.trim();
    if (next === saved) {
      setDraft(saved);
      return;
    }
    onCommit(next);
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border-[2.5px] border-line bg-panel-alt px-3 py-2 focus-within:bg-white">
      <button
        type="button"
        disabled={busy || !saved}
        onClick={onToggleDone}
        title={saved ? `${isDone ? '取消' : '标记'}第 ${slot} 件事达成` : '先写下那天想要的结果'}
        aria-pressed={isDone}
        aria-label={`第 ${slot} 件事${isDone ? '已达成' : '未达成'}`}
        className="group/check flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-line bg-pop text-xs font-bold leading-none transition-transform enabled:hover:scale-110 disabled:cursor-default"
      >
        {isDone ? (
          '✓'
        ) : saved ? (
          <>
            <span className="group-hover/check:hidden">{slot}</span>
            <span className="hidden group-hover/check:inline">✓</span>
          </>
        ) : (
          slot
        )}
      </button>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => {
          editingRef.current = true;
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setDraft(saved);
        }}
        placeholder={isToday ? '（今天想要的结果…）' : '（那天想要的结果…）'}
        aria-label={`第 ${slot} 件事`}
        className={`flex-1 bg-transparent text-sm outline-none placeholder:text-ink-soft ${
          isDone ? 'font-bold text-ink line-through' : ''
        }`}
      />
    </div>
  );
}
