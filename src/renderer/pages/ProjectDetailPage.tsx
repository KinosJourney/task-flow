import { Link, useParams } from 'react-router-dom';
import { Panel, PanelHeader } from '@/components/comic/Panel';
import { ProgressBar } from '@/components/comic/ProgressBar';
import { ModuleTag, ModuleDot } from '@/components/comic/ModuleTag';
import { Button } from '@/components/comic/Button';
import {
  useCompleteTask,
  useCreateTask,
  useProjects,
  useProjectTree,
  useReopenTask,
} from '@/features/queries';
import { useTaskDrawer } from '@/features/task/useTaskDrawer';
import { formatDuration, moduleOf } from '@/lib/format';
import type { TaskNode } from '@shared/types';

export function ProjectDetailPage() {
  const { id = '' } = useParams();
  const { data: projects } = useProjects();
  const { data: tree } = useProjectTree(id);
  const createTask = useCreateTask();
  const drawer = useTaskDrawer();
  const project = projects?.find((p) => p.id === id);

  /** 新建后直接打开抽屉改名，省掉一个专门的新建弹窗 */
  async function handleAddTask() {
    const created = await createTask.mutateAsync({ title: '新任务', projectId: id });
    drawer.open(created.id);
  }

  if (!project) {
    return (
      <div>
        <Link to="/projects" className="text-sm font-bold text-accent">
          ← 返回项目
        </Link>
        <p className="mt-4 text-ink-soft">项目加载中…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Link to="/projects" className="text-sm font-bold text-accent hover:underline">
        ← 返回项目
      </Link>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-extrabold">{project.name}</h1>
        <ModuleTag id={project.defaultModuleId} />
      </header>
      {project.goal && <p className="-mt-2 text-sm text-ink-soft">🎯 {project.goal}</p>}

      <div className="grid grid-cols-3 gap-3">
        <Stat label="完成进度">
          <ProgressBar ratio={project.progress.ratio} color={moduleOf(project.defaultModuleId).color} />
        </Stat>
        <Stat label="叶子任务">
          {project.progress.doneLeaves}/{project.progress.totalLeaves}
        </Stat>
        <Stat label="累计投入">{formatDuration(project.totalTimeMs)}</Stat>
      </div>

      <Panel>
        <PanelHeader
          title="任务"
          icon="✅"
          action={
            <Button size="sm" variant="accent" icon="＋" onClick={() => void handleAddTask()}>
              添加任务
            </Button>
          }
        />
        <div className="flex flex-col gap-1.5 p-3">
          {tree?.map((t) => <TaskRow key={t.id} node={t} />)}
        </div>
      </Panel>

      {project.notes && (
        <Panel>
          <PanelHeader title="项目笔记" icon="📓" />
          <p className="p-4 text-sm">{project.notes}</p>
        </Panel>
      )}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Panel flat className="p-3">
      <div className="mb-1 text-xs text-ink-soft">{label}</div>
      <div className="text-lg font-extrabold">{children}</div>
    </Panel>
  );
}

function TaskRow({ node, depth = 0 }: { node: TaskNode; depth?: number }) {
  const complete = useCompleteTask();
  const reopen = useReopenTask();
  const drawer = useTaskDrawer();

  return (
    <>
      <div
        className="flex items-center gap-2 rounded-lg border-[2.5px] border-line bg-white px-3 py-2"
        style={{ marginLeft: depth * 20 }}
      >
        <button
          type="button"
          aria-label={node.isDone ? `恢复 ${node.title} 为未完成` : `完成 ${node.title}`}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-line text-xs ${
            node.isDone ? 'bg-pop' : 'bg-white'
          }`}
          onClick={() => (node.isDone ? reopen.mutate(node.id) : complete.mutate(node.id))}
        >
          {node.isDone ? '✓' : ''}
        </button>
        <ModuleDot id={node.moduleId} size={10} />
        <button
          type="button"
          title={`打开「${node.title}」的详情`}
          className={`flex-1 truncate text-left text-sm hover:underline ${
            node.isDone ? 'text-ink-soft line-through' : ''
          }`}
          onClick={() => drawer.open(node.id)}
        >
          {node.title}
        </button>
        {node.inToday && <span className="tag bg-pop text-ink">今日</span>}
      </div>
      {node.children.map((c) => (
        <TaskRow key={c.id} node={c} depth={depth + 1} />
      ))}
    </>
  );
}
