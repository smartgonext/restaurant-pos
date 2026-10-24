import { Outlet } from 'react-router-dom';
import { Suspense } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useLayoutStore } from '@/stores/layoutStore';
import { cn } from '@/lib/utils';

export function SuperAdminLayout() {
  const { sidebarCollapsed } = useLayoutStore();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className={cn("flex-1 flex flex-col overflow-hidden transition-all duration-300 pl-4", sidebarCollapsed ? "ml-[var(--sidebar-collapsed)]" : "ml-[var(--sidebar-width)]")}>
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
