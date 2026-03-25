import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Utensils, CheckCircle2, Clock, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function CustomerOrderBoard() {
  const { data: ordersRes } = useQuery({
    queryKey: ['order-board'],
    queryFn: () => api.get('/restaurant/orders?status=preparing,ready,served').then(r => r.data.data),
    refetchInterval: 5000
  });

  const orders = ordersRes || [];
  const preparing = orders.filter((o: any) => o.status === 'preparing' || o.status === 'accepted');
  const ready = orders.filter((o: any) => o.status === 'ready' || o.status === 'served').slice(0, 10);

  const [announcement, setAnnouncement] = useState<string | null>(null);

  useEffect(() => {
    // Basic logic to detect new "Ready" orders and trigger an announcement
    const readyOrders = ready.map((o: any) => o.orderNumber);
    // In a real app, you'd compare with previous state to find new ready orders
  }, [ready]);

  return (
    <div className="fixed inset-0 bg-[#020617] text-white flex flex-col font-sans">
      {/* Header */}
      <div className="h-32 bg-[#0a0f1e] border-b border-white/5 flex items-center justify-between px-16">
        <div className="flex items-center gap-6">
           <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center">
              <Utensils size={40} />
           </div>
           <h1 className="text-5xl font-black uppercase tracking-tighter">Order Status</h1>
        </div>
        <div className="text-right">
           <p className="text-blue-400 text-xl font-bold uppercase tracking-widest">Now Serving</p>
           <p className="text-4xl font-black">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-2 p-10 gap-10 overflow-hidden">
        {/* Preparing Section */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-4 mb-4">
             <div className="w-12 h-12 rounded-xl bg-orange-500/20 text-orange-500 flex items-center justify-center">
                <Clock size={28} />
             </div>
             <h2 className="text-4xl font-black uppercase italic text-orange-400">Preparing</h2>
          </div>
          <div className="grid grid-cols-3 gap-6 overflow-y-auto pr-4">
             {preparing.map((o: any) => (
               <div key={o.id} className="aspect-video bg-white/5 border border-white/10 rounded-3xl flex items-center justify-center text-5xl font-black text-white/50 animate-pulse">
                  {o.orderNumber.split('-').pop()}
               </div>
             ))}
             {preparing.length === 0 && (
               <p className="col-span-full text-2xl text-white/20 font-medium italic">No active orders...</p>
             )}
          </div>
        </div>

        {/* Ready Section */}
        <div className="flex flex-col gap-6 bg-green-500/5 rounded-[48px] p-10 border border-green-500/20 shadow-[0_0_100px_-20px_rgba(16,185,129,0.1)]">
          <div className="flex items-center justify-between mb-8">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-green-500/20 text-green-500 flex items-center justify-center">
                   <CheckCircle2 size={28} />
                </div>
                <h2 className="text-4xl font-black uppercase italic text-green-400">Ready</h2>
             </div>
             <Volume2 className="text-green-500 animate-bounce" size={32} />
          </div>
          <div className="grid grid-cols-2 gap-8 h-full">
             {ready.map((o: any) => (
               <div key={o.id} className="bg-green-500 text-white rounded-[40px] flex flex-col items-center justify-center p-8 shadow-2xl shadow-green-500/20 transform hover:scale-105 transition-transform duration-500">
                  <span className="text-xl font-bold uppercase tracking-widest opacity-80 mb-2">Order</span>
                  <span className="text-8xl font-black tracking-tighter leading-none">{o.orderNumber.split('-').pop()}</span>
                  <span className="text-lg font-bold mt-4 uppercase tracking-wider">{o.table?.name || 'Pick up'}</span>
               </div>
             ))}
             {ready.length === 0 && (
               <div className="col-span-full h-full flex flex-col items-center justify-center opacity-10">
                  <Utensils size={120} />
                  <p className="text-3xl font-bold mt-8">Waiting for excellence...</p>
               </div>
             )}
          </div>
        </div>
      </div>

      {/* Ticker Tape */}
      <div className="h-20 bg-blue-600 flex items-center overflow-hidden">
         <div className="flex whitespace-nowrap animate-marquee">
            <span className="text-2xl font-black uppercase italic mx-20">Enjoy your meal at RestaurantSaaS</span>
            <span className="text-2xl font-black uppercase italic mx-20">Fresh ingredients daily</span>
            <span className="text-2xl font-black uppercase italic mx-20">Special weekend offer: 20% OFF on all combos!</span>
            <span className="text-2xl font-black uppercase italic mx-20">Don't forget to rate us on Google</span>
         </div>
         <div className="flex absolute top-0 whitespace-nowrap animate-marquee2">
            <span className="text-2xl font-black uppercase italic mx-20">Enjoy your meal at RestaurantSaaS</span>
            <span className="text-2xl font-black uppercase italic mx-20">Fresh ingredients daily</span>
            <span className="text-2xl font-black uppercase italic mx-20">Special weekend offer: 20% OFF on all combos!</span>
            <span className="text-2xl font-black uppercase italic mx-20">Don't forget to rate us on Google</span>
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
      `}</style>
    </div>
  );
}
