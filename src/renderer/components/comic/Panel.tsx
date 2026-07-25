import type { ReactNode } from 'react';

interface PanelProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  flat?: boolean;
}

export function Panel({ children, className = '', hover = false, flat = false }: PanelProps) {
  const base = flat ? 'panel-flat' : 'panel';
  return <div className={`${base} ${hover ? 'panel-hover' : ''} ${className}`}>{children}</div>;
}

interface PanelHeaderProps {
  title: string;
  icon?: string;
  action?: ReactNode;
}

export function PanelHeader({ title, icon, action }: PanelHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b-[3px] border-line px-4 py-2.5">
      <h2 className="flex items-center gap-2 text-base font-bold text-ink">
        {icon && <span className="text-lg">{icon}</span>}
        {title}
      </h2>
      {action}
    </div>
  );
}
