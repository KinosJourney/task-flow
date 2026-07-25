import { Panel } from '@/components/comic/Panel';
import { ModuleTag } from '@/components/comic/ModuleTag';
import { Button } from '@/components/comic/Button';
import { useHabits } from '@/features/queries';
import type { HabitWithStreak } from '@shared/types';

function repeatLabel(h: HabitWithStreak): string {
  if (h.repeatType === 'daily') return '每天';
  if (h.repeatType === 'weekly_count') return `每周 ${h.weeklyTarget} 次`;
  const names = ['一', '二', '三', '四', '五', '六', '日'];
  return '周' + (h.repeatWeekdays ?? []).map((d) => names[d - 1]).join('、');
}

export function HabitsPage() {
  const { data } = useHabits();
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-extrabold">习惯</h1>
        <Button variant="accent" icon="＋">
          新建习惯
        </Button>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {data?.map((h) => {
          const done = h.todayStatus === 'done' || h.todayStatus === 'makeup';
          return (
            <Panel key={h.id} className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-extrabold">{h.name}</h2>
                <ModuleTag id={h.moduleId} />
              </div>
              <div className="mb-4 flex gap-4 text-sm">
                <span className="text-ink-soft">{repeatLabel(h)}</span>
                <span className="font-bold">🔥 连续 {h.currentStreak}</span>
                <span className="text-ink-soft">最长 {h.longestStreak}</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant={done ? 'pop' : 'accent'}>
                  {done ? '✓ 已打卡' : '打卡'}
                </Button>
                <Button size="sm">请假</Button>
                <Button size="sm">补打卡</Button>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
