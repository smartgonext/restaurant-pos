import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { ArrowLeft, CheckCircle2, Clock, ChefHat, UtensilsCrossed } from 'lucide-react';
import { io } from 'socket.io-client';
import { SOCKET_BASE_URL } from '@/lib/config';

const STATUS_STEPS = [
  { key: 'placed', label: 'Order Placed', desc: 'We received your order', icon: CheckCircle2, color: 'text-blue-500', bg: 'bg-blue-100' },
  { key: 'confirmed', label: 'Confirmed', desc: 'Kitchen has accepted', icon: CheckCircle2, color: 'text-indigo-500', bg: 'bg-indigo-100' },
  { key: 'preparing', label: 'Preparing', desc: 'Cooking in progress', icon: ChefHat, color: 'text-amber-500', bg: 'bg-amber-100' },
  { key: 'served', label: 'Ready / Served', desc: 'Enjoy your meal', icon: UtensilsCrossed, color: 'text-emerald-500', bg: 'bg-emerald-100' },
];

const STATUS_INDEX: Record<string, number> = { placed: 0, confirmed: 1, preparing: 2, served: 3, paid: 3 };

export default function OrderStatus() {
  const { restaurantSlug, tableToken } = useParams<{ restaurantSlug: string; tableToken: string }>();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await api.get(`/customer/${restaurantSlug}/${tableToken}/status`);
      if (res.data.success) {
         setOrders(res.data.data);
      }
    } catch {
       // Ignore error for status polling
    } finally { 
       setLoading(false); 
    }
  };

  useEffect(() => {
    fetchStatus();
    const socket = io(SOCKET_BASE_URL);
    socket.emit('join_table', tableToken);
    socket.on('order_updated', fetchStatus);
    return () => { socket.disconnect(); };
  }, [tableToken]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 font-medium">Loading Status...</div>;

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <header className="sticky top-0 bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-4 z-10">
        <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-600 active:scale-95">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Track Order</h1>
      </header>

      <div className="p-4 space-y-6 pb-12">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center text-center text-slate-400 py-20 px-8">
            <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-6">
               <Clock size={40} className="text-slate-300" />
            </div>
            <p className="text-lg font-medium mb-6">No active orders right now.</p>
            <button onClick={() => navigate(-1)} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-md">Go to Menu</button>
          </div>
        ) : orders.map(order => {
          const currentIdx = STATUS_INDEX[order.status] ?? 0;
          const totalItems = order.kots?.reduce((sum: number, k: any) => sum + k.items?.reduce((s: number, i: any) => s + i.quantity, 0), 0) || 0;

          return (
            <div key={order.id} className="bg-white rounded-[2rem] border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                 <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Order Number</h3>
                    <p className="text-2xl font-black text-slate-900">#{order.orderNumber.split('-').pop()}</p>
                 </div>
                 <div className="text-right">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Items</p>
                    <p className="text-xl font-bold text-slate-900">{totalItems}</p>
                 </div>
              </div>
              
              <div className="p-8">
                {STATUS_STEPS.map((step, idx) => {
                  const done = idx < currentIdx;
                  const active = idx === currentIdx;
                  const Icon = step.icon;
                  
                  return (
                    <div key={step.key} className="flex gap-4 relative mb-8 last:mb-0">
                      {/* Vertical Line */}
                      {idx !== STATUS_STEPS.length - 1 && (
                        <div className={`absolute left-6 top-10 w-0.5 h-12 -ml-[1px] ${done ? 'bg-blue-500' : 'bg-slate-100'}`} />
                      )}
                      
                      <div className="relative z-10 flex-shrink-0">
                         <div className={`w-12 h-12 rounded-full flex items-center justify-center border-4 border-white shadow-sm transition-colors duration-300
                            ${done || active ? step.bg : 'bg-slate-50 text-slate-300'}`}>
                            <Icon size={20} className={done || active ? step.color : 'text-slate-300'} />
                         </div>
                      </div>

                      <div className="flex-1 pt-2">
                        <p className={`font-bold text-lg leading-tight mb-1 ${done || active ? 'text-slate-900' : 'text-slate-400'}`}>
                          {step.label}
                        </p>
                        <p className={`text-sm ${active ? 'text-slate-600' : 'text-slate-400'}`}>
                          {step.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Items List Breakdown */}
              {order.kots && order.kots.length > 0 && (
                <div className="px-6 pb-6 pt-4 bg-slate-50/50 border-t border-slate-100">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Order Details</h4>
                  <div className="space-y-2">
                    {order.kots.flatMap((k: any) => k.items || []).map((item: any, i: number) => (
                      <div key={i} className="flex justify-between text-sm font-medium">
                        <span className="text-slate-700">{item.menuItem?.name || 'Item'}</span>
                        <span className="text-slate-400">×{item.quantity}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between font-bold text-base mt-4 pt-3 border-t border-slate-200 text-slate-900">
                    <span>Total Paid/Payable</span>
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