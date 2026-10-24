import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import api from '@/lib/api';

interface Order {
  id: number;
  orderNumber: string;
  total: number;
  status: string;
  customer?: { name?: string };
  table?: { name?: string };
}

export default function RoomService() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['hotel-room-service-orders'],
    queryFn: () => api.get('/restaurant/orders', { params: { type: 'room_service' } }).then((r) => r.data),
  });

  const orders: Order[] = data?.data || [];
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return orders.filter((o) => `${o.orderNumber} ${o.customer?.name || ''} ${o.table?.name || ''}`.toLowerCase().includes(q));
  }, [orders, search]);

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-text-primary">Room Service Orders</h1>
        <Button onClick={() => (window.location.href = '/admin/pos')}>Create Order via POS</Button>
      </div>

      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by order number or room number..." className="max-w-[420px]" />

      <div className="rounded-lg border border-warning/30 bg-warning/10 text-warning px-4 py-3 text-sm">
        Note: To create room service orders, use the POS system and select Hotel Room as the context. Orders can be posted to guest folios when completed.
      </div>

      <div className="glass-card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-tertiary/60 text-text-muted">
            <tr>
              <th className="text-left px-4 py-3">Order #</th>
              <th className="text-left px-4 py-3">Room/Stay</th>
              <th className="text-left px-4 py-3">Guest</th>
              <th className="text-left px-4 py-3">Amount</th>
              <th className="text-left px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-muted">
                  Loading orders...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-muted">
                  No room service orders found
                </td>
              </tr>
            ) : (
              filtered.map((order) => (
                <tr key={order.id} className="border-t border-border/50">
                  <td className="px-4 py-3">{order.orderNumber}</td>
                  <td className="px-4 py-3">{order.table?.name || '-'}</td>
                  <td className="px-4 py-3">{order.customer?.name || '-'}</td>
                  <td className="px-4 py-3">${Number(order.total || 0).toFixed(2)}</td>
                  <td className="px-4 py-3">{order.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
