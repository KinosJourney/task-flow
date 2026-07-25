import { NavLink } from 'react-router-dom';
import { Mascot } from '@/components/assistant/Mascot';

const NAV = [
  { to: '/', label: '首页', icon: '🎯', end: true },
  { to: '/projects', label: '项目', icon: '📚' },
  { to: '/timeline', label: '时间轴', icon: '⏱️' },
  { to: '/habits', label: '习惯', icon: '🔥' },
  { to: '/review', label: '周复盘', icon: '📝' },
  { to: '/import', label: '智能导入', icon: '📥' },
  { to: '/settings', label: '设置', icon: '⚙️' },
];

export function Sidebar() {
  return (
    <aside className="flex w-56 shrink-0 flex-col gap-4 border-r-[3px] border-line bg-panel-alt px-3 py-5">
      <div className="flex items-center gap-2 px-2">
        <Mascot size={44} mood="cheer" />
        <div>
          <div className="font-display text-xl leading-none font-extrabold">TaskFlow</div>
          <div className="text-[11px] text-ink-soft">现在最该做什么</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1.5">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              [
                'flex items-center gap-2.5 rounded-lg border-[3px] px-3 py-2 font-bold transition',
                isActive
                  ? 'border-line bg-accent text-white shadow-[3px_3px_0_0_var(--color-line)]'
                  : 'border-transparent text-ink hover:border-line hover:bg-panel',
              ].join(' ')
            }
          >
            <span className="text-lg">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto px-2 text-[11px] leading-relaxed text-ink-soft">
        本机版 · 数据不上云
        <br />
        UI 预览（mock 数据）
      </div>
    </aside>
  );
}
