import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Panel } from '@/components/comic/Panel';
import { ProgressBar } from '@/components/comic/ProgressBar';
import { ModuleTag } from '@/components/comic/ModuleTag';
import { Button } from '@/components/comic/Button';
import { useArchiveProject, useCreateProject, useProjects } from '@/features/queries';
import { formatDuration, moduleOf } from '@/lib/format';
import { MODULE_SEED } from '@shared/modules';
import type { ModuleId } from '@shared/types';

export function ProjectsPage() {
  const { data } = useProjects();
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-extrabold">项目</h1>
        <Button variant="accent" icon="＋" onClick={() => setCreating((v) => !v)}>
          新建项目
        </Button>
      </header>

      {creating && <NewProjectForm onDone={() => setCreating(false)} />}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {data?.map((p) => (
          <div key={p.id} className="group relative">
            <Link to={`/projects/${p.id}`}>
              <Panel hover className="h-full p-5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="text-lg font-extrabold">{p.name}</h2>
                  <ModuleTag id={p.defaultModuleId} />
                </div>
                {p.goal && <p className="mb-4 text-sm text-ink-soft">{p.goal}</p>}
                <ProgressBar ratio={p.progress.ratio} color={moduleOf(p.defaultModuleId).color} />
                <div className="mt-3 flex justify-between text-xs text-ink-soft">
                  <span>
                    {p.progress.doneLeaves}/{p.progress.totalLeaves} 项完成
                  </span>
                  <span>累计 {formatDuration(p.totalTimeMs)}</span>
                </div>
              </Panel>
            </Link>
            <ArchiveButton id={p.id} name={p.name} />
          </div>
        ))}
      </div>

      {data?.length === 0 && !creating && (
        <Panel flat className="p-6 text-center text-sm text-ink-soft">
          还没有项目。项目是持续推进的具体事项，先建一个再往里拆任务。
        </Panel>
      )}
    </div>
  );
}

/** 归档按钮压在卡片右上角，不放进 Link 里，否则点它会顺带跳进详情页 */
function ArchiveButton({ id, name }: { id: string; name: string }) {
  const archive = useArchiveProject();
  return (
    <button
      type="button"
      onClick={() => archive.mutate(id)}
      disabled={archive.isPending}
      title={`归档「${name}」：任务与历史时间都留着，只是不再出现在这里`}
      aria-label={`归档 ${name}`}
      className="absolute -right-2 -top-2 h-7 w-7 rounded-full border-[3px] border-line bg-panel text-sm font-extrabold opacity-0 transition hover:bg-pop focus-visible:opacity-100 group-hover:opacity-100"
    >
      ✕
    </button>
  );
}

/**
 * 新建项目就地展开，不跳页也不开弹窗：默认模块是必填的，
 * 因为项目内任务的模块要从它继承（PRD 4.1）。
 */
function NewProjectForm({ onDone }: { onDone: () => void }) {
  const create = useCreateProject();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [defaultModuleId, setDefaultModuleId] = useState<ModuleId>('work');

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { name: trimmed, goal: goal.trim() || undefined, defaultModuleId },
      { onSuccess: onDone },
    );
  };

  return (
    <Panel flat className="p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            autoFocus
            className="field flex-1"
            placeholder="项目名称，例如 ToGoal"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') onDone();
            }}
            aria-label="项目名称"
          />
          <select
            className="field"
            value={defaultModuleId}
            onChange={(e) => setDefaultModuleId(e.target.value as ModuleId)}
            aria-label="默认模块"
          >
            {MODULE_SEED.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <input
          className="field"
          placeholder="项目目标（可选）"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') onDone();
          }}
          aria-label="项目目标"
        />
        <div className="flex gap-2">
          <Button variant="accent" size="sm" onClick={submit} disabled={!name.trim() || create.isPending}>
            建好
          </Button>
          <Button size="sm" onClick={onDone}>
            取消
          </Button>
        </div>
      </div>
    </Panel>
  );
}
