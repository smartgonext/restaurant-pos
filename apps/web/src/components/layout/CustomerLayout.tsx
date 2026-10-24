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
      <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between">
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
      <main className="max-w-screen-xl mx-auto pb-32">
        <Outlet />
      </main>

      {/* Mobile Floating Cart / Actions removed per request */}

      {/* Subtle Background Glows (For Premium feel) */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] pointer-events-none z-0"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] pointer-events-none z-0"></div>
    </div>
  );
}
