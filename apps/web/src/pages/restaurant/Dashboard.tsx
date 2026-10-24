import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [newOrderModalOpen, setNewOrderModalOpen] = useState(false);
  const [newOrderData, setNewOrderData] = useState<any | null>(null);
  const queryClient = useQueryClient();
  const { socket } = useSocket();

  const [chartRange, setChartRange] = useState(7);
  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ['restaurant-dashboard', chartRange],
    queryFn: () => api.get(`/restaurant/dashboard?days=${chartRange}`).then((r) => r.data.data ?? {}),
    refetchInterval: 30000,
  });

  const { data: invSummary } = useQuery({
    queryKey: ['inventory-summary'],
    queryFn: () => api.get('/restaurant/inventory/summary').then(r => r.data.data ?? {}),
    refetchInterval: 60_000,
  });

  const [stockModalOpen, setStockModalOpen] = useState(false);

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

    socket.on('inventory.item.updated', () => queryClient.invalidateQueries({ queryKey: ['inventory-summary'] }));
    socket.on('purchaseOrder.received', () => queryClient.invalidateQueries({ queryKey: ['inventory-summary'] }));

    return () => {
        socket.off('new_order', handleNewOrder);
        socket.off('order_updated', handleUpdateOrder);
      socket.off('inventory.item.updated', () => queryClient.invalidateQueries({ queryKey: ['inventory-summary'] }));
      socket.off('purchaseOrder.received', () => queryClient.invalidateQueries({ queryKey: ['inventory-summary'] }));
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
    <div data-testid="restaurant-dashboard-page" className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-var(--topbar-height))] animate-in p-4 overflow-hidden bg-bg-primary">

      {/* Main Content Space - Statistics & Chart (Very Big Side) */}
      <div className="flex-[2.5] flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-2 pb-4">
        
        {/* Top Section: Title and Quick Action */}
        <div className="flex items-center justify-between">
              <div>
                <h1 data-testid="restaurant-dashboard-title" className="text-xl font-black text-text-primary flex items-center gap-2 uppercase tracking-tight">
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
                  onClick={() => navigate('/admin/pos')}
                  data-testid="new-order-btn"
                  aria-label="New Order"
              >
                  New Order
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="!bg-success/20 !text-success !border-success/30 px-4 py-2 text-[10px] font-black"
                onClick={() => navigate('/admin/reservations?new=1')}
                data-testid="new-booking-btn"
                aria-label="New Booking"
              >
                New Booking
              </Button>
            </div>
        </div>

        {/* Professional Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
          {[
            { label: "Today's Orders", val: stats.todayOrders, change: stats.ordersChange, icon: ShoppingCart, color: 'blue' },
            { label: "Today's Sales", val: formatCurrency(stats.todayRevenue), change: stats.revenueChange, icon: DollarSign, color: 'emerald' },
            { label: "Total Stock Value", val: formatCurrency(stats.totalStockValue || 0), icon: Package, color: 'teal' },
            { label: "Expenses (Today)", val: formatCurrency(stats.expenses?.today || 0), icon: Flame, color: 'rose' },
            { label: "Profit (Today)", val: formatCurrency(stats.profitLossOverview?.today?.profit || 0), change: ((stats.profitLossOverview?.today?.profit || 0) >= 0) ? 1 : -1, icon: TrendingUp, color: 'emerald' },
            { label: "Low Stock Alerts", val: `${(stats.lowStockAlerts || []).length}`, icon: Package, color: 'red' }
          ].map((s, i) => {
            const slug = s.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            return (
              <div key={i} data-testid={`stat-card-${slug}`} className="bg-bg-secondary border border-border rounded-xl p-4 flex flex-col justify-between group hover:border-blue-500/30 transition-all cursor-default shadow-sm h-28 relative overflow-hidden">
                <div className="flex justify-between items-start z-10">
                  <span className="text-[9px] font-black uppercase text-text-muted tracking-widest leading-none">{s.label}</span>
                  <div className={cn("p-1.5 rounded-lg bg-white/5 border border-white/5", `text-${s.color}-400`)}>
                    {/* @ts-ignore */}
                    <s.icon size={14} />
                  </div>
                </div>
                <div className="z-10 mt-auto">
                  <div data-testid={`stat-value-${slug}`} className="text-xl font-black text-text-primary leading-none mb-1.5">{s.val}</div>
                  {s.change !== undefined && (
                    <div className={cn("text-[8px] font-black flex items-center gap-1", s.change >= 0 ? "text-success" : "text-danger")}>
                      {s.change >= 0 ? '↑' : '↓'} {Math.abs(s.change).toFixed ? Math.abs(s.change).toFixed(1) : Math.abs(s.change)}% <span className="opacity-40 text-text-muted font-normal ml-1 whitespace-nowrap">Since last 24h</span>
                    </div>
                  )}
                </div>
                <div className="absolute -bottom-4 -right-4 opacity-[0.03] group-hover:scale-110 transition-transform">
                  {/* @ts-ignore */}
                  <s.icon size={80} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Bakery Specific: Branch & Stock Row */}
        <div className="grid grid-cols-1 gap-4">
          {/* Critical Stock Alerts */}
          <div data-testid="low-stock-alerts" className="bg-red-500/5 border border-red-500/20 rounded-xl p-5 shadow-sm">
            <h3 className="text-[10px] font-black text-red-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4" />
                <span>Low Stock Alerts</span>
                <span className="text-[10px] text-red-200/80 font-black">({(invSummary?.lowStock || []).length + (invSummary?.menuImpactSummary?.lowMenuCount || 0)})</span>
              </div>
              <button onClick={() => setStockModalOpen(true)} className="text-[10px] font-black uppercase text-red-300/90">View All</button>
            </h3>
            {(invSummary?.lowStock || []).length > 0 ? (
              <div data-testid="low-stock-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {(invSummary?.lowStock || []).map((item: any, idx: number) => {
                  const stockPercentage = item.thresholdQty > 0 
                    ? Math.round((item.currentStock / item.thresholdQty) * 100)
                    : 0;
                  const isVeryLow = item.currentStock <= (item.thresholdQty * 0.25);
                  const isCritical = item.currentStock === 0;

                  return (
                    <div
                      key={idx}
                      data-testid={`low-stock-item-${idx}`}
                      className={cn(
                        'border-2 rounded-lg p-3 transition-all',
                        isCritical ? 'bg-red-950/40 border-red-500 shadow-lg shadow-red-500/20' :
                        isVeryLow ? 'bg-orange-950/40 border-orange-500 shadow-lg shadow-orange-500/20' :
                        'bg-yellow-950/40 border-yellow-500/50'
                      )}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <h4 className={cn(
                            'font-bold text-[10px] uppercase tracking-tight truncate',
                            isCritical ? 'text-red-300' :
                            isVeryLow ? 'text-orange-300' :
                            'text-yellow-300'
                          )}>
                            {item.name}
                          </h4>
                          <p className="text-[9px] text-slate-400 mt-0.5">
                            Category: {item.category?.name || '—'}
                          </p>
                        </div>
                        <div className={cn(
                          'px-2 py-1 rounded-md font-black text-[9px] flex-shrink-0 ml-2',
                          isCritical ? 'bg-red-600 text-white' :
                          isVeryLow ? 'bg-orange-600 text-white' :
                          'bg-yellow-600/60 text-white'
                        )}>
                          {isCritical ? '⚠️ OUT' : isVeryLow ? '🔴 CRITICAL' : '🟡 LOW'}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-text-muted">Current Stock:</span>
                          <span className="font-black text-text-primary">
                            {item.currentStock} {item.unit?.symbol || 'pcs'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-text-muted">Threshold:</span>
                          <span className="font-black text-text-secondary">
                            {item.thresholdQty} {item.unit?.symbol || 'pcs'}
                          </span>
                        </div>

                        {/* Stock progress bar */}
                        <div className="mt-2 bg-black/30 rounded-full h-1.5 overflow-hidden border border-white/10">
                          <div
                            className={cn(
                              'h-full transition-all',
                              isCritical ? 'bg-red-600' :
                              isVeryLow ? 'bg-orange-500' :
                              'bg-yellow-500'
                            )}
                            style={{ width: `${Math.min(stockPercentage, 100)}%` }}
                          />
                        </div>
                        <div className="text-[9px] text-slate-400 text-center">
                          {stockPercentage}% of threshold
                        </div>

                        {/* Shortage info */}
                        {item.currentStock < item.thresholdQty && (
                          <div className={cn(
                            'mt-2 px-2 py-1 rounded-lg text-[9px] font-bold text-center',
                            isCritical ? 'bg-red-600/30 text-red-200' :
                            isVeryLow ? 'bg-orange-600/30 text-orange-200' :
                            'bg-yellow-600/30 text-yellow-200'
                          )}>
                            Need {Math.ceil(item.thresholdQty - item.currentStock)} more units
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-emerald-400 font-bold uppercase text-[11px] tracking-widest">
                ✓ All items in stock - Great job!
              </div>
            )}
          </div>
        </div>

        <Modal open={stockModalOpen} onClose={() => setStockModalOpen(false)} title={`Stock Warnings`} size="lg">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-black">Inventory Items</h4>
              {(invSummary?.lowStock || []).length === 0 ? (
                <div className="text-text-muted mt-2">No low inventory items.</div>
              ) : (
                <div className="grid grid-cols-1 gap-2 mt-2">
                  {(invSummary?.lowStock || []).map((it: any) => (
                    <div key={it.id} className="p-2 border rounded flex justify-between items-center">
                      <div>
                        <div className="font-bold">{it.name}</div>
                        <div className="text-xs text-text-muted">{it.category?.name || '—'}</div>
                      </div>
                      <div className="text-right text-sm font-black">{it.currentStock} {it.unit?.symbol || ''}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-sm font-black">Impacted Menu Items</h4>
              {(invSummary?.menuImpactSummary?.lowMenuItems || []).length === 0 ? (
                <div className="text-text-muted mt-2">No impacted menu items.</div>
              ) : (
                <div className="grid grid-cols-1 gap-2 mt-2">
                  {(invSummary?.menuImpactSummary?.lowMenuItems || []).map((m: any) => (
                    <div key={m.id} className="p-2 border rounded">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-bold">{m.name}</div>
                          <div className="text-xs text-text-muted">Available servings: <span className="font-black">{m.availableServings}</span></div>
                        </div>
                        <div className="text-xs text-right">
                          {m.isLow ? <span className="text-red-400 font-black">OUT</span> : m.isLowSoon ? <span className="text-yellow-400 font-black">LOW</span> : null}
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-text-muted">
                        Ingredients:
                        <ul className="list-disc ml-4 mt-1">
                          {m.ingredients.map((ing: any) => (
                            <li key={ing.id}>{ing.name} — {ing.currentStock}{ing.unit ? ` ${ing.unit}` : ''} (needs {ing.requiredQty})</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>

        {/* Center Split: Methods and Top Dishes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Top Selling Dishes - Professional Small Font Look */}
          <div className="bg-bg-secondary border border-border rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-5">
                <h3 className="text-[10px] font-black text-text-primary uppercase tracking-[0.2em] flex items-center gap-2">
                    <Flame className="w-3 h-3 text-orange-400" />
                    Top Selling Dishes (Today)
                </h3>
            </div>
            <div className="space-y-3">
              {(stats.bakery?.topItems || []).slice(0, 4).map((item: any, idx: number) => (
                <div key={idx} data-testid={`top-item-${idx}`} className="flex items-center justify-between text-[11px] border-b border-border/20 pb-2.5 last:border-0 last:pb-0 group">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-text-muted font-black w-3">{idx + 1}.</span>
                    <span className="text-text-secondary font-bold truncate group-hover:text-text-primary transition-colors uppercase tracking-tight">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span data-testid={`top-item-count-${idx}`} className="font-black text-text-primary">{item.count} Sold</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500/20 border border-blue-500/30" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-bg-secondary border border-border rounded-xl p-5 shadow-sm">
            <h3 className="text-[10px] font-black text-text-primary uppercase tracking-[0.2em] mb-5">Transaction Breakdown</h3>
            <div className="space-y-3">
              {(stats.paymentMethods || []).map((method: any, idx: number) => (
                <div key={idx} data-testid={`payment-method-${idx}`} className="flex justify-between items-center text-[11px] border-b border-border/20 pb-2.5 last:border-0 last:pb-0">
                  <span className="text-text-muted font-bold flex items-center gap-2 uppercase tracking-tighter">
                    <CheckCircle2 className="w-2.5 h-2.5 text-blue-500" />
                    {method.name || method.method}
                  </span>
                  <span data-testid={`payment-value-${idx}`} className="font-black text-text-primary">{formatCurrency(method.value || method.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Professional Chart Area - Under Top Selling Dishes */}
        <div className="bg-bg-secondary border border-border rounded-xl p-6 shadow-sm">
          <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
            <div>
              <h3 className="text-lg font-black text-text-primary uppercase tracking-tighter flex items-center gap-2">
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
                className="bg-bg-elevated border border-border text-xs font-bold text-text-primary px-3 py-2 rounded outline-none"
                data-testid="chart-range-select"
                aria-label="Chart range"
              >
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
              </select>
            </div>
          </div>

          <div data-testid="revenue-chart" className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.chartData || []} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)' }} formatter={(value: any) => [formatCurrency(value), 'Revenue']} />
                <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fill="url(#chartGradient)" activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Active Order Feed (Responsive sizing) */}
      <div className="flex-[1] min-w-0 sm:min-w-[340px] flex flex-col bg-bg-secondary rounded-xl overflow-hidden border border-border shadow-2xl backdrop-blur-md">
        <div className="p-4 border-b border-border bg-bg-tertiary flex items-center justify-between">
          <h2 data-testid="live-order-header" className="text-[10px] font-black text-text-primary uppercase tracking-[0.2em] flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Order Stream
          </h2>
          <Badge variant="secondary" className="text-[9px] font-black uppercase tracking-widest bg-white/5 border-white/5">Auto-update</Badge>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">
          {(stats.recentOrders || []).map((order: any) => (
            <div 
                key={order.id} 
                data-testid={`order-card-${order.id}`}
                onClick={() => openOrder(order.id)}
                className="bg-bg-tertiary border border-border rounded-xl p-4 relative flex flex-col group hover:shadow-glow-sm transition-all hover:border-blue-500/50 cursor-pointer"
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
                <div className="w-10 h-10 rounded-xl bg-bg-secondary border border-border flex flex-col items-center justify-center font-black text-text-secondary shadow-inner">
                    <span className="text-[7px] uppercase opacity-40">T-ID</span>
                    <span className="text-sm leading-none">{order.table?.name || 'WA'}</span>
                </div>
                <div className="min-w-0 flex-1">
                    <h4 className="text-[11px] font-black text-text-primary mb-0.5 truncate uppercase tracking-tighter">
                        {order.customer || `Order #${order.orderNumber.split('-')[1]}`}
                    </h4>
                    <p className="text-[9px] text-text-muted font-bold uppercase tracking-wider">
                        {order.items} ITEMS <span className="mx-1 opacity-20">•</span> {order.timeAgo || 'Just now'}
                    </p>
                </div>
              </div>

              <div className="flex items-end justify-between pt-3 border-t border-border/20">
                <span className="text-sm font-black text-text-primary">{formatCurrency(order.total || order.amount)}</span>
                <div className="text-[10px] font-black text-text-muted group-hover:text-blue-400 transition-colors uppercase tracking-tight flex items-center gap-1">
                  Full Details <ChevronRight size={14} />
                </div>
              </div>
            </div>
          ))}
            {(stats.recentOrders || []).length === 0 && (
              <div data-testid="order-stream-idle" className="text-center py-24 opacity-20 filter grayscale">
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
        <div data-testid="new-order-modal" className="p-4 text-center">
          <p className="text-lg font-bold">New order received: {newOrderData?.orderNumber}</p>
          <p className="mt-2 text-sm text-text-muted">Table: {newOrderData?.table?.name || 'N/A'} • {newOrderData?.type}</p>
          <div className="mt-4 flex justify-center gap-3">
            <Button data-testid="new-order-view-btn" size="sm" variant="primary" onClick={() => { if (newOrderData?.id) openOrder(newOrderData.id); setNewOrderModalOpen(false); }}>View Order</Button>
            <Button data-testid="new-order-close-btn" size="sm" variant="secondary" onClick={() => setNewOrderModalOpen(false)}>Close</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
