interface ProgressBarProps {
  ratio: number;
  label?: string;
  color?: string;
}

export function ProgressBar({ ratio, label, color = 'var(--color-accent)' }: ProgressBarProps) {
  const pct = Math.round(ratio * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-4 flex-1 overflow-hidden rounded-full border-[2.5px] border-line bg-white">
        <div
          className="h-full rounded-r-full transition-[width] duration-300"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-xs font-bold tabular-nums">{label ?? `${pct}%`}</span>
    </div>
  );
}
