import { EmptyHint, Section } from './Section';
import { useTaskTimeEntries } from '@/features/queries';
import { formatClock, formatDuration } from '@/lib/format';
import { useNow } from '@/lib/useNow';

export function TaskTimeEntries({ taskId }: { taskId: string }) {
  const { data: entries } = useTaskTimeEntries(taskId);
  const hasRunning = Boolean(entries?.some((e) => e.endedAt === undefined));
  const now = useNow(hasRunning);

  return (
    <Section
      title="计时记录"
      icon="⏱️"
      action={
        entries?.length ? (
          <span className="text-[11px] text-ink-soft">{entries.length} 段</span>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-1.5">
        {!entries?.length && (
          <EmptyHint>还没有计时记录。点上面的「开始计时」，这里就会出现分段。</EmptyHint>
        )}

        {entries?.map((entry) => {
          const running = entry.endedAt === undefined;
          const end = entry.endedAt ?? now;
          return (
            <div
              key={entry.id}
              className={`flex items-center gap-2 rounded-lg border-[2.5px] border-line px-2.5 py-1.5 text-xs ${
                entry.source === 'manual' ? 'speedlines' : 'bg-white'
              }`}
            >
              <span className="font-display tabular-nums">
                {formatClock(entry.startedAt)}–{running ? '进行中' : formatClock(end)}
              </span>
              <span className="flex-1 text-ink-soft">
                {entry.source === 'manual' ? '手动补录' : '计时器'}
              </span>
              <span className="font-bold tabular-nums">{formatDuration(end - entry.startedAt)}</span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
