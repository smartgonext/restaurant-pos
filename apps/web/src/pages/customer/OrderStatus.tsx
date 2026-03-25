import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { ArrowLeft, CheckCircle, Clock, ChefHat, Bike, UtensilsCrossed } from 'lucide-react';
import { io } from 'socket.io-client';

const STATUS_STEPS = [
  { key: 'placed', label: 'Order Placed', icon: CheckCircle, color: 'text-blue-500' },
  { key: 'confirmed', label: 'Order Confirmed', icon: CheckCircle, color: 'text-indigo-500' },
  { key: 'preparing', label: 'Being Prepared', icon: ChefHat, color: 'text-amber-500' },
  { key: 'served', label: 'Served', icon: UtensilsCrossed, color: 'text-purple-500' },
  { key: 'paid', label: 'Completed', icon: CheckCircle, color: 'text-green-500' },
];

const STATUS_INDEX: Record<string, number> = {
  placed: 0, confirmed: 1, preparing: 2, served: 3, paid: 4,
};

export default function OrderStatus() {
  const { restaurantSlug, tableToken } = useParams<{ restaurantSlug: string; tableToken: string }>();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await api.get(`/customer/${restaurantSlug}/${tableToken}/status`);
      if (res.data.success) setOrders(res.data.data);
    } catch {/* noop */} finally { setLoading(false); }
  };

  useEffect(() => {
    fetchStatus();

    // Socket for live updates
    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001');
    socket.emit('join_table', tableToken);
    socket.on('order_updated', fetchStatus);

    return () => { socket.disconnect(); };
  }, [tableToken]);

  if (loading) return <div className="flex-1 flex items-center justify-center">Loading...</div>;

  return (
    <div className="flex flex-col flex-1">
      <header className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 p-4 flex items-center gap-3 z-10">
        <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold">Order Status</h1>
      </header>

      <div className="p-4 space-y-4">
        {orders.length === 0 ? (
          <div className="text-center text-gray-400 py-16">
            <Clock size={40} className="mx-auto mb-3 opacity-50" />
            <p>No active orders for this table</p>
            <button onClick={() => navigate(-1)} className="mt-4 px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold">Browse Menu</button>
          </div>
        ) : orders.map(order => {
          const currentIdx = STATUS_INDEX[order.status] ?? 0;
          const totalItems = order.kots?.reduce((sum: number, k: any) => sum + k.items?.reduce((s: number, i: any) => s + i.quantity, 0), 0) || 0;

          return (
            <div key={order.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-gray-900 dark:text-white">Order #{order.orderNumber}</h3>
                  <span className="text-sm text-gray-500">{totalItems} items</span>
                </div>
              </div>
              
              {/* Status Steps */}
              <div className="p-4">
                {STATUS_STEPS.map((step, idx) => {
                  const done = idx <= currentIdx;
                  const active = idx === currentIdx;
                  const Icon = step.icon;
                  return (
                    <div key={step.key} className="flex items-start gap-3 mb-4 last:mb-0">
                      <div className={`flex-none w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all
                        ${done ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800'}`}>
                        {done ? (
                          <Icon size={16} className={active ? step.color : 'text-blue-500'} />
                        ) : (
                          <div className="w-2.5 h-2.5 rounded-full bg-gray-200 dark:bg-gray-600" />
                        )}
                      </div>
                      <div className="flex-1 pt-1">
                        <p className={`text-sm font-medium ${done ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
                          {step.label}
                        </p>
                        {active && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        )}
                      </div>
                      {done && idx < currentIdx && <CheckCircle size={16} className="text-green-500 mt-1 flex-none" />}
                    </div>
                  );
                })}
              </div>

              {/* Items list */}
              {order.kots && order.kots.length > 0 && (
                <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Items</h4>
                  <div className="space-y-1.5">
                    {order.kots.flatMap((k: any) => k.items || []).map((item: any, i: number) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-gray-700 dark:text-gray-300">{item.menuItem?.name || 'Item'}</span>
                        <span className="text-gray-500">×{item.quantity}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between font-bold text-sm mt-3 pt-2 border-t border-dashed border-gray-200 dark:border-gray-700">
                    <span>Total</span>
                    <span>${Number(order.total).toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
