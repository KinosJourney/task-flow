import { useMemo, useState } from 'react';
import {
  useConvertNoteToTask,
  useCreateNote,
  useDeleteNote,
} from '@/features/queries';
import type { Note, NoteKind } from '@shared/types';

/** 批注的四种类型（PRD 第 10 节）。图标兼作颜色之外的第二重区分（ui-spec 6.4） */
const KINDS: { id: NoteKind; label: string; icon: string }[] = [
  { id: 'note', label: '备注', icon: '📝' },
  { id: 'idea', label: '想法', icon: '💡' },
  { id: 'question', label: '问题', icon: '❓' },
  { id: 'link', label: '链接', icon: '🔗' },
];

/** 只有想法和问题谈得上「转正」；备注与链接是资料，不是待办 */
const CONVERTIBLE: NoteKind[] = ['idea', 'question'];

export interface NoteActions {
  add(input: { taskId: string; kind: NoteKind; content: string; url?: string }): void;
  remove(id: string): void;
  convert(id: string): void;
}

export function useNoteActions(): NoteActions {
  const create = useCreateNote();
  const remove = useDeleteNote();
  const convert = useConvertNoteToTask();

  return useMemo<NoteActions>(
    () => ({
      add: (input) => create.mutate(input),
      remove: (id) => remove.mutate(id),
      convert: (id) => convert.mutate(id),
    }),
    [create, remove, convert],
  );
}

/** 按任务分桶，大纲每行只画自己那几条 */
export function groupNotesByTask(notes: Note[]): Map<string, Note[]> {
  const grouped = new Map<string, Note[]>();
  for (const note of notes) {
    if (!note.taskId) continue;
    const bucket = grouped.get(note.taskId);
    if (bucket) bucket.push(note);
    else grouped.set(note.taskId, [note]);
  }
  return grouped;
}

/**
 * 挂在大纲某一行下面的批注区。批注是随手记下的碎片，可以有很多条、能转成任务；
 * 描述是这件事本身的说明，只有一份（ui-spec 3.3）——所以两者分开画。
 */
export function TaskNotes({
  taskId,
  notes,
  actions,
}: {
  taskId: string;
  notes: Note[];
  actions: NoteActions;
}) {
  const [composing, setComposing] = useState(false);

  return (
    <div className="ml-[26px] flex flex-col gap-1">
      {notes.map((note) => (
        <NoteChip key={note.id} note={note} actions={actions} />
      ))}

      {composing ? (
        <NoteComposer
          taskId={taskId}
          actions={actions}
          onClose={() => setComposing(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="w-fit px-1 text-left text-[11px] text-ink-soft opacity-0 transition hover:text-accent focus-visible:opacity-100 group-hover/row:opacity-100"
        >
          ＋ 批注
        </button>
      )}
    </div>
  );
}

function NoteChip({ note, actions }: { note: Note; actions: NoteActions }) {
  const kind = KINDS.find((k) => k.id === note.kind) ?? KINDS[0];
  const converted = Boolean(note.convertedTaskId);

  return (
    <div className="group/note annotation flex items-start gap-1.5 px-2.5 py-1 text-[13px]">
      <span title={kind.label} aria-label={kind.label}>
        {kind.icon}
      </span>
      {note.url ? (
        <a
          href={note.url}
          target="_blank"
          rel="noreferrer"
          className="flex-1 font-bold text-accent hover:underline"
        >
          {note.content}
        </a>
      ) : (
        <span className="flex-1">{note.content}</span>
      )}

      {converted && (
        <span className="shrink-0 text-[11px] text-ink-soft" title="这条已经转成正式任务了">
          已转为任务
        </span>
      )}
      {!converted && CONVERTIBLE.includes(note.kind) && (
        <button
          type="button"
          onClick={() => actions.convert(note.id)}
          title="转为正式任务"
          className="shrink-0 text-[11px] font-bold opacity-0 hover:text-accent focus-visible:opacity-100 group-hover/note:opacity-100"
        >
          转为任务
        </button>
      )}
      <button
        type="button"
        onClick={() => actions.remove(note.id)}
        title="删掉这条批注"
        aria-label="删掉这条批注"
        className="shrink-0 opacity-0 hover:text-accent focus-visible:opacity-100 group-hover/note:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}

function NoteComposer({
  taskId,
  actions,
  onClose,
}: {
  taskId: string;
  actions: NoteActions;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<NoteKind>('note');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');

  const submit = () => {
    const trimmed = content.trim();
    if (!trimmed) return onClose();
    actions.add({
      taskId,
      kind,
      content: trimmed,
      url: kind === 'link' ? url.trim() || undefined : undefined,
    });
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        className="field py-0.5 text-[12px]"
        value={kind}
        onChange={(e) => setKind(e.target.value as NoteKind)}
        aria-label="批注类型"
      >
        {KINDS.map((k) => (
          <option key={k.id} value={k.id}>
            {k.icon} {k.label}
          </option>
        ))}
      </select>
      <input
        autoFocus
        className="field min-w-40 flex-1 py-0.5 text-[12px]"
        placeholder={kind === 'link' ? '链接的说明' : '随手记一句…'}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={onKeyDown}
        aria-label="批注内容"
      />
      {kind === 'link' && (
        <input
          className="field min-w-40 flex-1 py-0.5 text-[12px]"
          placeholder="https://"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="链接地址"
        />
      )}
      <button
        type="button"
        onClick={submit}
        onMouseDown={(e) => e.preventDefault()}
        className="btn btn-sm"
      >
        记下
      </button>
    </div>
  );
}
