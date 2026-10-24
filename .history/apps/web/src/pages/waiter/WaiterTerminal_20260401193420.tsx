import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { 
  Search, 
  Plus, 
  Minus, 
  Send, 
  QrCode, 
  LogOut, 
  Info, 
  ChevronRight, 
  Trash2, 
  ShoppingBag,
  ArrowLeft,
  Loader2,
  Clock,
  User,
  Coffee
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Navigate, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';

interface MenuItem { 
  id: number; 
  name: string; 
  price: number; 
  categoryId: number | null; 
  image: string | null;
  category?: { name: string };
}
interface Category { id: number; name: string; }
interface CartItem extends MenuItem { quantity: number; }

export default function WaiterTerminal() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();
  
  const [tokenLookup, setTokenLookup] = useState('');
  const [activeToken, setActiveToken] = useState<any>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  // Redirect if not authorized
  if (!user || !['waiter', 'admin', 'branch_head', 'chef', 'staff'].includes(user.role)) {
    return <Navigate to="/login" replace />;
  }

  // Fetch Categories
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['waiter-cats'],
    queryFn: async () => {
      const { data } = await api.get('/subpos/categories');
      return data.data;
    },
  });

  // Fetch Menu Items
  const { data: items = [] } = useQuery<MenuItem[]>({
    queryKey: ['waiter-items'],
    queryFn: async () => {
      const { data } = await api.get('/subpos/items');
      return data.data;
    },
  });

  // Token Lookup Mutation
  const lookupMutation = useMutation({
    mutationFn: async (val: string) => {
      const payload = /^\d+$/.test(val) ? { tokenNumber: Number(val) } : { qrCode: val };
      const { data } = await api.post('/subpos/token/lookup', payload);
      return data.data;
    },
    onSuccess: (data) => {
      if (data.status === 'paid') {
        toast.error("This token is already fully paid.");
        return;
      }
      setActiveToken(data);
      setTokenLookup('');
      toast.success(`Token #${data.tokenNumber} loaded`, { icon: '🎫' });
    },
    onError: () => {
      toast.error('Token not found. Please scan again.');
    }
  });

  // Push KOT Mutation
  const pushKOT = useMutation({
    mutationFn: async () => {
      // Loop through cart and add items one by one (as per existing API structure)
      // Note: Ideally the backend should support a bulk addition endpoint
      const reqs = cart.map(i => api.post(`/subpos/token/${activeToken.qrCode}/items`, {
        menuItemId: i.id,
        quantity: i.quantity
      }));
      await Promise.all(reqs);
    },
    onSuccess: () => {
      setCart([]);
      setActiveToken(null);
      setIsMobileCartOpen(false);
      qc.invalidateQueries({ queryKey: ['waiter-items'] }); // Refresh if needed
      toast.success('SENT TO KITCHEN! 🚀', { 
        duration: 4000,
        style: { background: '#10b981', color: '#fff', fontWeight: 'bold' } 
      });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to send KOT');
    }
  });

  // Filtering Logic
  const filteredItems = useMemo(() => {
    return items.filter(i => 
      (selectedCat === null || i.categoryId === selectedCat) &&
      (!searchQuery || i.name.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [items, selectedCat, searchQuery]);

  // Cart Helpers
  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(p => p.id === item.id);
      if (existing) {
        return prev.map(p => p.id === item.id ? { ...p, quantity: p.quantity + 1 } : p);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
    toast.success(`${item.name} added`, { duration: 800, position: 'bottom-center' });
  };

  const updateQty = (id: number, delta: number) => {
    setCart(prev => prev.map(p => {
      if (p.id === id) {
        const newQty = Math.max(1, p.quantity + delta);
        return { ...p, quantity: newQty };
      }
      return p;
    }));
  };

  const removeFromCart = (id: number) => {
    setCart(prev => prev.filter(p => p.id !== id));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  // Auto-focus on token input when no active token
  useEffect(() => {
    if (!activeToken) {
      const input = document.getElementById('token-input');
      input?.focus();
    }
  }, [activeToken]);

  return (
    <div className="fixed inset-0 bg-[#060813] text-white flex flex-col overflow-hidden font-sans select-none">
      {/* --- HEADER --- */}
      <header className="h-16 px-4 flex items-center justify-between bg-[#0d101f]/80 backdrop-blur-md border-b border-white/5 z-40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center shadow-glow-sm">
            <Coffee size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-black uppercase tracking-widest text-indigo-400 leading-tight">TableTrack</h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Waiter Terminal • {user.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeToken && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-black uppercase text-emerald-400">Serving #{activeToken.tokenNumber}</span>
            </div>
          )}
          <button 
            onClick={() => { logout(); navigate('/login'); }}
            className="p-2.5 text-slate-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 rounded-xl"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* --- MAIN CONTENT --- */}
      <main className="flex-1 flex overflow-hidden relative">
        {!activeToken ? (
          /* --- LOOKUP VIEW --- */
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#060813] relative overflow-hidden">
             {/* Background Orbs */}
            <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-indigo-600/10 rounded-full blur-[100px]" />
            <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-violet-600/10 rounded-full blur-[100px]" />
            
            <div className="w-full max-w-md text-center z-10">
              <div className="w-24 h-24 rounded-[32px] bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-8 shadow-glow-sm">
                <QrCode size={48} className="text-indigo-400" />
              </div>
              
              <h2 className="text-3xl font-black text-white mb-3 uppercase italic tracking-tighter">Enter <span className="text-indigo-500">Token</span> QR</h2>
              <p className="text-slate-400 font-medium mb-10">Scan the customer's slips or enter the token number manually to start an order.</p>
              
              <div className="relative group">
                <input 
                  id="token-input"
                  type="text" 
                  value={tokenLookup}
                  onChange={(e) => setTokenLookup(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && lookupMutation.mutate(tokenLookup)}
                  placeholder="Scan QR or Enter Number..."
                  className="w-full px-6 py-5 bg-[#0d101f] border border-white/10 rounded-3xl text-xl font-bold text-center tracking-widest placeholder:text-slate-700 placeholder:tracking-normal outline-none focus:border-indigo-500/40 focus:ring-4 focus:ring-indigo-500/10 transition-all shadow-2xl"
                />
                <button 
                  onClick={() => lookupMutation.mutate(tokenLookup)}
                  disabled={!tokenLookup || lookupMutation.isPending}
                  className="absolute right-3 top-3 bottom-3 px-6 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-black rounded-2xl transition transition-all active:scale-95 shadow-lg group-hover:shadow-glow-sm"
                >
                  {lookupMutation.isPending ? <Loader2 className="animate-spin" /> : 'OPEN'}
                </button>
              </div>

              <div className="mt-12 flex items-center justify-center gap-6 opacity-30">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full border border-dashed border-white/40 flex items-center justify-center"><Search size={18} /></div>
                  <span className="text-[10px] font-bold uppercase tracking-widest">Find</span>
                </div>
                <ChevronRight size={16} className="text-white/20" />
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full border border-dashed border-white/40 flex items-center justify-center"><Plus size={18} /></div>
                  <span className="text-[10px] font-bold uppercase tracking-widest">Select</span>
                </div>
                <ChevronRight size={16} className="text-white/20" />
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full border border-dashed border-white/40 flex items-center justify-center"><Send size={18} /></div>
                  <span className="text-[10px] font-bold uppercase tracking-widest">Serve</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* --- ORDER VIEW --- */
          <div className="flex-1 flex overflow-hidden">
            {/* LEFT: Menu Explorer */}
            <div className="flex-1 flex flex-col bg-[#060813] overflow-hidden border-r border-white/5">
              {/* Category Bar */}
              <div className="px-4 py-3 bg-[#0d101f]/50 border-b border-white/5 overflow-x-auto no-scrollbar flex items-center gap-2 flex-shrink-0">
                <button 
                  onClick={() => setSelectedCat(null)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap",
                    selectedCat === null ? "bg-indigo-600 text-white shadow-glow-sm" : "bg-white/5 text-slate-500 hover:text-slate-300"
                  )}
                >
                  All Items
                </button>
                {categories.map(c => (
                  <button 
                    key={c.id}
                    onClick={() => setSelectedCat(c.id)}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap",
                      selectedCat === c.id ? "bg-indigo-600 text-white shadow-glow-sm" : "bg-white/5 text-slate-500 hover:text-slate-300"
                    )}
                  >
                    {c.name}
                  </button>
                ))}
              </div>

              {/* Search bar */}
              <div className="p-4 flex-shrink-0">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search for delicacies..."
                    className="w-full bg-[#0d101f] border border-white/5 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-medium outline-none focus:border-indigo-500/30 transition-all"
                  />
                </div>
              </div>

              {/* Items Grid */}
              <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 content-start pb-20 sm:pb-4">
                {filteredItems.map(item => (
                  <button 
                    key={item.id} 
                    onClick={() => addToCart(item)}
                    className="group relative bg-[#0d101f]/50 border border-white/5 rounded-3xl overflow-hidden hover:border-indigo-500/40 hover:bg-[#0d101f] transition-all duration-300 flex flex-col text-left active:scale-[0.98]"
                  >
                    <div className="aspect-[4/3] w-full relative overflow-hidden bg-slate-800">
                      <img 
                        src={item.image ? (item.image.startsWith('http') ? item.image : `http://localhost:3001${item.image}`) : `https://ui-avatars.com/api/?name=${item.name}&background=1a1c23&color=fff`} 
                        alt={item.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 opacity-80"
                      />
                      <div className="absolute top-2 right-2 px-2 py-1 bg-black/60 backdrop-blur-md rounded-lg border border-white/10 flex items-center gap-1 shadow-2xl">
                         <span className="text-[10px] font-black text-indigo-400">₹</span>
                         <span className="text-xs font-black text-white">{item.price}</span>
                      </div>
                    </div>
                    <div className="p-4 flex-1">
                      <h4 className="text-xs font-bold font-black uppercase text-slate-300 leading-tight mb-1 group-hover:text-white transition-colors">{item.name}</h4>
                      <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">{item.category?.name || 'Delicacy'}</p>
                    </div>
                    {/* Hover add indicator */}
                    <div className="absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/10 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100">
                      <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-glow-sm transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                        <Plus size={20} />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* RIGHT: KOT Panel (Desktop) */}
            <div className="hidden lg:flex w-96 flex-col bg-[#0d101f]/50 backdrop-blur-xl border-l border-white/5 relative">
              <div className="p-6 border-b border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600/20 flex items-center justify-center">
                      <ShoppingBag size={14} className="text-indigo-400" />
                    </div>
                    <h3 className="font-black text-xs uppercase tracking-widest text-indigo-400">Order Summary</h3>
                  </div>
                  <button 
                    onClick={() => { setActiveToken(null); setCart([]); }}
                    className="p-2 text-slate-500 hover:text-rose-400 transition-colors"
                    title="Switch Token"
                  >
                    <ArrowLeft size={16} />
                  </button>
                </div>
                <div className="flex items-center gap-2 text-white">
                  <span className="text-2xl font-black italic">TOKEN #{activeToken.tokenNumber}</span>
                  <div className="px-2 py-0.5 bg-indigo-600/20 border border-indigo-500/30 rounded text-[9px] font-black text-indigo-400 uppercase tracking-tighter">Active</div>
                </div>
                <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 flex items-center gap-1">
                  <User size={10} /> {activeToken.customerName || 'Walk-in Customer'}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-20">
                    <ShoppingBag size={48} className="mb-4" />
                    <p className="text-sm font-bold uppercase tracking-widest">Cart Empty</p>
                    <p className="text-[10px] mt-1 uppercase">Select items from menu</p>
                  </div>
                ) : (
                  cart.map(item => (
                    <div key={item.id} className="flex gap-4 group">
                      <div className="w-12 h-12 rounded-xl bg-slate-800 flex-shrink-0 relative overflow-hidden transition-all group-hover:ring-2 ring-indigo-500/50">
                        <img 
                          src={item.image ? (item.image.startsWith('http') ? item.image : `http://localhost:3001${item.image}`) : `https://ui-avatars.com/api/?name=${item.name}&background=1a1c23&color=fff`} 
                          className="w-full h-full object-cover" 
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <h5 className="text-[11px] font-black uppercase text-slate-100 truncate pr-2">{item.name}</h5>
                          <button onClick={() => removeFromCart(item.id)} className="text-slate-600 hover:text-rose-500 transition-colors">
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 bg-white/5 border border-white/5 rounded-lg px-2 py-1">
                            <button onClick={() => updateQty(item.id, -1)} className="text-slate-400 hover:text-white transition-colors"><Minus size={10} /></button>
                            <span className="text-[11px] font-black w-3 text-center">{item.quantity}</span>
                            <button onClick={() => updateQty(item.id, 1)} className="text-slate-400 hover:text-white transition-colors"><Plus size={10} /></button>
                          </div>
                          <span className="text-[11px] font-black text-indigo-400 tracking-tight">{formatCurrency(item.price * item.quantity)}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-6 bg-[#0d101f] border-t border-white/5 space-y-4">
                <div className="flex justify-between items-center px-1">
                   <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 leading-none">Subtotal Amount</span>
                   <span className="text-xl font-black italic text-white tracking-widest">{formatCurrency(cartTotal)}</span>
                </div>
                
                <button 
                  disabled={cart.length === 0 || pushKOT.isPending}
                  onClick={() => pushKOT.mutate()}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black uppercase tracking-[0.2em] text-xs rounded-2xl transition-all active:scale-[0.98] shadow-glow flex items-center justify-center gap-2"
                >
                  {pushKOT.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : <Send size={16} />}
                  {pushKOT.isPending ? 'Sending...' : 'SEND KOT TO KITCHEN'}
                </button>
              </div>
            </div>

            {/* Mobile View Toggle Button (Fab) */}
            <div className="lg:hidden fixed bottom-6 right-6 flex flex-col items-end gap-4 z-50">
               {cart.length > 0 && !isMobileCartOpen && (
                 <button 
                  onClick={() => setIsMobileCartOpen(true)}
                  className="flex items-center gap-3 px-6 py-4 bg-indigo-600 text-white rounded-full font-black uppercase tracking-widest text-[10px] shadow-glow-sm"
                 >
                    <ShoppingBag size={18} />
                    View Order ({cart.length})
                 </button>
               )}
            </div>

            {/* Mobile Drawer (Manual Overlay since Headless UI not preferred by some standards, but I'll use simple div) */}
            {isMobileCartOpen && (
              <div className="lg:hidden fixed inset-0 z-[60] bg-[#060813] flex flex-col p-6 animate-in slide-in-from-bottom duration-300">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-2xl font-black italic uppercase tracking-tighter">Review Order</h3>
                  <button onClick={() => setIsMobileCartOpen(false)} className="p-2 text-slate-400"><ArrowLeft size={24} /></button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-6">
                   {cart.map(item => (
                    <div key={item.id} className="flex gap-6 items-center">
                      <div className="w-16 h-16 rounded-[20px] bg-slate-800 overflow-hidden ring-2 ring-white/5 flex-shrink-0">
                         <img 
                          src={item.image ? (item.image.startsWith('http') ? item.image : `http://localhost:3001${item.image}`) : `https://ui-avatars.com/api/?name=${item.name}&background=1a1c23&color=fff`} 
                          className="w-full h-full object-cover" 
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                         <h5 className="font-black text-sm uppercase text-white truncate">{item.name}</h5>
                         <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{formatCurrency(item.price)} each</span>
                      </div>
                      <div className="flex items-center gap-4 bg-white/5 rounded-2xl p-2 border border-white/5">
                        <button onClick={() => updateQty(item.id, -1)} className="p-2 text-slate-400"><Minus size={16} /></button>
                        <span className="text-sm font-black w-4 text-center">{item.quantity}</span>
                        <button onClick={() => updateQty(item.id, 1)} className="p-2 text-slate-400"><Plus size={16} /></button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-8 border-t border-white/10 mt-6 space-y-6">
                   <div className="flex justify-between items-center px-2">
                      <span className="text-sm font-black uppercase text-slate-500 tracking-widest">Total Amount</span>
                      <span className="text-4xl font-black italic text-white">{formatCurrency(cartTotal)}</span>
                   </div>
                   <button 
                      disabled={pushKOT.isPending}
                      onClick={() => pushKOT.mutate()}
                      className="w-full py-6 bg-indigo-600 text-white font-black uppercase tracking-[0.2em] rounded-3xl shadow-glow active:scale-95 transition-all text-xs flex items-center justify-center gap-3"
                    >
                      {pushKOT.isPending ? <Loader2 className="animate-spin" /> : <Send size={20} />}
                      {pushKOT.isPending ? 'TRANSMITTING...' : 'SEND TO KITCHEN'}
                    </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* --- FOOTER STATUS --- */}
      <footer className="h-10 px-4 bg-[#0d101f] border-t border-white/5 flex items-center justify-between z-40">
        <div className="flex items-center gap-2">
          <Clock size={12} className="text-slate-600" />
          <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">{new Date().toLocaleTimeString()} • SYSTEM ONLINE</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 grayscale opacity-50">
            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">WIFI</span>
            <div className="flex gap-0.5">
              {[1,2,3].map(i => <div key={i} className="w-1 h-3 bg-emerald-500 rounded-sm" />)}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
