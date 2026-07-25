import { createHashRouter, RouterProvider } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { HomePage } from '@/pages/HomePage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { ProjectDetailPage } from '@/pages/ProjectDetailPage';
import { TimelinePage } from '@/pages/TimelinePage';
import { HabitsPage } from '@/pages/HabitsPage';
import { ReviewPage } from '@/pages/ReviewPage';
import { ImportPage } from '@/pages/ImportPage';
import { SettingsPage } from '@/pages/SettingsPage';

const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/:id', element: <ProjectDetailPage /> },
      { path: 'timeline', element: <TimelinePage /> },
      { path: 'habits', element: <HabitsPage /> },
      { path: 'review', element: <ReviewPage /> },
      { path: 'import', element: <ImportPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
