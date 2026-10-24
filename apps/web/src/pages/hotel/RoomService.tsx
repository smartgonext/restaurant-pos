import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  Search, UtensilsCrossed, ArrowRight, User, BedDouble,
  Info, ExternalLink,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import api from '@/lib/api';
import { useNavigate } from 'react-router-dom';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RoomServiceOrder {
  id: number;
  orderNumber?: string;
  total?: number;
  amount?: number;
  status: string;
  billTo?: string;
  createdAt: string;
  guest?: { name?: string };
  stay?: { id?: number };
  room?: { roomNumber?: string };
  // fallback from orders table
  customer?: { name?: string };
  table?: { name?: string };
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: any }> = {
    completed: { label: 'Delivered', variant: 'success' },
    delivered: { label: 'Delivered', variant: 'success' },
    cooking: { label: 'In Kitchen', variant: 'info' },
    in_kitchen: { label: 'In Kitchen', variant: 'info' },
    out_for_delivery: { label: 'Out for Delivery', variant: 'info' },
    cancelled: { label: 'Cancelled', variant: 'destructive' },
    pending: { label: 'Pending', variant: 'secondary' },
  };
  const c = map[status] || { label: status, variant: 'secondary' };
  return (
    <Badge variant={c.variant} className="text-[9px] font-black uppercase tracking-widest rounded-lg px-2">
      {c.label}
    </Badge>
  );
}

// ─── Bill To Badge ────────────────────────────────────────────────────────────

function BillToBadge({ billTo }: { billTo?: string }) {
  if (!billTo) return <span className="text-text-muted text-xs">—</span>;
  return (
    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${
      billTo === 'folio' ? 'bg-blue-500/10 text-blue-400' : 'bg-green-500/10 text-green-400'
    }`}>
      {billTo === 'folio' ? 'Post to Folio' : 'Pay Now'}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RoomService() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  // Fetch room service orders — prefer the hotel endpoint, fallback to orders with type filter
  const { data, isLoading } = useQuery({
    queryKey: ['hotel', 'room-service'],
    queryFn: () =>
      api
        .get('/restaurant/orders', { params: { type: 'room_service', limit: 100 } })
        .then((r) => r.data),
    refetchInterval: 30_000,
  });

  const orders: RoomServiceOrder[] = data?.data || [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return orders.filter((o) => {
      const text = [
        o.orderNumber,
        o.guest?.name,
        o.customer?.name,
        o.room?.roomNumber,
        o.table?.name,
        String(o.stay?.id || ''),
      ]
        .join(' ')
        .toLowerCase();
      return text.includes(q);
    });
  }, [orders, search]);

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-card/50 backdrop-blur-md border border-border p-5 rounded-2xl shadow-xl shadow-black/10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <UtensilsCrossed className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-text-primary tracking-tight">Room Service Orders</h1>
            <p className="text-sm text-text-muted mt-1 font-medium italic">
              Monitor in-room dining and folio posting
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              className="bg-bg-dark border border-border rounded-xl pl-10 pr-4 py-2 text-sm text-text-primary focus:ring-2 focus:ring-blue-500/50 outline-none transition-all w-full md:w-64"
              placeholder="Search by order, room or guest..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            onClick={() => navigate('/admin/pos')}
            variant="primary"
            className="shadow-lg shadow-blue-500/30 font-black px-5 text-[10px] uppercase tracking-widest h-10 shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5 mr-2" /> Create Order via POS
          </Button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-500/5 border border-blue-500/10 p-4 rounded-xl flex items-start gap-4">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-1">
            Operational Note
          </p>
          <p className="text-xs text-blue-400/80 font-medium italic">
            To create room service orders, use the integrated POS system and select{' '}
            <strong>"Hotel Room"</strong> as the service context. Orders are automatically posted to
            guest folios upon finalization.
          </p>
        </div>
      </div>

      {/* Table */}
      <Card padding={false} className="overflow-hidden border-border/40 rounded-2xl shadow-xl bg-bg-card/50">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-dark/50 text-[10px] font-black uppercase tracking-[0.15em] text-text-muted">
                <th className="text-left py-4 px-5">Order</th>
                <th className="text-left py-4 px-5">Room / Stay</th>
                <th className="text-left py-4 px-5">Guest</th>
                <th className="text-left py-4 px-5">Amount</th>
                <th className="text-left py-4 px-5">Bill To</th>
                <th className="text-left py-4 px-5">Status</th>
                <th className="text-right py-4 px-5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="p-4">
                      <Skeleton className="h-10 w-full rounded-lg" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center">
                    <div className="w-14 h-14 bg-bg-dark rounded-2xl flex items-center justify-center mx-auto mb-4 border border-border/60">
                      <UtensilsCrossed className="w-7 h-7 text-text-muted/50" />
                    </div>
                    <p className="text-text-muted font-bold italic text-sm">No room service orders found.</p>
                    <p className="text-text-muted text-xs mt-1">
                      Use the POS system to create room service orders.
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((order) => (
                  <tr key={order.id} className="group hover:bg-blue-500/[0.02] transition-colors">
                    {/* Order */}
                    <td className="py-4 px-5">
                      <p className="text-[10px] font-mono font-bold text-text-muted tracking-widest uppercase">
                        {order.orderNumber || `#${order.id}`}
                      </p>
                      <p className="text-[10px] text-text-muted font-medium">
                        {new Date(order.createdAt).toLocaleTimeString()}
                      </p>
                    </td>

                    {/* Room / Stay */}
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-2">
                        <BedDouble className="w-3.5 h-3.5 text-blue-400/50 shrink-0" />
                        <div>
                          <p className="font-black text-text-primary">
                            {order.room?.roomNumber || order.table?.name || '—'}
                          </p>
                          {order.stay?.id && (
                            <p className="text-[9px] text-text-muted font-medium">Stay #{order.stay.id}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Guest */}
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-blue-400/50 shrink-0" />
                        <span className="font-bold text-text-secondary">
                          {order.guest?.name || order.customer?.name || 'Guest'}
                        </span>
                      </div>
                    </td>

                    {/* Amount */}
                    <td className="py-4 px-5 font-black text-text-primary">
                      {formatCurrency(Number(order.total ?? order.amount ?? 0))}
                    </td>

                    {/* Bill To */}
                    <td className="py-4 px-5">
                      <BillToBadge billTo={order.billTo} />
                    </td>

                    {/* Status */}
                    <td className="py-4 px-5">
                      <StatusBadge status={order.status} />
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-5 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 hover:bg-blue-500/10 hover:text-blue-400"
                          onClick={() => navigate('/admin/orders')}
                          title="View in Orders"
                        >
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