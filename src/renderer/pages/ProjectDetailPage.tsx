import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Panel, PanelHeader } from '@/components/comic/Panel';
import { ProgressBar } from '@/components/comic/ProgressBar';
import { ModuleTag } from '@/components/comic/ModuleTag';
import { useProject, useUpdateProject } from '@/features/queries';
import { TaskOutline } from '@/features/outline/TaskOutline';
import { groupNotesByTask, useNoteActions } from '@/features/outline/TaskNotes';
import { flattenTaskTree, useOutlineActions } from '@/features/outline/useOutlineActions';
import { useTaskFocus } from '@/features/outline/useTaskFocus';
import { formatDuration, moduleOf } from '@/lib/format';
import type { OutlineRow } from '@/features/outline/useOutlineKeys';

export function ProjectDetailPage() {
  const { id = '' } = useParams();
  const { data: project, isPending, isError } = useProject(id);
  const taskFocus = useTaskFocus();
  const actions = useOutlineActions({ projectId: id });
  const noteActions = useNoteActions();

  const rows = useMemo(() => flattenTaskTree(project?.tree ?? []), [project?.tree]);
  const notesByTask = useMemo(() => groupNotesByTask(project?.taskNotes ?? []), [project?.taskNotes]);

  if (!project) {
    return (
      <div>
        <BackLink />
        <p className="mt-4 text-ink-soft">
          {isPending ? '项目加载中…' : isError ? '没有这个项目，它可能已经被删掉了。' : null}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <BackLink />

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

      <NextAction projectId={project.id} current={project.nextAction?.id} rows={rows} />

      {/* 项目的任务树就是一份大纲：加任务、调层级、写描述、挂批注都在这里敲（ui-spec 第 3 节） */}
      <Panel>
        <PanelHeader title="任务" icon="✅" />
        <div className="p-3">
          <TaskOutline
            rows={rows}
            actions={actions}
            focusTaskId={taskFocus.focusTaskId}
            onFocusConsumed={taskFocus.consume}
            emptyHint="这个项目还没有任务，点这里写第一件"
            notesByTask={notesByTask}
            noteActions={noteActions}
          />
        </div>
      </Panel>

      {project.notes && (
        <Panel>
          <PanelHeader title="项目笔记" icon="📓" />
          <p className="whitespace-pre-wrap p-4 text-sm">{project.notes}</p>
        </Panel>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/projects" className="text-sm font-bold text-accent hover:underline">
      ← 返回项目
    </Link>
  );
}

/**
 * 项目的「下一步行动」：推荐引擎的第 4 条规则读它（ipc-contract 3.2 的
 * `project_next_action`），所以这里选一次，首页就能替用户想起这件事。
 */
function NextAction({
  projectId,
  current,
  rows,
}: {
  projectId: string;
  current?: string;
  rows: OutlineRow[];
}) {
  const update = useUpdateProject();
  const candidates = rows.filter((row) => !row.isDone);
  const currentRow = rows.find((row) => row.id === current);

  const pick = (taskId: string) => {
    update.mutate({ id: projectId, nextActionTaskId: taskId || null });
  };

  return (
    <Panel flat className="flex flex-wrap items-center gap-3 p-3">
      <span className="text-xs font-bold text-ink-soft">下一步</span>
      {candidates.length === 0 ? (
        <span className="text-sm text-ink-soft">没有未完成的任务可以指</span>
      ) : (
        <select
          className="field max-w-full flex-1"
          value={current ?? ''}
          onChange={(e) => pick(e.target.value)}
          aria-label="项目的下一步行动"
        >
          <option value="">未指定</option>
          {candidates.map((row) => (
            <option key={row.id} value={row.id}>
              {'　'.repeat(row.indent)}
              {row.title}
            </option>
          ))}
        </select>
      )}
      {currentRow && (
        <Link
          to={`/projects/${projectId}?focus=${currentRow.id}`}
          className="text-xs font-bold text-accent hover:underline"
        >
          去这一行
        </Link>
      )}
    </Panel>
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
