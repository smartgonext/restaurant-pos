import { useState } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ShoppingCart, ArrowLeft, ArrowRight, Utensils, CheckCircle2, Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatCurrency, resolveImageUrl } from '@/lib/utils';
import toast from 'react-hot-toast';
import { SERVER_BASE_URL } from '@/lib/config';

const SERVER_URL = SERVER_BASE_URL;

export default function Kiosk() {
  const [step, setStep] = useState<'order-type' | 'menu' | 'cart' | 'success'>('order-type');
  const [orderType, setOrderType] = useState<'dine_in' | 'pickup'>('dine_in');
  const [cart, setCart] = useState<any[]>([]);
  const { socket } = useSocket();

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/restaurant/item-categories').then(r => r.data.data)
  });

  const { data: items } = useQuery({
    queryKey: ['menu-items'],
    queryFn: () => api.get('/restaurant/menu-items').then(r => r.data.data)
  });

  const addToCart = (item: any) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
    toast.success(`${item.name} added`);
  };


  const total = cart.reduce((acc, curr) => acc + (Number(curr.price) * curr.quantity), 0);

  // Simulate order placement and emit to socket
  const placeOrder = async () => {
    // Here you would call your backend API to place the order
    // For demo, we'll just emit a fake order event
    const fakeOrder = {
      kots: [
        {
          items: cart.map((item: any) => ({
            menuItem: { name: item.name, category: { name: item.category } },
            quantity: item.quantity,
            price: item.price
          }))
        }
      ],
      total,
      status: 'preparing',
      orderNumber: 'ORD-XXXXX',
    };
    if (socket) {
      socket.emit('new_order', fakeOrder);
    }
    setStep('success');
    setCart([]);
  };

  if (step === 'order-type') {
    return (
      <div className="fixed inset-0 bg-bg-base z-50 flex flex-col items-center justify-center p-8">
        <div className="text-center mb-12">
          <Utensils className="w-20 h-20 text-blue-500 mx-auto mb-6" />
          <h1 className="text-5xl font-black text-text-primary mb-4 uppercase tracking-tighter">Welcome</h1>
          <p className="text-xl text-text-muted">How would you like to enjoy your meal today?</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
          <button 
            onClick={() => { setOrderType('dine_in'); setStep('menu'); }}
            className="group aspect-video bg-bg-secondary border-2 border-border rounded-[32px] p-8 flex flex-col items-center justify-center gap-6 hover:border-blue-500 hover:bg-blue-500/5 transition-all shadow-2xl"
          >
            <div className="w-24 h-24 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
              <Utensils className="w-12 h-12" />
            </div>
            <span className="text-3xl font-bold text-text-primary uppercase tracking-tight">Dine In</span>
          </button>
          <button 
            onClick={() => { setOrderType('pickup'); setStep('menu'); }}
            className="group aspect-video bg-bg-secondary border-2 border-border rounded-[32px] p-8 flex flex-col items-center justify-center gap-6 hover:border-blue-500 hover:bg-blue-500/5 transition-all shadow-2xl"
          >
            <div className="w-24 h-24 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
              <ShoppingCart className="w-12 h-12" />
            </div>
            <span className="text-3xl font-bold text-text-primary uppercase tracking-tight">Take Away</span>
          </button>
        </div>
      </div>
    );
  }

  if (step === 'success') {
     return (
        <div className="fixed inset-0 bg-bg-base z-50 flex flex-col items-center justify-center p-8 text-center animate-in">
           <div className="w-32 h-32 rounded-full bg-success/20 flex items-center justify-center text-success mb-8">
              <CheckCircle2 size={80} />
           </div>
           <h1 className="text-6xl font-black text-text-primary mb-4 uppercase">Thank You!</h1>
           <p className="text-2xl text-text-muted mb-12">Your order is being prepared.</p>
           <Button size="lg" className="h-20 px-12 text-2xl rounded-2xl" onClick={() => { setStep('order-type'); setCart([]); }}>
              Back to Home
           </Button>
        </div>
     );
  }

  return (
    <div className="fixed inset-0 bg-bg-base z-50 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="h-24 bg-bg-secondary border-b border-border flex items-center justify-between px-10">
        <button onClick={() => setStep('order-type')} className="p-4 rounded-2xl bg-bg-tertiary text-text-primary">
          <ArrowLeft size={32} />
        </button>
        <span className="text-4xl font-black text-text-primary tracking-tighter uppercase italic">Kiosk Menu</span>
        <div className="flex items-center gap-8">
           <div className="text-right">
              <p className="text-xs text-text-muted uppercase font-bold tracking-widest">Selected Type</p>
              <p className="text-xl font-black text-blue-400 uppercase">{orderType.replace('_', ' ')}</p>
           </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Categories Sidebar */}
        <div className="w-40 bg-bg-secondary border-r border-border overflow-y-auto p-4 space-y-4">
           {categories?.map((cat: any) => (
             <button key={cat.id} className="w-full aspect-square rounded-3xl bg-bg-tertiary border border-border flex flex-col items-center justify-center gap-2 p-2 text-center hover:bg-blue-500/10 hover:border-blue-500 transition-all">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                   <Utensils size={20} />
                </div>
                <span className="text-[10px] font-black uppercase text-text-primary leading-tight">{cat.name}</span>
             </button>
           ))}
        </div>

        {/* Menu Grid */}
        <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 content-start">
           {items?.map((item: any) => (
             <Card key={item.id} className="p-0 overflow-hidden border-2 border-transparent hover:border-blue-500 transition-all rounded-[32px] flex flex-col">
                <div className="aspect-square bg-bg-tertiary relative">
                   {item.image ? (
                     <img src={resolveImageUrl(item.image)} className="w-full h-full object-cover" />
                   ) : (
                     <div className="w-full h-full flex items-center justify-center text-text-muted">
                        <Utensils size={64} />
                     </div>
                   )}
                   <div className="absolute top-4 left-4">
                      {item.isVeg ? (
                        <div className="w-6 h-6 border-2 border-green-500 flex items-center justify-center bg-white rounded">
                           <div className="w-3 h-3 bg-green-500 rounded-full" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 border-2 border-red-500 flex items-center justify-center bg-white rounded">
                           <div className="w-3 h-3 bg-red-500 rounded-full" />
                        </div>
                      )}
                   </div>
                </div>
                <div className="p-6 flex-1 flex flex-col">
                   <h3 className="text-xl font-bold text-text-primary mb-1">{item.name}</h3>
                   <p className="text-xs text-text-muted line-clamp-2 mb-4">{item.description}</p>
                   <div className="mt-auto flex items-center justify-between">
                      <span className="text-2xl font-black text-blue-400">{formatCurrency(item.price)}</span>
                      <Button size="lg" className="rounded-2xl h-14 w-14 p-0 shadow-lg shadow-blue-500/20" onClick={() => addToCart(item)}>
                         <span className="text-4xl leading-none">+</span>
                      </Button>
                   </div>
                </div>
             </Card>
           ))}
        </div>
      </div>

      {/* Footer / Cart Summary */}
      <div className="h-32 bg-bg-secondary border-t border-border px-10 flex items-center justify-between">
         <div className="flex items-center gap-10">
            <div className="flex flex-col">
               <span className="text-xs text-text-muted uppercase font-bold tracking-widest">Total Amount</span>
               <span className="text-5xl font-black text-text-primary leading-none mt-1">{formatCurrency(total)}</span>
            </div>
            <div className="flex -space-x-3 overflow-hidden h-14 items-center">
               {cart.map((item, i) => (
                  <div key={i} className="w-14 h-14 rounded-full border-4 border-bg-secondary bg-blue-500 flex items-center justify-center text-white font-bold text-lg relative z-10 shadow-xl">
                     {item.quantity}
                  </div>
               ))}
            </div>
         </div>
        <Button 
          size="lg" 
          className="h-20 px-16 rounded-[40px] text-3xl font-black uppercase italic shadow-2xl shadow-blue-500/30"
          disabled={cart.length === 0}
          onClick={placeOrder}
        >
          Checkout <ArrowRight className="ml-4 w-10 h-10" />
        </Button>
      </div>
    </div>
  );
}
