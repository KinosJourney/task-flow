import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Panel, PanelHeader } from '@/components/comic/Panel';
import { ProgressBar } from '@/components/comic/ProgressBar';
import { ModuleTag } from '@/components/comic/ModuleTag';
import { useProjects, useProjectTree } from '@/features/queries';
import { TaskOutline } from '@/features/outline/TaskOutline';
import { flattenTaskTree, useOutlineActions } from '@/features/outline/useOutlineActions';
import { useTaskFocus } from '@/features/outline/useTaskFocus';
import { formatDuration, moduleOf } from '@/lib/format';

export function ProjectDetailPage() {
  const { id = '' } = useParams();
  const { data: projects } = useProjects();
  const { data: tree } = useProjectTree(id);
  const taskFocus = useTaskFocus();
  const actions = useOutlineActions({ projectId: id });
  const project = projects?.find((p) => p.id === id);

  const rows = useMemo(() => flattenTaskTree(tree ?? []), [tree]);

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

      {/* 项目的任务树就是一份大纲：加任务、调层级、写描述都在这里敲（ui-spec 第 3 节） */}
      <Panel>
        <PanelHeader title="任务" icon="✅" />
        <div className="p-3">
          <TaskOutline
            rows={rows}
            actions={actions}
            focusTaskId={taskFocus.focusTaskId}
            onFocusConsumed={taskFocus.consume}
            emptyHint="这个项目还没有任务，点这里写第一件"
          />
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
