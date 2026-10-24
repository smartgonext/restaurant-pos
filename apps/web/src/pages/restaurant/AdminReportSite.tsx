import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, BarChart3, Database, Wifi, WifiOff } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/stores/authStore';
import { useSocket } from '@/hooks/useSocket';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';

const QUEUE_KEY = 'admin-report-site-sync-queue';

type QueueItem = { key: string; at: number };

function loadQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(items: QueueItem[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-200)));
  } catch {
    // ignore
  }
}

export default function AdminReportSite() {
  const { user } = useAuthStore();
  const isElectron = typeof window !== 'undefined' && (!!(window as any).electron || /electron/i.test(navigator.userAgent || ''));

  if (isElectron) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[75vh] space-y-6 max-w-2xl mx-auto animate-in fade-in duration-500">
        <div className="relative flex items-center justify-center w-24 h-24 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 shadow-[0_0_50px_rgba(59,130,246,0.15)] animate-pulse">
          <Activity className="w-10 h-10" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-text-primary bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
            Admin ReportSite (Live Cloud Reports)
          </h1>
          <p className="text-sm text-text-muted max-w-md mx-auto">
            This live reporting dashboard requires direct connection to your Cloud SaaS environment. 
          </p>
        </div>

        <div className="w-full bg-bg-card/50 backdrop-blur-md border border-border/80 rounded-xl p-6 shadow-xl space-y-4">
          <p className="text-sm text-text-secondary leading-relaxed">
            Because this physical terminal runs in **Offline-First Mode** on your local database, real-time sync automatically sends sales data to the cloud. To view live analytics from any device:
          </p>
          <div className="flex flex-col items-center gap-3 p-4 rounded-lg bg-bg-surface/50 border border-border/50">
            <span className="text-xs text-text-muted uppercase tracking-wider font-semibold">Your Cloud Portal URL</span>
            <a 
              href="https://bakery.smartgonext.com" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-lg font-bold text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-2"
            >
              https://bakery.smartgonext.com <span className="text-xs">↗</span>
            </a>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <a
            href="https://bakery.smartgonext.com"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-2.5 rounded-lg font-semibold bg-blue-500 hover:bg-blue-600 text-white transition-all shadow-[0_4px_20px_rgba(59,130,246,0.3)] hover:scale-[1.02] active:scale-[0.98]"
          >
            Access Live Dashboard
          </a>
          <button
            onClick={() => window.history.back()}
            className="px-6 py-2.5 rounded-lg font-semibold border border-border hover:bg-bg-hover text-text-primary transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const { socket } = useSocket();
  const qc = useQueryClient();
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const queueRef = useRef<QueueItem[]>(loadQueue());

  const branchId = user?.branch?.id;

  const { data: dashboard } = useQuery({
    queryKey: ['admin-report-site', 'dashboard', branchId],
    queryFn: async () => {
      const { data } = await api.get('/restaurant/dashboard', { params: { days: 7, ...(branchId ? { branchId } : {}) } });
      return data.data;
    },
    refetchInterval: isOnline ? 10000 : false,
  });

  const { data: inventory } = useQuery({
    queryKey: ['admin-report-site', 'inventory', branchId],
    queryFn: async () => {
      const { data } = await api.get('/restaurant/inventory/summary', { params: branchId ? { branchId } : {} });
      return data.data;
    },
    refetchInterval: isOnline ? 15000 : false,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['admin-report-site', 'orders', branchId],
    queryFn: async () => {
      const { data } = await api.get('/restaurant/orders', { params: { limit: 20, ...(branchId ? { branchId } : {}) } });
      return data.data || [];
    },
    refetchInterval: isOnline ? 12000 : false,
  });

  const queueInvalidation = (key: string) => {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      qc.invalidateQueries({ queryKey: ['admin-report-site'] });
      setLastSyncAt(new Date());
      return;
    }
    const exists = queueRef.current.some((x) => x.key === key);
    if (!exists) {
      queueRef.current.push({ key, at: Date.now() });
      saveQueue(queueRef.current);
    }
  };

  const flushQueue = () => {
    if (!queueRef.current.length) return;
    qc.invalidateQueries({ queryKey: ['admin-report-site'] });
    queueRef.current = [];
    saveQueue(queueRef.current);
    setLastSyncAt(new Date());
  };

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      flushQueue();
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onAnyLiveChange = () => queueInvalidation('live-update');
    socket.on('new_order', onAnyLiveChange);
    socket.on('order_updated', onAnyLiveChange);
    socket.on('token_created', onAnyLiveChange);
    socket.on('token_updated', onAnyLiveChange);
    socket.on('token_paid', onAnyLiveChange);
    socket.on('inventory.item.updated', onAnyLiveChange);
    socket.on('purchaseOrder.received', onAnyLiveChange);
    socket.on('settings_updated', onAnyLiveChange);

    return () => {
      socket.off('new_order', onAnyLiveChange);
      socket.off('order_updated', onAnyLiveChange);
      socket.off('token_created', onAnyLiveChange);
      socket.off('token_updated', onAnyLiveChange);
      socket.off('token_paid', onAnyLiveChange);
      socket.off('inventory.item.updated', onAnyLiveChange);
      socket.off('purchaseOrder.received', onAnyLiveChange);
      socket.off('settings_updated', onAnyLiveChange);
    };
  }, [socket]);

  const pendingSyncCount = queueRef.current.length;

  const recentOrders = useMemo(() => {
    return Array.isArray(orders) ? orders.slice(0, 10) : [];
  }, [orders]);

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Admin ReportSite</h1>
          <p className="text-sm text-text-muted mt-1">
            Branch-aware live reporting dashboard for restaurant admin
            {branchId ? ` · Branch #${branchId}` : ' · All branches'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={isOnline ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'}>
            {isOnline ? <Wifi className="w-3.5 h-3.5 mr-1" /> : <WifiOff className="w-3.5 h-3.5 mr-1" />}
            {isOnline ? 'Online' : 'Offline'}
          </Badge>
          <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/30">
            <Activity className="w-3.5 h-3.5 mr-1" /> LIVE
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total Sales (7d)" value={formatCurrency(Number(dashboard?.totalSales || 0))} icon={BarChart3} color="green" />
        <StatCard label="Orders (7d)" value={Number(dashboard?.ordersCount || 0)} icon={Activity} color="blue" />
        <StatCard label="Inventory Value" value={formatCurrency(Number(inventory?.inventoryValue || 0))} icon={Database} color="purple" />
        <StatCard label="Pending Sync" value={pendingSyncCount} icon={WifiOff} color={pendingSyncCount > 0 ? 'cyan' : 'green'} />
      </div>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-text-primary">Recent Orders (Live)</h2>
          <p className="text-xs text-text-muted">
            Last sync: {lastSyncAt ? formatDate(lastSyncAt.toISOString()) : 'Not synced yet'}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="text-left py-2 px-2">Order #</th>
                <th className="text-left py-2 px-2">Status</th>
                <th className="text-left py-2 px-2">Type</th>
                <th className="text-right py-2 px-2">Total</th>
                <th className="text-left py-2 px-2">Time</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((o: any) => (
                <tr key={o.id} className="table-row">
                  <td className="py-2 px-2 text-text-primary font-medium">{o.orderNumber || o.id}</td>
                  <td className="py-2 px-2 text-text-secondary">{o.status}</td>
                  <td className="py-2 px-2 text-text-secondary">{o.type || '-'}</td>
                  <td className="py-2 px-2 text-right text-text-primary">{formatCurrency(Number(o.total || 0))}</td>
                  <td className="py-2 px-2 text-text-muted">{formatDate(o.createdAt)}</td>
                </tr>
              ))}
              {recentOrders.length === 0 && (
                <tr>
                  <td className="py-6 text-center text-text-muted" colSpan={5}>No order data yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
