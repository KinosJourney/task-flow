import { Outlet } from 'react-router-dom';
import { Toaster } from '@/components/comic/Toaster';
import { Sidebar } from './Sidebar';

export function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>
      <Toaster />
    </div>
  );
}
