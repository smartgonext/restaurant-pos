import { Outlet } from 'react-router-dom';
import { Suspense } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useRealtimeOrders } from '@/hooks/useRealtimeOrders';
import { useLayoutStore } from '@/stores/layoutStore';
import { cn } from '@/lib/utils';
import { useNotificationStore } from '@/stores/notificationStore';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Bell, CheckCircle, X } from 'lucide-react';
import { useEffect } from 'react';
import KotPopup from '@/components/KotPopup';

export function RestaurantLayout() {
  // Initialize Global Socket Webhook Receiver
  useRealtimeOrders();
  const { sidebarCollapsed } = useLayoutStore();
  const activeWaiterRequest = useNotificationStore((state) => state.activeWaiterRequest);
  const setActiveWaiterRequest = useNotificationStore((state) => state.setActiveWaiterRequest);

  useEffect(() => {
    if (!activeWaiterRequest) return;
    const t = setTimeout(() => {
      setActiveWaiterRequest(null);
    }, 12000);
    return () => clearTimeout(t);
  }, [activeWaiterRequest, setActiveWaiterRequest]);

  const markAttended = async () => {
    if (!activeWaiterRequest?.id) return;
    try {
      await api.patch(`/restaurant/waiter-requests/${activeWaiterRequest.id}/attend`);
      toast.success('Request marked as attended');
      setActiveWaiterRequest(null);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update request');
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className={cn("flex-1 flex flex-col overflow-hidden transition-all duration-300 pl-4", sidebarCollapsed ? "ml-[var(--sidebar-collapsed)]" : "ml-[var(--sidebar-width)]")}>
        <TopBar />
        <main className="flex-1 overflow-y-auto custom-scrollbar p-6">
          <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {activeWaiterRequest && (
        <div className="fixed top-20 right-6 z-[70] w-[360px] animate-in slide-in-from-right-5 fade-in duration-300">
          <div className="relative bg-bg-secondary border border-amber-500/40 rounded-2xl p-4 shadow-card">
            <button
              onClick={() => setActiveWaiterRequest(null)}
              className="absolute right-3 top-3 text-text-muted hover:text-text-primary"
            >
              <X size={16} />
            </button>

            <div className="flex items-start gap-3 pr-6">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
                <Bell size={20} className="animate-bounce" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-wider text-amber-300">Waiter Alert</p>
                <h3 className="text-base font-bold text-text-primary mt-0.5">New Waiter Request</h3>
                <p className="text-sm text-text-secondary mt-1">
                  Table <span className="font-bold text-text-primary">{activeWaiterRequest.table?.name || activeWaiterRequest.tableId || '-'}</span>
                </p>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={markAttended}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2"
              >
                <CheckCircle size={16} /> Mark Attended
              </button>
              <button
                onClick={() => setActiveWaiterRequest(null)}
                className="px-3 bg-danger hover:bg-danger/90 text-white py-2.5 rounded-lg font-bold text-sm"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}
      <KotPopup />
    </div>
  );
}
