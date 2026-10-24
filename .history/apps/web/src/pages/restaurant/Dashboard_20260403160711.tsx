import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { 
  ShoppingCart, 
  Users, 
  TrendingUp, 
  DollarSign, 
  Clock, 
  CheckCircle2, 
  MoreHorizontal, 
  Package,
  ChevronRight,
  Flame,
  LayoutDashboard,
  Plus,
  Hash
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatCurrency, formatDateTime, cn } from '@/lib/utils';
import api from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';
import { Modal } from '@/components/ui/Modal';
import { soundManager } from '@/lib/sounds';
import { OrderDetailPanel } from '@/components/orders/OrderDetailPanel';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';

export default function RestaurantDashboard() {
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [newOrderModalOpen, setNewOrderModalOpen] = useState(false);
  const [newOrderData, setNewOrderData] = useState<any | null>(null);
  const queryClient = useQueryClient();
  const { socket } = useSocket();

  const [chartRange, setChartRange] = useState(7);
  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ['restaurant-dashboard', chartRange],
    queryFn: () => api.get(`/restaurant/dashboard?days=${chartRange}`).then((r) => r.data.data),
    refetchInterval: 30000,
  });

  const { data: invSummary } = useQuery({
    queryKey: ['inventory-summary'],
    queryFn: () => api.get('/restaurant/inventory/summary').then(r => r.data.data),
    refetchInterval: 60_000,
  });

  // Socket listener for real-time updates
  useEffect(() => {
    if (!socket) return;

    const handleNewOrder = (order: any) => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-dashboard'] });
      // show modal and play loud sound
      setNewOrderData(order);
      setNewOrderModalOpen(true);
      // play order bell multiple times to be loud
      soundManager.playOrderBell();
      setTimeout(() => soundManager.playOrderBell(), 250);
    };

    const handleUpdateOrder = () => {
        queryClient.invalidateQueries({ queryKey: ['restaurant-dashboard'] });
    };

    socket.on('new_order', handleNewOrder);
    socket.on('order_updated', handleUpdateOrder);

    return () => {
        socket.off('new_order', handleNewOrder);
        socket.off('order_updated', handleUpdateOrder);
    };
  }, [socket, queryClient]);

  const openOrder = (id: number) => {
    setSelectedOrderId(id);
    setPanelOpen(true);
  };

  if (isLoading) return (
    <div className="animate-pulse space-y-6 p-8">
        <div className="h-4 bg-bg-secondary w-32 rounded mb-4"></div>
        <div className="grid grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-24 bg-bg-secondary rounded-xl"></div>)}
        </div>
        <div className="h-64 bg-bg-secondary rounded-xl"></div>
    </div>
  );
  
  if (!stats) return null;

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-6rem)] animate-in p-6 overflow-hidden bg-bg-primary">

      {/* Main Content Space - Statistics & Chart (Very Big Side) */}
      <div className="flex-[2.5] flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2 pb-10">
        
        {/* Top Section: Title and Quick Action */}
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-xl font-black text-white flex items-center gap-2 uppercase tracking-tight">
                    <LayoutDashboard className="w-5 h-5 text-blue-500" />
                    Restaurant Command Center
                </h1>
                <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest mt-0.5">Real-time Performance Monitoring</p>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-500 text-white font-black uppercase text-[10px] shadow-lg shadow-blue-500/20 px-6 py-4"
                  icon={<Plus className="w-4 h-4" />}
                  onClick={() => window.location.href = '/admin/pos'}
              >
                  New Order
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="!bg-success/20 !text-success !border-success/30 px-4 py-2 text-[10px] font-black"
                onClick={() => (window.location.href = '/admin/reservations?new=1')}
              >
                New Booking
              </Button>
            </div>
        </div>

        {/* Professional Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
                { label: "Today's Orders", val: stats.todayOrders, change: stats.ordersChange, icon: ShoppingCart, color: 'blue' },
                { label: "Gross Revenue", val: formatCurrency(stats.todayRevenue), change: stats.revenueChange, icon: DollarSign, color: 'emerald' },
                { label: "Total Customers", val: stats.totalCustomers ?? 0, icon: Users, color: 'purple' },
                { label: "Token Status", val: `${stats.bakery?.tokensPaid ?? 0} Paid / ${stats.bakery?.tokensPending ?? 0} Open`, icon: Hash, color: 'amber' }
            ].map((s, i) => (
                <div key={i} className="bg-bg-secondary/40 border border-border/50 rounded-xl p-4 flex flex-col justify-between group hover:border-blue-500/30 transition-all cursor-default shadow-sm h-28 relative overflow-hidden">
                    <div className="flex justify-between items-start z-10">
                        <span className="text-[9px] font-black uppercase text-text-muted tracking-widest leading-none">{s.label}</span>
                        <div className={cn("p-1.5 rounded-lg bg-white/5 border border-white/5", `text-${s.color}-400`)}>
                            {/* @ts-ignore */}
                            <s.icon size={14} />
                        </div>
                    </div>
                    <div className="z-10 mt-auto">
                        <div className="text-xl font-black text-white leading-none mb-1.5">{s.val}</div>
                        {s.change !== undefined && (
                            <div className={cn("text-[8px] font-black flex items-center gap-1", s.change >= 0 ? "text-success" : "text-danger")}>
                                {s.change >= 0 ? '↑' : '↓'} {Math.abs(s.change).toFixed(1)}% <span className="opacity-40 text-text-muted font-normal ml-1 whitespace-nowrap">Since last 24h</span>
                            </div>
                        )}
                    </div>
                    <div className="absolute -bottom-4 -right-4 opacity-[0.03] group-hover:scale-110 transition-transform">
                        {/* @ts-ignore */}
                        <s.icon size={80} />
                    </div>
                </div>
            ))}
        </div>

        {/* Bakery Specific: Branch & Stock Row */}
        <div className="grid grid-cols-1 gap-4">
          {/* Critical Stock Alerts */}
          <div className="bg-bg-secondary/40 border border-border/50 rounded-xl p-5 shadow-sm">
            <h3 className="text-[10px] font-black text-text-primary uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-3 h-3 text-red-500" />
              Critical Stock Alerts
            </h3>
            <div className="space-y-3">
              {(invSummary?.lowStock || []).map((s: any, idx: number) => (
                <div key={idx} className="flex justify-between items-center text-[11px] bg-red-500/5 border border-red-500/20 rounded-lg px-2.5 py-1.5">
                  <span className="text-red-300 font-bold uppercase">{s.name}</span>
                  <span className="text-white font-black">{s.currentStock} {s.unit?.symbol || ''} <span className="text-[9px] text-red-400 opacity-60">(Min: {s.thresholdQty})</span></span>
                </div>
              ))}
              {(!(invSummary?.lowStock || []).length) && <div className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest text-center py-2">✓ All items in stock</div>}
            </div>
          </div>
        </div>

        {/* Center Split: Methods and Top Dishes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Top Selling Dishes - Professional Small Font Look */}
          <div className="bg-bg-secondary/40 border border-border/50 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-5">
                <h3 className="text-[10px] font-black text-text-primary uppercase tracking-[0.2em] flex items-center gap-2">
                    <Flame className="w-3 h-3 text-orange-400" />
                    Top Selling Dishes (Today)
                </h3>
            </div>
            <div className="space-y-3">
                {(stats.bakery?.topItems || []).slice(0, 4).map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between text-[11px] border-b border-border/20 pb-2.5 last:border-0 last:pb-0 group">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="text-text-muted font-black w-3">{idx + 1}.</span>
                            <span className="text-text-secondary font-bold truncate group-hover:text-white transition-colors uppercase tracking-tight">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="font-black text-white">{item.count} Sold</span>
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500/20 border border-blue-500/30" />
                        </div>
                    </div>
                ))}
            </div>
          </div>

          <div className="bg-bg-secondary/40 border border-border/50 rounded-xl p-5 shadow-sm">
            <h3 className="text-[10px] font-black text-text-primary uppercase tracking-[0.2em] mb-5">Transaction Breakdown</h3>
            <div className="space-y-3">
              {(stats.paymentMethods || []).map((method: any, idx: number) => (
                <div key={idx} className="flex justify-between items-center text-[11px] border-b border-border/20 pb-2.5 last:border-0 last:pb-0">
                  <span className="text-text-muted font-bold flex items-center gap-2 uppercase tracking-tighter">
                    <CheckCircle2 className="w-2.5 h-2.5 text-blue-500" />
                    {method.name || method.method}
                  </span>
                  <span className="font-black text-white">{formatCurrency(method.value || method.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Professional Chart Area - Under Top Selling Dishes */}
        <div className="bg-bg-secondary/40 border border-border/50 rounded-xl p-6 shadow-sm">
          <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
            <div>
              <h3 className="text-lg font-black text-white uppercase tracking-tighter flex items-center gap-2">
                <TrendingUp size={18} className="text-blue-500" />
                Revenue Performance Analytics
              </h3>
              <p className="text-[10px] text-text-muted font-bold uppercase tracking-[0.1em] mt-0.5">Real-time data visualization • Professional look</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Range</span>
              <select
                value={chartRange}
                onChange={(e) => setChartRange(Number(e.target.value))}
                className="bg-[#0f1014] border border-gray-800 text-xs font-bold text-white px-3 py-2 rounded outline-none"
              >
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
              </select>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.chartData || []} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip contentStyle={{ backgroundColor: '#0f1014', border: '1px solid #2d2f3a' }} formatter={(value: any) => [formatCurrency(value), 'Revenue']} />
                <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fill="url(#chartGradient)" activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Active Order Feed (Responsive sizing) */}
      <div className="flex-[1] min-w-0 sm:min-w-[340px] flex flex-col bg-bg-secondary/60 rounded-xl overflow-hidden border border-border/50 shadow-2xl backdrop-blur-md">
        <div className="p-4 border-b border-border/50 bg-bg-tertiary/40 flex items-center justify-between">
          <h2 className="text-[10px] font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Order Stream
          </h2>
          <Badge variant="secondary" className="text-[9px] font-black uppercase tracking-widest bg-white/5 border-white/5">Auto-update</Badge>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">
          {(stats.recentOrders || []).map((order: any) => (
            <div 
                key={order.id} 
                onClick={() => openOrder(order.id)}
                className="bg-bg-tertiary/30 border border-border/30 rounded-xl p-4 relative flex flex-col group hover:shadow-glow-sm transition-all hover:border-blue-500/50 cursor-pointer"
            >

              <div className="absolute top-2 right-2 flex gap-1.5 flex-col items-end">
                <div className={cn(
                    "text-[8px] px-2 py-0.5 rounded font-black uppercase tracking-widest border",
                    order.status === 'paid' ? "bg-emerald-500/5 text-emerald-400 border-emerald-500/20" :
                    order.status === 'cancelled' ? "bg-rose-500/5 text-rose-400 border-rose-500/20" :
                    "bg-blue-500/5 text-blue-400 border-blue-500/20"
                )}>
                    {order.status || 'NEW'}
                </div>
              </div>

              <div className="flex gap-4 items-center mb-4">
                <div className="w-10 h-10 rounded-xl bg-bg-secondary border border-border/50 flex flex-col items-center justify-center font-black text-text-secondary shadow-inner">
                    <span className="text-[7px] uppercase opacity-40">T-ID</span>
                    <span className="text-sm leading-none">{order.table?.name || 'WA'}</span>
                </div>
                <div className="min-w-0 flex-1">
                    <h4 className="text-[11px] font-black text-white mb-0.5 truncate uppercase tracking-tighter">
                        {order.customer || `Order #${order.orderNumber.split('-')[1]}`}
                    </h4>
                    <p className="text-[9px] text-text-muted font-bold uppercase tracking-wider">
                        {order.items} ITEMS <span className="mx-1 opacity-20">•</span> {order.timeAgo || 'Just now'}
                    </p>
                </div>
              </div>

              <div className="flex items-end justify-between pt-3 border-t border-border/20">
                <span className="text-sm font-black text-white">{formatCurrency(order.total || order.amount)}</span>
                <div className="text-[10px] font-black text-text-muted group-hover:text-blue-400 transition-colors uppercase tracking-tight flex items-center gap-1">
                  Full Details <ChevronRight size={14} />
                </div>
              </div>
            </div>
          ))}
          {(stats.recentOrders || []).length === 0 && (
              <div className="text-center py-24 opacity-20 filter grayscale">
                  <Package size={40} className="mx-auto mb-4" />
                  <p className="text-[10px] font-black uppercase tracking-widest">Stream Idle</p>
              </div>
          )}
        </div>
      </div>

      <OrderDetailPanel
        orderId={selectedOrderId}
        open={panelOpen}
        onClose={() => { setPanelOpen(false); setSelectedOrderId(null); }}
        onUpdate={refetch}
      />

      <Modal open={newOrderModalOpen} onClose={() => setNewOrderModalOpen(false)} title="New Order Received">
        <div className="p-4 text-center">
          <p className="text-lg font-bold">New order received: {newOrderData?.orderNumber}</p>
          <p className="mt-2 text-sm text-text-muted">Table: {newOrderData?.table?.name || 'N/A'} • {newOrderData?.type}</p>
          <div className="mt-4 flex justify-center gap-3">
            <Button size="sm" variant="primary" onClick={() => { if (newOrderData?.id) openOrder(newOrderData.id); setNewOrderModalOpen(false); }}>View Order</Button>
            <Button size="sm" variant="secondary" onClick={() => setNewOrderModalOpen(false)}>Close</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
