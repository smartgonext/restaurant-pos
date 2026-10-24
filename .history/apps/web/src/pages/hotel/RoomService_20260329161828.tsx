import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Search, UtensilsCrossed, ArrowRight, User, BedDouble, Clock, Info, CheckCircle2, AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import api from '@/lib/api';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { useNavigate } from 'react-router-dom';

interface Order {
  id: number;
  orderNumber: string;
  total: number;
  status: string;
  customer?: { name?: string };
  table?: { name?: string };
  createdAt: string;
}

export default function RoomService() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['hotel', 'room-service-orders'],
    queryFn: () => api.get('/restaurant/orders', { params: { type: 'room_service' } }).then((r) => r.data),
  });

  const orders: Order[] = data?.data || [];
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return orders.filter((o) => `${o.orderNumber} ${o.customer?.name || ''} ${o.table?.name || ''}`.toLowerCase().includes(q));
  }, [orders, search]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed': return <Badge variant="success" className="text-[9px] font-black uppercase tracking-widest rounded-lg px-2">Delivered</Badge>;
      case 'cooking': return <Badge variant="info" className="text-[9px] font-black uppercase tracking-widest rounded-lg px-2">In Kitchen</Badge>;
      case 'cancelled': return <Badge variant="destructive" className="text-[9px] font-black uppercase tracking-widest rounded-lg px-2">Cancelled</Badge>;
      default: return <Badge variant="secondary" className="text-[9px] font-black uppercase tracking-widest rounded-lg px-2">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-card/50 backdrop-blur-md border border-border p-5 rounded-2xl shadow-xl shadow-black/10">
        <div className="flex items-center gap-4">
           <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <UtensilsCrossed className="w-6 h-6 text-blue-400" />
           </div>
           <div>
              <h1 className="text-2xl font-black text-text-primary tracking-tight">Room Service & Dining</h1>
              <p className="text-sm text-text-muted mt-1 font-medium italic">Monitor in-room dining orders and fulfillment</p>
           </div>
        </div>
        <div className="flex items-center gap-3">
           <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                className="bg-bg-dark border border-border rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500/50 outline-none transition-all w-full md:w-64"
                placeholder="Search order or room..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
           </div>
           <Button onClick={() => navigate('/admin/pos')} variant="primary" className="shadow-lg shadow-blue-500/30 font-black px-6 text-[10px] uppercase tracking-widest h-10">
              <PlusIcon className="w-4 h-4 mr-2" /> New Order
           </Button>
        </div>
      </div>

      <div className="bg-blue-500/5 border border-blue-500/10 p-4 rounded-xl flex items-start gap-4 text-xs text-blue-400/80 font-medium italic">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-black uppercase tracking-widest text-[10px] text-blue-400 mb-1">Operational Note</p>
          To create room service orders, use the integrated POS system and select "Hotel Room" as the service context. 
          Orders are automatically posted to guest folios upon finalization.
        </div>
      </div>

      <Card padding={false} className="overflow-hidden border-border/40 rounded-2xl shadow-xl bg-bg-card/50">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-dark/50 text-[10px] font-black uppercase tracking-[0.15em] text-text-muted">
                <th className="text-left py-4 px-6 italic">Order Identity</th>
                <th className="text-left py-4 px-6 italic">Room / Stay</th>
                <th className="text-left py-4 px-6 italic">Guest Details</th>
                <th className="text-left py-4 px-6 italic">Total Charges</th>
                <th className="text-left py-4 px-6 italic">Fulfillment</th>
                <th className="text-right py-4 px-6 italic">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={6} className="p-4"><Skeleton className="h-10 w-full rounded-lg" /></td></tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-20 text-center">
                    <div className="w-16 h-16 bg-bg-dark rounded-2xl flex items-center justify-center mx-auto mb-4 border border-border/60">
                      <UtensilsCrossed className="w-8 h-8 text-text-muted/50" />
                    </div>
                    <p className="text-text-muted font-bold italic">No active room service orders.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((order) => (
                  <tr key={order.id} className="group hover:bg-blue-500/[0.02] transition-colors">
                    <td className="py-4 px-6">
                       <div>
                          <p className="text-[10px] font-mono font-bold text-text-muted mb-0.5 tracking-widest uppercase">{order.orderNumber}</p>
                          <p className="text-[10px] text-text-muted font-black italic">Placed {new Date(order.createdAt).toLocaleTimeString()}</p>
                       </div>
                    </td>
                    <td className="py-4 px-6 font-black text-text-primary text-sm tracking-tight">
                       <div className="flex items-center gap-2">
                          <BedDouble className="w-4 h-4 text-blue-400/50" />
                          {order.table?.name || '—'}
                       </div>
                    </td>
                    <td className="py-4 px-6 font-bold text-text-secondary text-sm">
                       <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-blue-400/50" />
                          {order.customer?.name || 'Walk-In'}
                       </div>
                    </td>
                    <td className="py-4 px-6 font-black text-text-primary tracking-tight">
                       {formatCurrency(order.total)}
                    </td>
                    <td className="py-4 px-6">
                       {getStatusBadge(order.status)}
                    </td>
                    <td className="py-4 px-6 text-right">
                       <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-blue-500/10 hover:text-blue-400" onClick={() => navigate(`/admin/orders`)}>
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                       </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

const PlusIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
);
