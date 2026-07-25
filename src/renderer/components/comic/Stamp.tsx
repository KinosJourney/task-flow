interface StampProps {
  text: string;
  /** 章下方的小字，如日期 */
  sub?: string;
  className?: string;
}

/** 装饰性橡皮章。信息本身由旁边的文字承载，故对读屏器隐藏。 */
export function Stamp({ text, sub, className = '' }: StampProps) {
  return (
    <div aria-hidden className={`stamp ${className}`}>
      <span className="text-sm leading-tight">{text}</span>
      {sub && <span className="text-[0.6rem] leading-tight tracking-[0.2em]">{sub}</span>}
    </div>
  );
}
