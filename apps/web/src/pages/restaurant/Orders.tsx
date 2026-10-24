import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { OrderDetailPanel } from '@/components/orders/OrderDetailPanel';
import { useSocket } from '@/hooks/useSocket';
import {
  ClipboardList, Search, Eye, ArrowRight, XCircle, DollarSign,
  Filter, RefreshCw, Clock, ShoppingCart, Utensils, ChevronDown, Bell, X
} from 'lucide-react';
import { formatCurrency, formatDateTime, getStatusColor, cn } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

import { FilterBar } from '@/components/ui/FilterBar';

const getTodayStr = () => new Date().toISOString().split('T')[0];

export default function Orders() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState(() => {
    const today = getTodayStr();
    return { startDate: today, endDate: today };
  });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [newOrderNotification, setNewOrderNotification] = useState<any>(null);
  const { socket } = useSocket();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['orders', statusFilter, typeFilter, dateRange.startDate, dateRange.endDate],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (dateRange.startDate) params.set('startDate', dateRange.startDate);
      if (dateRange.endDate) params.set('endDate', dateRange.endDate);
      const qs = params.toString();
      return api.get(`/restaurant/orders${qs ? `?${qs}` : ''}`).then((r) => r.data);
    },
    refetchInterval: autoRefresh ? 10000 : false,
  });

  // Play notification sound
  const playNotificationSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const notes = [
        { freq: 800, duration: 0.1 },
        { freq: 1000, duration: 0.1 },
        { freq: 1200, duration: 0.2 },
      ];

      let time = audioContext.currentTime;
      notes.forEach(({ freq, duration }) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = freq;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, time);
        gainNode.gain.exponentialRampToValueAtTime(0.01, time + duration);

        oscillator.start(time);
        oscillator.stop(time + duration);
        time += duration;
      });
    } catch (e) {
      // Fallback
    }
  };

  // Socket.io listener for new orders
  useEffect(() => {
    if (!socket) return;

    socket.on('new_order', (order: any) => {
      playNotificationSound();
      setNewOrderNotification(order);
      toast.success(`📦 New order received: Table ${order.table?.name}`, {
        duration: 5000,
      });
      refetch();
    });

    return () => {
      socket.off('new_order');
    };
  }, [socket, refetch]);

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

  const setQuickPreset = (preset: 'today' | 'yesterday' | '7days' | 'month') => {
    const now = new Date();
    const today = getTodayStr();
    if (preset === 'today') {
      setDateRange({ startDate: today, endDate: today });
    } else if (preset === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().split('T')[0];
      setDateRange({ startDate: yStr, endDate: yStr });
    } else if (preset === '7days') {
      const d7 = new Date(now);
      d7.setDate(d7.getDate() - 6);
      setDateRange({ startDate: d7.toISOString().split('T')[0], endDate: today });
    } else if (preset === 'month') {
      const m1 = new Date(now.getFullYear(), now.getMonth(), 1);
      setDateRange({ startDate: m1.toISOString().split('T')[0], endDate: today });
    }
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
          {/* Quick Date Presets */}
          <div className="hidden sm:flex items-center gap-1 bg-bg-secondary p-1 rounded-lg border border-border/50">
            {[
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: '7days', label: 'Last 7 Days' },
              { id: 'month', label: 'This Month' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setQuickPreset(p.id as any)}
                className={cn(
                  "px-2.5 py-1 text-[10px] font-bold uppercase rounded transition-all",
                  (p.id === 'today' && dateRange.startDate === getTodayStr() && dateRange.endDate === getTodayStr()) ||
                  (p.id === 'yesterday' && dateRange.startDate !== getTodayStr() && dateRange.startDate === dateRange.endDate)
                    ? "bg-purple-600 text-white shadow-sm"
                    : "text-text-muted hover:text-text-primary hover:bg-bg-tertiary"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

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

      {/* Integrated Universal Filter Bar with Date Range, Status & Search */}
      <FilterBar
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search order #, customer name, or table..."
        startDate={dateRange.startDate}
        endDate={dateRange.endDate}
        onDateChange={setDateRange}
        showDateFilter={true}
        status={statusFilter === 'all' ? '' : statusFilter}
        statusOptions={[
          { label: 'Placed', value: 'placed' },
          { label: 'Confirmed', value: 'confirmed' },
          { label: 'Preparing', value: 'preparing' },
          { label: 'Served', value: 'served' },
          { label: 'Billed', value: 'billed' },
          { label: 'Paid', value: 'paid' },
          { label: 'Cancelled', value: 'cancelled' },
        ]}
        onStatusChange={(val) => setStatusFilter(val || 'all')}
        category={typeFilter === 'all' ? '' : typeFilter}
        categoryOptions={[
          { label: 'Dine-In', value: 'dine_in' },
          { label: 'Delivery', value: 'delivery' },
          { label: 'Pickup', value: 'pickup' },
        ]}
        onCategoryChange={(val) => setTypeFilter(val || 'all')}
        onReset={() => {
          const today = getTodayStr();
          setSearch('');
          setStatusFilter('all');
          setTypeFilter('all');
          setDateRange({ startDate: today, endDate: today });
        }}
      />

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

      {/* New Order Notification Modal */}
      {newOrderNotification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-bg-primary rounded-2xl shadow-2xl border border-border/50 overflow-hidden animate-in slide-in-from-bottom-1/4 duration-300">
            {/* Header */}
            <div className="relative px-6 py-4 border-b border-border/30 bg-gradient-to-r from-blue-500/10 to-blue-400/10">
              <button
                onClick={() => setNewOrderNotification(null)}
                className="absolute right-4 top-4 p-1.5 hover:bg-bg-hover rounded-lg transition-all"
              >
                <X size={18} className="text-text-muted" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center animate-bounce">
                  <Bell size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-text-primary uppercase">New Order Received</h3>
                  <p className="text-[11px] text-text-muted mt-0.5">Real-time notification</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-5 space-y-4">
              {/* Order Number & Table */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-bold text-text-muted uppercase">Order #</p>
                  <p className="text-lg font-black text-blue-400 mt-1">
                    {newOrderNotification.orderNumber?.split('-')[1]}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-text-muted uppercase">Table</p>
                  <p className="text-lg font-black text-text-primary mt-1">
                    {newOrderNotification.table?.name || 'N/A'}
                  </p>
                </div>
              </div>

              {/* Order Type & Items */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/30">
                <div>
                  <p className="text-[10px] font-bold text-text-muted uppercase">Type</p>
                  <Badge className="mt-1 text-[10px]">
                    {newOrderNotification.type?.replace('_', ' ')}
                  </Badge>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-text-muted uppercase">Total Items</p>
                  <p className="text-sm font-black text-text-primary mt-1">
                    {newOrderNotification.kots?.reduce(
                      (sum: number, kot: any) => sum + (kot.items?.length || 0),
                      0
                    ) || 0}
                  </p>
                </div>
              </div>

              {/* Amount & Time */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/30">
                <div>
                  <p className="text-[10px] font-bold text-text-muted uppercase">Amount</p>
                  <p className="text-lg font-black text-green-400 mt-1">
                    {formatCurrency(Number(newOrderNotification.total))}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-text-muted uppercase">Time</p>
                  <p className="text-xs text-text-muted mt-1">
                    {new Date(newOrderNotification.createdAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>

              {/* Note */}
              {newOrderNotification.specialNote && (
                <div className="pt-2 border-t border-border/30">
                  <p className="text-[10px] font-bold text-text-muted uppercase mb-2">Special Note</p>
                  <p className="text-xs text-text-secondary bg-bg-tertiary/50 p-2.5 rounded-lg border border-border/20">
                    {newOrderNotification.specialNote}
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-6 py-4 border-t border-border/30 bg-bg-tertiary/20 flex gap-3">
              <button
                onClick={() => {
                  setNewOrderNotification(null);
                  openOrderDetail(newOrderNotification.id);
                }}
                className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-black uppercase hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
              >
                <Eye size={16} />
                View Order
              </button>
              <button
                onClick={() => setNewOrderNotification(null)}
                className="flex-1 py-2.5 rounded-lg bg-bg-hover text-text-secondary text-sm font-black uppercase hover:bg-bg-tertiary transition-all"
              >
                Dismiss
              </button>
            </div>
          </div>
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
