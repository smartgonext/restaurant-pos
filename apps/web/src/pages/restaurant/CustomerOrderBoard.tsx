
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Utensils, CheckCircle2, Clock, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSocket } from '@/hooks/useSocket';


export default function CustomerOrderBoard() {
  const { socket } = useSocket();
  const { data: ordersRes, refetch } = useQuery({
    queryKey: ['order-board'],
    queryFn: () => api.get('/restaurant/orders?status=preparing,ready,served').then(r => r.data.data),
    refetchInterval: 15000 // poll less frequently, rely on socket for real-time
  });

  const [orders, setOrders] = useState<any[]>(ordersRes || []);
  const preparing = orders.filter((o: any) => o.status === 'preparing' || o.status === 'accepted');
  const ready = orders.filter((o: any) => o.status === 'ready' || o.status === 'served').slice(0, 10);

  const [announcement, setAnnouncement] = useState<string | null>(null);

  // Listen for real-time order updates
  useEffect(() => {
    if (!socket) return;
    const handleOrderEvent = (order: any) => {
      // Refetch all orders (or update state if you want to optimize)
      refetch();
    };
    socket.on('new_order', handleOrderEvent);
    socket.on('order_updated', handleOrderEvent);
    return () => {
      socket.off('new_order', handleOrderEvent);
      socket.off('order_updated', handleOrderEvent);
    };
  }, [socket, refetch]);

  // Keep local orders state in sync with query
  useEffect(() => {
    setOrders(ordersRes || []);
  }, [ordersRes]);

  useEffect(() => {
    // Basic logic to detect new "Ready" orders and trigger an announcement
    if (ready.length > 0) {
      const latestReady = ready[0];
      setAnnouncement(`Order ${latestReady.orderNumber.split('-').pop()} is ready!`);
      // Clear announcement after 5 seconds
      const timer = setTimeout(() => setAnnouncement(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [ready.length]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col font-sans">
      {/* Header */}
      <div className="h-28 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 lg:px-12">
        <div className="flex items-center gap-5">
           <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-900/20">
              <Utensils size={28} />
           </div>
           <h1 className="text-4xl font-bold tracking-tight">Order Status</h1>
        </div>
        <div className="flex flex-col items-end">
           <p className="text-blue-400 text-sm font-semibold uppercase tracking-wider mb-1">Current Time</p>
           <p className="text-3xl font-bold">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      </div>

      <div className="flex-1 bg-slate-950 flex justify-center">
        <div className="w-full max-w-screen-2xl p-6 lg:p-10">
          <div className="grid grid-cols-2 gap-6 lg:gap-10 h-[calc(100vh-176px)] overflow-hidden">
        {/* Preparing Section */}
        <div className="flex flex-col bg-slate-900/50 rounded-3xl p-6 lg:p-8 border border-slate-800 h-full">
          <div className="flex items-center gap-4 mb-8">
             <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center border border-amber-500/20">
                <Clock size={24} />
             </div>
             <h2 className="text-3xl font-bold text-amber-500">Preparing</h2>
          </div>
          <div className="grid grid-cols-3 gap-4 overflow-y-auto pr-2 custom-scrollbar content-start h-full">
            {preparing.map((o: any) => (
              <div key={o.id} className="bg-slate-800 border border-slate-700 rounded-2xl flex flex-col items-center justify-center py-6 px-2 text-slate-300">
                <span className="text-3xl font-bold mb-2">{o.orderNumber.split('-').pop()}</span>
                <div className="flex flex-wrap gap-2 justify-center items-center">
                  {o.kots?.flatMap((kot: any) => kot.items)?.map((item: any, idx: number) => (
                    <div key={idx} className="flex flex-col items-center mx-1">
                      {item.menuItem?.image ? (
                        <img src={item.menuItem.image} alt={item.menuItem.name} className="w-12 h-12 object-cover rounded-lg border border-slate-700 mb-1" />
                      ) : (
                        <div className="w-12 h-12 flex items-center justify-center bg-slate-700 rounded-lg mb-1">
                          <Utensils size={24} />
                        </div>
                      )}
                      <span className="text-xs text-center max-w-[60px] truncate">{item.menuItem?.name || 'Item'}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {preparing.length === 0 && (
              <div className="col-span-full h-40 flex items-center justify-center text-slate-500 text-xl font-medium">
                No orders being prepared
              </div>
            )}
          </div>
        </div>

        {/* Ready Section */}
        <div className="flex flex-col bg-emerald-950/30 rounded-3xl p-6 lg:p-8 border border-emerald-900/50 relative overflow-hidden h-full">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none" />
          
          <div className="flex items-center justify-between mb-8 relative z-10">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                   <CheckCircle2 size={24} />
                </div>
                <h2 className="text-3xl font-bold text-emerald-400">Please Collect</h2>
             </div>
             {announcement && <Volume2 className="text-emerald-500 animate-bounce" size={28} />}
          </div>
          <div className="grid grid-cols-2 gap-6 h-full content-start relative z-10 overflow-y-auto custom-scrollbar pr-2 auto-rows-[minmax(140px,1fr)]">
            {ready.map((o: any) => (
              <div key={o.id} className="bg-emerald-500 text-white rounded-3xl flex flex-col items-center justify-center p-8 shadow-xl shadow-emerald-900/20 transform transition-all">
                <span className="text-emerald-100 font-medium uppercase tracking-wider mb-2 text-sm">Order Number</span>
                <span className="text-7xl font-bold tracking-tight">{o.orderNumber.split('-').pop()}</span>
                <div className="flex flex-wrap gap-2 justify-center items-center mt-4">
                  {o.kots?.flatMap((kot: any) => kot.items)?.map((item: any, idx: number) => (
                    <div key={idx} className="flex flex-col items-center mx-1">
                      {item.menuItem?.image ? (
                        <img src={item.menuItem.image} alt={item.menuItem.name} className="w-12 h-12 object-cover rounded-lg border border-emerald-700 mb-1" />
                      ) : (
                        <div className="w-12 h-12 flex items-center justify-center bg-emerald-700 rounded-lg mb-1">
                          <Utensils size={24} />
                        </div>
                      )}
                      <span className="text-xs text-center max-w-[60px] truncate">{item.menuItem?.name || 'Item'}</span>
                    </div>
                  ))}
                </div>
                {o.table?.name && (
                  <span className="bg-emerald-600 px-4 py-1.5 rounded-full text-sm font-semibold mt-4">
                    Table {o.table.name}
                  </span>
                )}
              </div>
            ))}
            {ready.length === 0 && (
              <div className="col-span-full h-full flex flex-col items-center justify-center text-emerald-700/50">
                <Utensils size={80} className="mb-4" />
                <p className="text-2xl font-semibold">Waiting for ready orders</p>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
      </div>

      {/* Ticker Tape */}
      <div className="h-16 bg-blue-600 flex items-center overflow-hidden border-t border-blue-700 relative">
         <div className="flex whitespace-nowrap animate-marquee text-white">
            <span className="text-lg font-medium mx-12">✨ Enjoy your meal at RestaurantSaaS</span>
            <span className="text-lg font-medium mx-12">🍅 Fresh ingredients prepared daily</span>
            <span className="text-lg font-medium mx-12">🎉 Special weekend offer: 20% OFF on all combos!</span>
            <span className="text-lg font-medium mx-12">⭐ Don't forget to rate us on Google</span>
         </div>
         <div className="flex absolute top-0 h-full items-center whitespace-nowrap animate-marquee2 text-white">
            <span className="text-lg font-medium mx-12">✨ Enjoy your meal at RestaurantSaaS</span>
            <span className="text-lg font-medium mx-12">🍅 Fresh ingredients prepared daily</span>
            <span className="text-lg font-medium mx-12">🎉 Special weekend offer: 20% OFF on all combos!</span>
            <span className="text-lg font-medium mx-12">⭐ Don't forget to rate us on Google</span>
         </div>
      </div>

      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-100%); }
        }
        @keyframes marquee2 {
          0% { transform: translateX(100%); }
          100% { transform: translateX(0%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
        .animate-marquee2 {
          animation: marquee2 30s linear infinite;
        }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(71, 85, 105, 0.5); border-radius: 10px; }
      `}</style>
    </div>
  );
}