import { PeriodStepper } from './PeriodStepper';
import { formatDateLabel, isIsoDate, relativeDayName } from '@/lib/date';

interface DateSwitcherProps {
  date: string;
  isToday: boolean;
  onShiftDays: (delta: number) => void;
  onPick: (iso: string) => void;
  onToday: () => void;
}

/**
 * 日粒度的时段翻页。中间那块既是日期标签也是入口：上面透明叠了一个原生 `<input type="date">`，
 * 于是点一下能直接跳到任意一天，而视觉上仍是中文日期而非浏览器默认的 `2026/07/26`。
 */
export function DateSwitcher({ date, isToday, onShiftDays, onPick, onToday }: DateSwitcherProps) {
  const relative = relativeDayName(date);

  return (
    <PeriodStepper
      onPrev={() => onShiftDays(-1)}
      onNext={() => onShiftDays(1)}
      prevLabel="看前一天"
      nextLabel="看后一天"
      onReset={isToday ? undefined : onToday}
      resetLabel="回到今天"
    >
      <div className="relative">
        <input
          type="date"
          value={date}
          onChange={(e) => {
            if (isIsoDate(e.target.value)) onPick(e.target.value);
          }}
          aria-label="跳到指定日期"
          className="peer absolute inset-0 z-10 w-full cursor-pointer opacity-0"
        />
        <div className="flex items-center gap-2 rounded-lg border-[2.5px] border-line bg-white px-3 py-1 text-sm font-bold shadow-[2px_2px_0_0_var(--color-line)] peer-hover:bg-panel-alt peer-focus-visible:outline-3 peer-focus-visible:outline-accent">
          <span className="whitespace-nowrap">{formatDateLabel(date)}</span>
          {relative && (
            <span className="rounded-full border-2 border-line bg-pop px-1.5 text-[11px] leading-tight">
              {relative}
            </span>
          )}
          <span aria-hidden className="text-ink-soft">
            📅
          </span>
        </div>
      </div>
    </PeriodStepper>
  );
}
