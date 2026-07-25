import { Panel, PanelHeader } from '@/components/comic/Panel';
import { ModuleDot } from '@/components/comic/ModuleTag';
import { useHabits } from '@/features/queries';

export function HabitStrip() {
  const { data } = useHabits();
  return (
    <Panel>
      <PanelHeader title="习惯打卡" icon="🔥" />
      <div className="flex flex-col gap-2 p-3">
        {data?.map((h) => {
          const done = h.todayStatus === 'done' || h.todayStatus === 'makeup';
          return (
            <div
              key={h.id}
              className="flex items-center gap-2 rounded-lg border-[2.5px] border-line bg-white px-3 py-2"
            >
              <ModuleDot id={h.moduleId} />
              <span className="flex-1 truncate text-sm">{h.name}</span>
              <span className="flex items-center gap-1 text-xs font-bold text-ink-soft">
                🔥{h.currentStreak}
              </span>
              <button
                className={[
                  'flex h-7 w-7 items-center justify-center rounded-full border-[2.5px] border-line text-sm font-bold',
                  done ? 'bg-pop' : 'bg-white hover:bg-accent-soft',
                ].join(' ')}
                title={done ? '今日已打卡' : '打卡'}
              >
                {done ? '✓' : ''}
              </button>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
