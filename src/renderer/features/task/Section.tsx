import type { ReactNode } from 'react';

interface SectionProps {
  title: string;
  icon?: string;
  action?: ReactNode;
  children: ReactNode;
}

/** 抽屉里的一格小分镜：标题条 + 内容 */
export function Section({ title, icon, action, children }: SectionProps) {
  return (
    <section className="subpanel">
      <div className="flex items-center justify-between gap-2 border-b-[2.5px] border-line bg-panel-alt px-3 py-1.5">
        <h3 className="flex items-center gap-1.5 text-xs font-bold">
          {icon && <span>{icon}</span>}
          {title}
        </h3>
        {action}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

/** 空分区不隐藏，给一句引导——否则用户不知道这里能加东西 */
export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="text-xs text-ink-soft">{children}</p>;
}
