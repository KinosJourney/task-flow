import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TaskDetailDrawer } from '@/features/task/TaskDetailDrawer';

export function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>
      {/* 任务详情抽屉叠加在任意页面之上，由 ?task=<id> 控制开合 */}
      <TaskDetailDrawer />
    </div>
  );
}
