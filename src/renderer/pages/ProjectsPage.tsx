import { Link } from 'react-router-dom';
import { Panel } from '@/components/comic/Panel';
import { ProgressBar } from '@/components/comic/ProgressBar';
import { ModuleTag } from '@/components/comic/ModuleTag';
import { Button } from '@/components/comic/Button';
import { useProjects } from '@/features/queries';
import { formatDuration, moduleOf } from '@/lib/format';

export function ProjectsPage() {
  const { data } = useProjects();
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-extrabold">项目</h1>
        <Button variant="accent" icon="＋">
          新建项目
        </Button>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {data?.map((p) => (
          <Link key={p.id} to={`/projects/${p.id}`}>
            <Panel hover className="h-full p-5">
              <div className="mb-2 flex items-center justify-between">
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
        ))}
      </div>
    </div>
  );
}
