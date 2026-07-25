import { useState } from 'react';
import { Button } from '@/components/comic/Button';
import { EmptyHint, Section } from './Section';
import { useTaskDrawer } from './useTaskDrawer';
import { useConvertNoteToTask, useCreateNote, useDeleteNote } from '@/features/queries';
import type { NoteKind, TaskFull } from '@shared/types';

const KINDS: { id: NoteKind; label: string; icon: string }[] = [
  { id: 'note', label: '备注', icon: '📝' },
  { id: 'idea', label: '想法', icon: '💡' },
  { id: 'question', label: '问题', icon: '❓' },
  { id: 'link', label: '链接', icon: '🔗' },
];

function kindOf(kind: NoteKind) {
  return KINDS.find((k) => k.id === kind) ?? KINDS[0];
}

export function TaskNotes({ task }: { task: TaskFull }) {
  const { open } = useTaskDrawer();
  const createNote = useCreateNote();
  const deleteNote = useDeleteNote();
  const convert = useConvertNoteToTask();
  const [kind, setKind] = useState<NoteKind>('note');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');

  function submit() {
    const text = content.trim();
    if (!text) return;
    createNote.mutate({
      taskId: task.id,
      kind,
      content: text,
      url: kind === 'link' ? url.trim() || undefined : undefined,
    });
    setContent('');
    setUrl('');
  }

  async function handleConvert(noteId: string) {
    const created = await convert.mutateAsync(noteId);
    open(created.id);
  }

  return (
    <Section title="备注 · 想法 · 问题 · 链接" icon="🗯️">
      <div className="flex flex-col gap-2">
        {task.notes.length === 0 && (
          <EmptyHint>随手记下的想法和问题会贴在这里，它们不进待办统计，也不影响进度。</EmptyHint>
        )}

        {task.notes.map((note) => {
          const meta = kindOf(note.kind);
          return (
            <div key={note.id} className="annotation px-2.5 py-2">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-ink-soft">
                <span>{meta.icon}</span>
                {meta.label}
                {note.convertedTaskId && (
                  <button
                    type="button"
                    className="text-accent hover:underline"
                    onClick={() => open(note.convertedTaskId!)}
                  >
                    已转为任务 →
                  </button>
                )}
              </div>
              {note.kind === 'link' && note.url ? (
                <a
                  href={note.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-accent underline"
                >
                  {note.content}
                </a>
              ) : (
                <p className="text-sm">{note.content}</p>
              )}
              <div className="mt-1.5 flex gap-3 text-[11px]">
                {(note.kind === 'idea' || note.kind === 'question') && !note.convertedTaskId && (
                  <button
                    type="button"
                    className="font-bold text-accent hover:underline"
                    onClick={() => void handleConvert(note.id)}
                  >
                    转为任务
                  </button>
                )}
                <button
                  type="button"
                  className="text-ink-soft hover:underline"
                  onClick={() => deleteNote.mutate(note.id)}
                >
                  删除
                </button>
              </div>
            </div>
          );
        })}

        <div className="mt-1 flex flex-col gap-2 border-t-2 border-dashed border-line/30 pt-2">
          <div className="flex gap-2">
            <select
              className="field"
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
              className="field flex-1"
              placeholder="写点什么…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setContent('');
                }
              }}
            />
          </div>
          {kind === 'link' && (
            <input
              className="field"
              placeholder="https://"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          )}
          <Button size="sm" variant="accent" icon="＋" onClick={submit} className="self-start">
            添加批注
          </Button>
        </div>
      </div>
    </Section>
  );
}
