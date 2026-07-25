import type { ReactNode } from 'react';

interface PeriodStepperProps {
  onPrev: () => void;
  onNext: () => void;
  prevLabel: string;
  nextLabel: string;
  /** 传了就渲染「回到今天/本周」按钮；只在偏离当前时段时给，避免常驻一个没用的按钮 */
  onReset?: () => void;
  resetLabel?: string;
  /** 中间显示的时段名，日期切换器会在这里叠一个原生日期选择器 */
  children: ReactNode;
}

/** 时段翻页的公共外壳：日期切换与周复盘切换共用同一套形状与键位 */
export function PeriodStepper({
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  onReset,
  resetLabel,
  children,
}: PeriodStepperProps) {
  return (
    <div className="flex items-center gap-2">
      <StepButton glyph="←" label={prevLabel} onClick={onPrev} />
      {children}
      <StepButton glyph="→" label={nextLabel} onClick={onNext} />
      {onReset && (
        <button type="button" onClick={onReset} className="btn btn-sm btn-pop">
          {resetLabel}
        </button>
      )}
    </div>
  );
}

interface StepButtonProps {
  glyph: string;
  label: string;
  onClick: () => void;
}

function StepButton({ glyph, label, onClick }: StepButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="btn btn-sm h-8 w-8 !px-0 font-display text-lg leading-none"
    >
      {glyph}
    </button>
  );
}
