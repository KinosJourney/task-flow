import { useState } from 'react';
import { Button } from '@/components/comic/Button';
import { Mascot } from '@/components/assistant/Mascot';
import { EmptyHint, Section } from './Section';
import { useTaskDrawer } from './useTaskDrawer';
import { useCompleteTask, useCreateTask, useReopenTask } from '@/features/queries';
import type { TaskFull } from '@shared/types';

export function TaskSubtasks({ task }: { task: TaskFull }) {
  const { open } = useTaskDrawer();
  const complete = useCompleteTask();
  const reopen = useReopenTask();
  const create = useCreateTask();
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  // PRD 4.3：最多三级，第三级的任务不能再加子任务
  const atMaxDepth = task.depth >= 3;

  function submit() {
    const title = draft.trim();
    if (!title) {
      setAdding(false);
      return;
    }
    create.mutate({ title, parentId: task.id, projectId: task.projectId, moduleId: task.moduleId });
    setDraft('');
  }

  return (
    <Section
      title="子任务"
      icon="🧩"
      action={
        !atMaxDepth && (
          <Button size="sm" icon="＋" onClick={() => setAdding(true)}>
            添加
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-1.5">
        {task.children.length === 0 && !adding && (
          <EmptyHint>
            {atMaxDepth ? '这一级不能再往下拆了。' : '还没有子任务，把它拆成几步会更好推进。'}
          </EmptyHint>
        )}

        {task.children.map((child) => (
          <div
            key={child.id}
            className="flex items-center gap-2 rounded-lg border-[2.5px] border-line bg-white px-2.5 py-1.5"
          >
            <button
              type="button"
              aria-label={child.isDone ? '取消完成' : '标记完成'}
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-line text-xs ${
                child.isDone ? 'bg-pop' : 'bg-white'
              }`}
              onClick={() => (child.isDone ? reopen.mutate(child.id) : complete.mutate(child.id))}
            >
              {child.isDone ? '✓' : ''}
            </button>
            <button
              type="button"
              className={`flex-1 truncate text-left text-sm hover:underline ${
                child.isDone ? 'text-ink-soft line-through' : ''
              }`}
              onClick={() => open(child.id)}
            >
              {child.title}
            </button>
            {child.inToday && <span className="tag bg-pop text-ink">今日</span>}
          </div>
        ))}

        {adding && (
          <div className="flex gap-2">
            <input
              autoFocus
              className="field flex-1"
              placeholder="子任务标题，回车添加"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') {
                  // 先取消输入，别顺手把抽屉也关了
                  e.stopPropagation();
                  setDraft('');
                  setAdding(false);
                }
              }}
              onBlur={() => !draft.trim() && setAdding(false)}
            />
            <Button size="sm" variant="accent" onClick={submit}>
              添加
            </Button>
          </div>
        )}

        {atMaxDepth && (
          <div className="mt-1 flex items-start gap-2">
            <Mascot size={34} mood="think" />
            <p className="rounded-xl border-[2.5px] border-line bg-panel px-2.5 py-1.5 text-xs">
              第三级到底了，再往下的内容会记成备注。
            </p>
          </div>
        )}
      </div>
    </Section>
  );
}
