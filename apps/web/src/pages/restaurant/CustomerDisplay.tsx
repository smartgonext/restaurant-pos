import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Utensils, ShoppingCart, ShoppingBag, CreditCard } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useState, useEffect } from 'react';

export default function CustomerDisplay() {
  const [cart, setCart] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<'idle' | 'scanning' | 'paying' | 'success'>('idle');

  // In a real app, you would use a WebSocket or postMessage (if in an iframe)
  // To listen for real-time cart updates from the POS.
  // For now, we'll use a polling logic for demo purposes based on recent orders.
  
  const { data: latestOrder } = useQuery({
    queryKey: ['latest-pos-order'],
    queryFn: () => api.get('/restaurant/orders?limit=1').then(r => r.data.data[0]),
    refetchInterval: 1000
  });

  useEffect(() => {
     if (latestOrder) {
        // Mocking the cart display logic
        // This is where real POS data would be shown
     }
  }, [latestOrder]);

  return (
    <div className="fixed inset-0 bg-[#0d1117] text-white flex flex-col font-sans selection:bg-blue-500">
      <div className="flex h-full">
        {/* Left: Cart & Totals */}
        <div className="flex-1 flex flex-col p-10 bg-gradient-to-br from-[#161b22] to-[#0d1117]">
            <div className="flex items-center gap-4 mb-10">
               <div className="w-12 h-12 rounded-xl bg-blue-600/20 text-blue-500 flex items-center justify-center">
                  <ShoppingBag size={30} />
               </div>
               <h1 className="text-4xl font-black uppercase">Your Order</h1>
            </div>

            <div className="flex-1 overflow-y-auto space-y-6 pr-4 custom-scrollbar">
               {cart.length > 0 ? cart.map((item, i) => (
                 <div key={i} className="flex items-center justify-between border-b border-white/5 pb-6 animate-in hover:bg-white/5 p-4 rounded-2xl transition-all">
                    <div className="flex gap-4">
                       <span className="text-3xl font-black text-blue-500 italic">x{item.quantity}</span>
                       <div>
                          <p className="text-2xl font-bold">{item.name}</p>
                          <p className="text-sm text-white/40 uppercase font-black tracking-widest">{item.category}</p>
                       </div>
                    </div>
                    <span className="text-2xl font-black">{formatCurrency(item.price * item.quantity)}</span>
                 </div>
               )) : (
                 <div className="h-full flex flex-col items-center justify-center opacity-20 text-center">
                    <Utensils size={100} className="mb-8" />
                    <p className="text-4xl font-black">Welcome!</p>
                    <p className="text-xl font-medium mt-4">Preparing your selections...</p>
                 </div>
               )}
            </div>

            <div className="mt-10 pt-10 border-t-2 border-dashed border-white/10">
               <div className="flex justify-between items-end mb-4 opacity-60">
                  <span className="text-xl font-bold uppercase tracking-widest">Subtotal</span>
                  <span className="text-2xl font-black">{formatCurrency(total * 0.9)}</span>
               </div>
               <div className="flex justify-between items-end mb-6 opacity-60">
                  <span className="text-xl font-bold uppercase tracking-widest">Tax (10%)</span>
                  <span className="text-2xl font-black">{formatCurrency(total * 0.1)}</span>
               </div>
               <div className="flex justify-between items-end">
                  <span className="text-4xl font-black uppercase tracking-tighter text-blue-500 italic">Total Payable</span>
                  <span className="text-7xl font-black tracking-tighter">{formatCurrency(total)}</span>
               </div>
            </div>
        </div>

        {/* Right: Branding & Promos */}
        <div className="w-[450px] bg-[#0a0f1e] border-l border-white/5 flex flex-col p-10 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-20 opacity-5 pointer-events-none">
               <Utensils size={300} />
            </div>

            <div className="relative z-10 flex-1 flex flex-col">
               <div className="mb-12">
                  <h2 className="text-blue-500 font-black text-xl uppercase tracking-widest mb-2">Today's Special</h2>
                  <Card className="p-0 border-none bg-transparent h-[500px] overflow-hidden group shadow-2xl">
                     <div className="h-full bg-gradient-to-t from-black/80 to-transparent relative flex flex-col justify-end p-8">
                        <img 
                          src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&q=80" 
                          className="absolute inset-0 w-full h-full object-cover -z-10 group-hover:scale-110 transition-all duration-700" 
                        />
                        <h3 className="text-3xl font-black uppercase mb-2">Seafood Medley</h3>
                        <p className="text-sm text-white/70 mb-6">Fresh lobster, prawns, and scallops grilled to perfection.</p>
                        <div className="flex items-center gap-3">
                           <Badge variant="info" className="px-4 py-1 text-lg font-black">$24.99</Badge>
                           <Badge variant="outline" className="text-white border-white/20">Chef Recommended</Badge>
                        </div>
                     </div>
                  </Card>
               </div>

               <div className="mt-auto p-10 bg-blue-600 rounded-[40px] shadow-glow flex flex-col items-center text-center">
                  <CreditCard size={60} className="mb-6" />
                  <h3 className="text-3xl font-black uppercase mb-2">Join Loyalty</h3>
                  <p className="text-sm font-medium opacity-80 leading-relaxed max-w-xs">Earn points on every purchase and unlock exclusive rewards.</p>
                  <div className="mt-8 px-6 py-3 bg-white text-blue-600 rounded-full font-black uppercase text-sm tracking-widest">Scan to Join</div>
               </div>
            </div>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
      `}</style>
    </div>
  );
}
