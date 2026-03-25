import { Outlet, useParams } from 'react-router-dom';
import { 
  ShoppingBag, 
  User, 
  HelpCircle,
  Bell,
  UtensilsCrossed
} from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';

export function CustomerLayout() {
  const { restaurantSlug } = useParams<{ restaurantSlug: string }>();
  const cartItems = useCartStore((state) => state.items);
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary font-sans selection:bg-primary/30">
      {/* Mobile Top Header (Sticky) */}
      <header className="sticky top-0 z-50 bg-bg-primary/80 backdrop-blur-xl border-b border-border transition-all">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
           <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white">
                 <UtensilsCrossed size={18} />
              </div>
              <span className="font-bold text-lg tracking-tight capitalize">{restaurantSlug?.replace(/-/g, ' ')}</span>
           </div>
           <div className="flex items-center gap-3">
              <button className="p-2 rounded-full hover:bg-bg-secondary transition-colors relative">
                 <Bell size={20} className="text-text-secondary" />
                 <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full border-2 border-bg-primary"></span>
              </button>
              <button className="w-8 h-8 rounded-full bg-bg-tertiary flex items-center justify-center border border-border">
                 <User size={16} className="text-text-muted" />
              </button>
           </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-md mx-auto pb-32">
        <Outlet />
      </main>

      {/* Mobile Floating Cart / Actions (Bottom) */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 p-4 pointer-events-none">
         <div className="max-w-md mx-auto flex items-center justify-center gap-4 pointer-events-auto">
            {/* Call Waiter Floating Button */}
            <button 
               className="w-14 h-14 rounded-2xl bg-bg-secondary border border-border shadow-xl flex flex-col items-center justify-center text-text-muted hover:text-primary transition-all active:scale-95 group"
               onClick={() => alert('Waiter has been called to your table!')}
            >
               <HelpCircle size={20} className="group-hover:animate-bounce" />
               <span className="text-[10px] font-bold uppercase mt-1">Help</span>
            </button>

            {/* Main Cart Button */}
            <div className="flex-1 max-w-[240px]">
               <a 
                 href={`/menu/${restaurantSlug}/table-123/cart`}
                 className={`flex items-center justify-between gap-3 h-14 rounded-2xl px-6 shadow-2xl transition-all active:scale-[0.98] ${
                   itemCount > 0 
                   ? 'bg-primary text-white shadow-primary/30' 
                   : 'bg-bg-tertiary text-text-muted cursor-not-allowed opacity-80'
                 }`}
               >
                  <div className="flex items-center gap-3">
                    <ShoppingBag size={20} />
                    <span className="font-bold">View Cart</span>
                  </div>
                  {itemCount > 0 && (
                    <div className="bg-white/20 px-2 py-0.5 rounded-lg text-xs font-black">
                       {itemCount}
                    </div>
                  )}
               </a>
            </div>
         </div>
      </nav>

      {/* Subtle Background Glows (For Premium feel) */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] pointer-events-none z-0"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] pointer-events-none z-0"></div>
    </div>
  );
}
