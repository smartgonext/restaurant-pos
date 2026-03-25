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
  Plus
} from 'lucide-react';
import { formatCurrency, formatDateTime, cn } from '@/lib/utils';
import api from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';
import { OrderDetailPanel } from '@/components/orders/OrderDetailPanel';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';

export default function RestaurantDashboard() {
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const queryClient = useQueryClient();
  const { socket } = useSocket();

  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ['restaurant-dashboard'],
    queryFn: () => api.get('/restaurant/dashboard').then((r) => r.data.data),
    refetchInterval: 30000,
  });

  // Socket listener for real-time updates
  useEffect(() => {
    if (!socket) return;

    const handleNewOrder = (order: any) => {
        queryClient.invalidateQueries({ queryKey: ['restaurant-dashboard'] });
        toast.success(`New order received: ${order.orderNumber}`, {
            icon: '🔥',
            duration: 5000,
        });
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
            <Button 
                size="sm"
                className="bg-blue-600 hover:bg-blue-500 text-white font-black uppercase text-[10px] shadow-lg shadow-blue-500/20 px-6 py-4"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => window.location.href = '/admin/pos'}
            >
                New Order
            </Button>
        </div>

        {/* Professional Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
                { label: "Today's Orders", val: stats.todayOrders, change: stats.ordersChange, icon: ShoppingCart, color: 'blue' },
                { label: "Gross Revenue", val: formatCurrency(stats.todayRevenue), change: stats.revenueChange, icon: DollarSign, color: 'emerald' },
                { label: "Total Customers", val: stats.totalCustomers || 42, icon: Users, color: 'purple' },
                { label: "Table Occupancy", val: `${stats.runningTables}/${stats.totalTables}`, icon: Clock, color: 'amber' }
            ].map((s, i) => (
                <div key={i} className="bg-bg-secondary/40 border border-border/50 rounded-xl p-4 flex flex-col justify-between group hover:border-blue-500/30 transition-all cursor-default shadow-sm h-28 relative overflow-hidden">
                    <div className="flex justify-between items-start z-10">
                        <span className="text-[9px] font-black uppercase text-text-muted tracking-widest leading-none">{s.label}</span>
                        <div className={cn("p-1.5 rounded-lg bg-white/5 border border-white/5", `text-${s.color}-400`)}>
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
                        <s.icon size={80} />
                    </div>
                </div>
            ))}
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
                {(stats.topItems || []).slice(0, 4).map((item: any, idx: number) => (
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

        {/* Professional Blue Graph Area - Under Top Selling Dishes */}
        <div className="bg-bg-secondary/40 border border-border/50 rounded-xl p-6 shadow-sm">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h3 className="text-lg font-black text-white uppercase tracking-tighter flex items-center gap-2">
                <TrendingUp size={18} className="text-blue-500" />
                Revenue Performance Analytics
              </h3>
              <p className="text-[10px] text-text-muted font-bold uppercase tracking-[0.1em] mt-0.5">Real-time data visualization • Professional Curve</p>
            </div>
            <div className="text-right">
                <span className="text-xl font-black text-blue-400">↑ 12.5%</span>
                <p className="text-[8px] text-text-muted font-black uppercase tracking-widest">Global Trend</p>
            </div>
          </div>

          {/* SVG Area Chart - Professional Blue Look */}
          <div className="h-72 w-full relative pt-4">
            {/* Y-Axis labels */}
            <div className="absolute left-0 top-0 bottom-8 flex flex-col justify-between text-[9px] text-text-muted pt-4 font-black uppercase opacity-60">
              <span>$10k</span>
              <span>$7k</span>
              <span>$5k</span>
              <span>$2k</span>
              <span>$0</span>
            </div>

            <div className="ml-12 h-full relative">
              {/* Grid lines */}
              <div className="absolute inset-0 flex flex-col justify-between border-b border-l border-border/30">
                {[...Array(5)].map((_, i) => <div key={i} className="w-full border-t border-dashed border-border/20"></div>)}
              </div>

              {/* Blue Curve Style */}
              <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                <path d="M0,85 Q20,105 40,90 T80,85 T100,25 L100,100 L0,100 Z" fill="url(#blue-gradient)" className="opacity-25" />
                <path d="M0,85 Q20,105 40,90 T80,85 T100,25" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />

                {/* Animated Data Points */}
                <circle cx="0" cy="85" r="2" fill="#3b82f6" className="drop-shadow-glow-blue" />
                <circle cx="35" cy="95" r="2" fill="#3b82f6" className="drop-shadow-glow-blue" />
                <circle cx="70" cy="85" r="2" fill="#3b82f6" className="drop-shadow-glow-blue" />
                <circle cx="100" cy="25" r="2" fill="#3b82f6" className="drop-shadow-glow-blue" />

                <defs>
                  <linearGradient id="blue-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>

              {/* X-Axis Labels */}
              <div className="absolute -bottom-7 left-0 right-0 flex justify-between text-[9px] text-text-muted font-black uppercase tracking-widest opacity-70">
                <span>MON</span>
                <span>TUE</span>
                <span>WED</span>
                <span>THU</span>
                <span>FRI</span>
                <span>SAT</span>
                <span>SUN</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Active Order Feed (Responsive sizing) */}
      <div className="flex-[1] min-w-[340px] flex flex-col bg-bg-secondary/60 rounded-xl overflow-hidden border border-border/50 shadow-2xl backdrop-blur-md">
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
    </div>
  );
}
