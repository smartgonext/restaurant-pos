import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { OrderDetailPanel } from '@/components/orders/OrderDetailPanel';
import {
  ClipboardList, Search, Eye, ArrowRight, XCircle, DollarSign,
  Filter, RefreshCw, Clock, ShoppingCart, Utensils, ChevronDown
} from 'lucide-react';
import { formatCurrency, formatDateTime, getStatusColor, cn } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const statusFilters = ['all', 'placed', 'confirmed', 'preparing', 'served', 'billed', 'paid', 'cancelled'];
const typeFilters = ['all', 'dine_in', 'delivery', 'pickup'];

export default function Orders() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['orders', statusFilter, typeFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      const qs = params.toString();
      return api.get(`/restaurant/orders${qs ? `?${qs}` : ''}`).then((r) => r.data);
    },
    refetchInterval: autoRefresh ? 10000 : false,
  });

  const updateStatus = async (id: number, status: string) => {
    try {
      await api.put(`/restaurant/orders/${id}`, { status });
      toast.success(`Order ${status}`);
      refetch();
    } catch {
      toast.error('Failed to update');
    }
  };

  const cancelOrder = async (id: number) => {
    if (!confirm('Cancel this order?')) return;
    try {
      await api.post(`/restaurant/orders/${id}/cancel`, { reason: 'Cancelled by admin' });
      toast.success('Order cancelled');
      refetch();
    } catch {
      toast.error('Failed');
    }
  };

  const openOrderDetail = (orderId: number) => {
    setSelectedOrderId(orderId);
    setPanelOpen(true);
  };

  const orders = (data?.data || []).filter((o: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.orderNumber?.toLowerCase().includes(q) ||
      o.customer?.name?.toLowerCase().includes(q) ||
      o.table?.name?.toLowerCase().includes(q)
    );
  });

  const statusBadgeColor = (status: string) => {
    const map: Record<string, string> = {
      placed: 'bg-blue-500', confirmed: 'bg-blue-400', preparing: 'bg-amber-500',
      served: 'bg-teal-500', billed: 'bg-teal-500', paid: 'bg-green-500', cancelled: 'bg-red-500',
    };
    return map[status] || 'bg-gray-500';
  };

  return (
    <div className="space-y-5 animate-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-text-primary uppercase tracking-tighter">
            Orders <span className="text-blue-400 text-lg">({data?.pagination?.total || 0})</span>
          </h1>
          <p className="text-xs text-text-muted mt-0.5">Manage and track all restaurant orders</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={cn(
              'flex items-center gap-1.5 text-[10px] font-bold uppercase px-3 py-1.5 rounded-lg border transition-all',
              autoRefresh
                ? 'bg-green-500/10 text-green-400 border-green-500/30'
                : 'bg-bg-tertiary text-text-muted border-border/50'
            )}
          >
            <RefreshCw size={12} className={autoRefresh ? 'animate-spin' : ''} />
            Auto Refresh: {autoRefresh ? 'ON' : 'OFF'}
          </button>
          <Badge variant="info" dot className="animate-pulse">Live</Badge>
        </div>
      </div>

      {/* Type Filter */}
      <div className="flex gap-2">
        {typeFilters.map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={cn(
              'px-4 py-1.5 rounded-lg text-xs font-bold transition-all uppercase',
              typeFilter === t
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'text-text-muted hover:bg-bg-hover border border-transparent'
            )}
          >
            {t === 'all' ? 'All' : t.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {statusFilters.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all',
              statusFilter === s
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'text-text-muted hover:bg-bg-hover border border-transparent'
            )}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            className="glass-input w-full pl-10 text-sm"
            placeholder="Search by order #, customer, table..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Order Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-2xl" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 border-dashed">
          <ClipboardList className="w-12 h-12 text-text-muted/30 mb-4" />
          <h3 className="text-sm font-bold text-text-primary">No Orders Found</h3>
          <p className="text-xs text-text-muted mt-1">Orders will appear here when placed</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {orders.map((order: any) => {
            const itemCount = order.kots?.reduce((sum: number, kot: any) => sum + (kot.items?.length || 0), 0) || 0;
            const kotCount = order.kots?.length || 0;

            return (
              <Card
                key={order.id}
                padding={false}
                className={cn(
                  'overflow-hidden transition-all hover:scale-[1.01] cursor-pointer border-t-4 group',
                  order.status === 'paid' ? 'border-t-green-500' :
                  order.status === 'cancelled' ? 'border-t-red-500' :
                  order.status === 'billed' || order.status === 'served' ? 'border-t-teal-500' :
                  'border-t-blue-500'
                )}
                onClick={() => openOrderDetail(order.id)}
              >
                {/* Card Header */}
                <div className="p-3 border-b border-border/30 bg-bg-tertiary/20 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center font-black text-xs">
                      {order.table?.name || 'W'}
                    </div>
                    <div>
                      <p className="text-xs font-black text-text-primary">Order #{order.orderNumber?.split('-')[1]}</p>
                      <p className="text-[9px] text-text-muted">{order.type?.replace('_', ' ')}</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {kotCount > 0 && (
                      <Badge className="bg-amber-500/20 text-amber-400 text-[8px] font-black uppercase">
                        {kotCount} KOT
                      </Badge>
                    )}
                    {order.status === 'billed' && (
                      <Badge className="bg-teal-500/20 text-teal-400 text-[8px] font-black uppercase">Billed</Badge>
                    )}
                    {order.status === 'paid' && (
                      <Badge className="bg-green-500/20 text-green-400 text-[8px] font-black uppercase">Paid</Badge>
                    )}
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-3 space-y-2.5">
                  <div className="flex items-center justify-between text-[10px] text-text-muted">
                    <span>{formatDateTime(order.createdAt)}</span>
                    <Badge className="bg-bg-tertiary text-text-secondary text-[9px]">{itemCount} items</Badge>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-lg font-black text-text-primary">{formatCurrency(Number(order.total))}</span>
                    <Badge className={cn(getStatusColor(order.status), 'uppercase text-[8px] font-black')} dot>
                      {order.status}
                    </Badge>
                  </div>

                  {order.staff && (
                    <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
                      <div className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[7px] font-black">
                        {order.staff.name?.[0]}
                      </div>
                      <span>{order.staff.name}</span>
                    </div>
                  )}

                  {/* Quick Actions */}
                  <div className="flex gap-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
                    {order.status === 'placed' && (
                      <button
                        onClick={() => updateStatus(order.id, 'confirmed')}
                        className="flex-1 py-1.5 rounded-lg bg-blue-600 text-white text-[10px] font-black uppercase hover:bg-blue-700 transition-all"
                      >
                        Confirm
                      </button>
                    )}
                    {order.status === 'confirmed' && (
                      <button
                        onClick={() => updateStatus(order.id, 'preparing')}
                        className="flex-1 py-1.5 rounded-lg bg-amber-500 text-white text-[10px] font-black uppercase hover:bg-amber-600 transition-all"
                      >
                        Start Preparing
                      </button>
                    )}
                    {order.status === 'preparing' && (
                      <button
                        onClick={() => updateStatus(order.id, 'served')}
                        className="flex-1 py-1.5 rounded-lg bg-teal-500 text-white text-[10px] font-black uppercase hover:bg-teal-600 transition-all"
                      >
                        Mark Served
                      </button>
                    )}
                    {order.status === 'served' && (
                      <button
                        onClick={() => updateStatus(order.id, 'billed')}
                        className="flex-1 py-1.5 rounded-lg bg-teal-600 text-white text-[10px] font-black uppercase hover:bg-teal-700 transition-all"
                      >
                        Generate Bill
                      </button>
                    )}
                    {(order.status === 'billed') && (
                      <button
                        onClick={() => openOrderDetail(order.id)}
                        className="flex-1 py-1.5 rounded-lg bg-green-600 text-white text-[10px] font-black uppercase hover:bg-green-700 transition-all"
                      >
                        Payment
                      </button>
                    )}
                    {!['paid', 'cancelled'].includes(order.status) && (
                      <button
                        onClick={() => cancelOrder(order.id)}
                        className="py-1.5 px-2 rounded-lg bg-danger/10 text-danger text-[10px] hover:bg-danger/20 transition-all"
                        title="Cancel"
                      >
                        <XCircle size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Order Detail Slide Panel */}
      <OrderDetailPanel
        orderId={selectedOrderId}
        open={panelOpen}
        onClose={() => { setPanelOpen(false); setSelectedOrderId(null); }}
        onUpdate={refetch}
      />
    </div>
  );
}
