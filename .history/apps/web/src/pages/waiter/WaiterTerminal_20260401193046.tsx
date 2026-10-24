import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { 
  Search, Plus, Minus, Send, QrCode, LogOut, ArrowLeft, Loader2, 
  User, Phone, LayoutGrid, CheckCircle2, Trash2, Tag, Coffee, 
  ShoppingBag, Printer, ChevronRight, Hash, Clock
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Navigate, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';

const SERVER_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

interface MenuItem { id: number; name: string; price: number; categoryId: number | null; image: string | null; category?: { name: string }; }
interface Category { id: number; name: string; }
interface CartItem extends MenuItem { quantity: number; note?: string; }
interface Table { id: number; name: string; capacity: number; status: string; orders?: any[]; }
interface TokenItem { id: number; menuItemName: string; price: number; quantity: number; total: number; }

export default function WaiterTerminal() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();
  
  // View states
  const [view, setView] = useState<'tables' | 'order'>('tables');
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  
  // Token states
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [tokenLookupInput, setTokenLookupInput] = useState('');
  const [activeToken, setActiveToken] = useState<any>(null);
  
  // Order states
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // Redirect if not authorized
  if (!user || !['waiter', 'admin', 'branch_head', 'chef', 'staff'].includes(user.role)) {
    return <Navigate to="/login" replace />;
  }

  // ── Queries ─────────────────────────────────────────────────────────────
  const { data: tables = [], isLoading: isLoadingTables } = useQuery<Table[]>({
    queryKey: ['restaurant-tables'],
    queryFn: async () => {
      const { data } = await api.get('/restaurant/tables');
      return data.data;
    },
    refetchInterval: 5000,
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['waiter-cats'],
    queryFn: async () => {
      const { data } = await api.get('/subpos/categories');
      return data.data;
    },
  });

  const { data: items = [] } = useQuery<MenuItem[]>({
    queryKey: ['waiter-items'],
    queryFn: async () => {
      const { data } = await api.get('/subpos/items');
      return data.data;
    },
  });

  // ── Mutations ───────────────────────────────────────────────────────────
  const lookupMutation = useMutation({
    mutationFn: async (val: string) => {
      const payload = /^\d+$/.test(val.trim()) ? { tokenNumber: Number(val.trim()) } : { qrCode: val.trim() };
      const { data } = await api.post('/subpos/token/lookup', payload);
      return data.data;
    },
    onSuccess: (data) => {
      if (data.status === 'paid') {
        toast.error("This token is already fully paid.");
        return;
      }
      setActiveToken(data);
      setCustomerName(data.customerName || '');
      setCustomerPhone(data.customerPhone || '');
      setIsTokenModalOpen(false);
      setTokenLookupInput('');
      setView('order');
      toast.success(`Token #${data.tokenNumber} loaded`, { icon: '🎫' });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Token not found. Please scan again.');
    }
  });

  const confirmOrderMutation = useMutation({
    mutationFn: async () => {
      if (!cart.length) throw new Error("Cart is empty");
      
      // If we have an active token, append items to it
      if (activeToken) {
        const reqs = cart.map(i => api.post(`/subpos/token/${activeToken.qrCode}/items`, {
          menuItemId: i.id,
          quantity: i.quantity
        }));
        await Promise.all(reqs);
        return "added";
      } 
      // If no token, create a new one automatically
      else {
        const payload = {
          customerName: customerName.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined,
          items: cart.map(i => ({ menuItemId: i.id, quantity: i.quantity }))
        };
        const { data } = await api.post('/subpos/token/create', payload);
        return { type: "created", data: data.data };
      }
    },
    onSuccess: (res) => {
      setCart([]);
      if (typeof res === 'object' && res.type === 'created') setActiveToken(res.data);
      
      qc.invalidateQueries({ queryKey: ['restaurant-tables'] });
      toast.success('KOT SENT TO KITCHEN! 🚀', { 
        duration: 4000, 
        style: { background: '#10b981', color: '#fff', fontWeight: 'bold' } 
      });
      setView('tables');
      resetTableSession();
    },
    onError: (err: any) => toast.error(err?.message || err?.response?.data?.error || 'Failed to confirm order')
  });

  // ── Helpers ──────────────────────────────────────────────────────────────
  const resetTableSession = () => {
    setActiveToken(null);
    setSelectedTable(null);
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
  };

  const handleTableClick = (table: Table) => {
    setSelectedTable(table);
    setIsTokenModalOpen(true);
  };

  const startNewOrder = () => {
    setActiveToken(null);
    setCustomerName('');
    setCustomerPhone('');
    setIsTokenModalOpen(false);
    setView('order');
  };

  // Cart Management
  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(p => p.id === item.id);
      if (existing) return prev.map(p => p.id === item.id ? { ...p, quantity: p.quantity + 1 } : p);
      return [...prev, { ...item, quantity: 1 }];
    });
    toast.success(`${item.name} added`, { duration: 800 });
  };
  const updateQty = (id: number, delta: number) => {
    setCart(prev => prev.map(p => p.id === id ? { ...p, quantity: Math.max(1, p.quantity + delta) } : p));
  };
  const removeFromCart = (id: number) => setCart(prev => prev.filter(p => p.id !== id));
  
  const filteredItems = useMemo(() => {
    return items.filter(i => 
      (selectedCat === null || i.categoryId === selectedCat) &&
      (!searchQuery || i.name.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [items, selectedCat, searchQuery]);

  const pendingTotal = cart.reduce((sum, it) => sum + (it.price * it.quantity), 0);

  return (
    <div className="fixed inset-0 bg-[#0f1014] text-white flex flex-col font-sans select-none overflow-hidden">
      {/* ── HEADER ── */}
      <header className="h-16 px-4 flex items-center justify-between border-b border-gray-800 bg-[#1a1c23]/90 backdrop-blur-md z-40">
        <div className="flex items-center gap-3">
          {view === 'order' && (
            <button onClick={() => { setView('tables'); resetTableSession(); }} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400">
              <ArrowLeft size={20} />
            </button>
          )}
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Coffee size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-widest leading-tight">TableTrack</h1>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Waiter Terminal • {user.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded-full border border-gray-700">
            <Clock size={14} className="text-gray-400" />
            <span className="text-xs font-bold text-gray-300">{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
          </div>
          <button onClick={() => { logout(); navigate('/login'); }} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-xl transition">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* ── TABLE VIEW ── */}
      {view === 'tables' && (
        <main className="flex-1 overflow-auto p-6 bg-[#09090b]">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold flex items-center gap-2 filter drop-shadow-sm"><LayoutGrid className="text-purple-500"/> Select Table</h2>
            </div>
            
            {isLoadingTables ? (
              <div className="flex justify-center py-20"><Loader2 className="animate-spin text-purple-600" size={40} /></div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {tables.map(table => {
                  const isOccupied = table.orders && table.orders.filter(o => ['running','placed','preparing','served'].includes(o.status)).length > 0;
                  return (
                    <button
                      key={table.id}
                      onClick={() => handleTableClick(table)}
                      className={cn(
                        "relative p-6 rounded-2xl border flex flex-col items-center gap-3 transition-all hover:scale-105 shadow-xl group",
                         isOccupied ? "bg-red-500/5 border-red-500/30 hover:border-red-500/80" : "bg-emerald-500/5 border-emerald-500/30 hover:border-emerald-500/80"
                      )}
                    >
                      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-60">
                         <User size={12} /> <span className="text-xs font-bold">{table.capacity}</span>
                      </div>
                      <div className={cn("w-14 h-14 rounded-full flex items-center justify-center border-2 transition-transform group-hover:scale-110", isOccupied ? "border-red-500/50 bg-red-500/20 text-red-500" : "border-emerald-500/50 bg-emerald-500/20 text-emerald-500")}>
                        <Hash size={24} />
                      </div>
                      <div className="text-center mt-2">
                        <h3 className="font-bold text-lg text-white group-hover:text-purple-300 transition-colors">{table.name}</h3>
                        <div className="mt-1">
                          {isOccupied ? (
                            <span className="inline-block px-3 py-1 rounded-full bg-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest">Occupied</span>
                          ) : (
                            <span className="inline-block px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest">Available</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      )}

      {/* ── ORDER POS VIEW ── */}
      {view === 'order' && (
        <main className="flex-1 flex overflow-hidden">
          {/* Menu Area */}
          <div className="flex-1 flex flex-col bg-[#111318] border-r border-gray-800 relative z-10 w-full sm:w-auto">
            {/* Top Toolbar */}
            <div className="p-4 bg-[#1a1c23] border-b border-gray-800 flex gap-4 shrink-0">
               <div className="relative flex-1">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                 <input 
                   type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                   placeholder="Search menu..."
                   className="w-full bg-[#09090b] border border-gray-800 focus:border-purple-500 text-white rounded-xl pl-10 pr-4 py-3 outline-none transition"
                 />
               </div>
            </div>

            {/* Categories */}
            <div className="px-4 py-3 border-b border-gray-800 overflow-x-auto no-scrollbar flex gap-2 shrink-0 bg-[#16181e]">
               <button onClick={() => setSelectedCat(null)} className={cn("px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition", selectedCat === null ? "bg-purple-600 text-white" : "bg-gray-800/80 text-gray-400 hover:bg-gray-700 hover:text-white")}>All Menu</button>
               {categories.map(c => (
                 <button key={c.id} onClick={() => setSelectedCat(c.id)} className={cn("px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition", selectedCat === c.id ? "bg-purple-600 text-white" : "bg-gray-800/80 text-gray-400 hover:bg-gray-700 hover:text-white")}>{c.name}</button>
               ))}
            </div>

            {/* Products Grid */}
            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 content-start pb-20">
              {filteredItems.map(item => (
                <button key={item.id} onClick={() => addToCart(item)} className="bg-[#1a1c23] border border-gray-800 hover:border-purple-500/50 rounded-2xl overflow-hidden flex flex-col text-left transition-all active:scale-[0.98] group shadow-lg">
                  <div className="aspect-[4/3] bg-gray-900 w-full relative">
                    <img src={item.image ? (item.image.startsWith('http') ? item.image : `http://localhost:3001${item.image}`) : `https://ui-avatars.com/api/?name=${item.name}&background=1a1c23&color=fff`} alt={item.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition duration-500" />
                    <div className="absolute top-2 right-2 px-2 py-1 bg-black/60 backdrop-blur-md rounded-lg border border-white/10 flex items-center gap-1 shadow-2xl">
                      <span className="text-[10px] font-black text-purple-400">₹</span>
                      <span className="text-xs font-black text-white">{item.price}</span>
                    </div>
                  </div>
                  <div className="p-3 flex-1 flex flex-col justify-center">
                    <h4 className="text-xs font-black uppercase text-gray-300 leading-tight mb-1 group-hover:text-white transition-colors line-clamp-2">{item.name}</h4>
                    <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest truncate">{item.category?.name || 'Item'}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right Sidebar (Cart & Token Info) */}
          <div className="w-full max-w-[400px] bg-[#1a1c23] flex flex-col shrink-0 border-l border-gray-800 absolute right-0 inset-y-16 sm:relative sm:inset-auto z-20 transition-transform transform translate-x-0">
             {/* Info Section */}
             <div className="p-5 border-b border-gray-800 bg-[#16181e] shrink-0">
               <div className="flex items-center justify-between mb-4">
                 <div className="flex items-center gap-2">
                   <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-500 flex items-center justify-center border border-purple-500/30">
                      <LayoutGrid size={16} />
                   </div>
                   <div>
                     <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 leading-none">Adding to</p>
                     <h3 className="font-bold text-lg text-white leading-none">{selectedTable?.name || 'Selected Table'}</h3>
                   </div>
                 </div>
                 {activeToken && (
                   <span className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-black uppercase tracking-widest flex items-center gap-1">
                     <QrCode size={14}/> #{activeToken.tokenNumber}
                   </span>
                 )}
               </div>

               {/* Customer Inputs (Only editable if no active token) */}
               <div className="space-y-3 mt-4">
                 <div className="flex items-center bg-[#09090b] rounded-xl border border-gray-800 overflow-hidden focus-within:border-purple-500 transition-colors">
                   <div className="py-3 px-3 border-r border-gray-800 text-gray-500"><User size={16} /></div>
                   <input disabled={!!activeToken} type="text" placeholder="Customer Name (Optional)" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full bg-transparent border-none focus:ring-0 text-sm py-3 px-3 text-white outline-none disabled:opacity-50 placeholder:-gray-700 font-bold" />
                 </div>
                 <div className="flex items-center bg-[#09090b] rounded-xl border border-gray-800 overflow-hidden focus-within:border-purple-500 transition-colors">
                   <div className="py-3 px-3 border-r border-gray-800 text-gray-500"><Phone size={16} /></div>
                   <input disabled={!!activeToken} type="text" placeholder="Phone Number (Optional)" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full bg-transparent border-none focus:ring-0 text-sm py-3 px-3 text-white outline-none disabled:opacity-50 placeholder:text-gray-700 font-bold" />
                 </div>
               </div>
             </div>

             {/* Cart Items (Existing + Pending) */}
             <div className="flex-1 overflow-y-auto px-4 py-6 bg-[#12141a]">
                {/* Existing Items (Read Only) */}
                {activeToken && activeToken.items && activeToken.items.length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3 opacity-60">
                      <Hash size={14} /> <span className="text-[10px] font-black uppercase tracking-widest text-gray-300">Previous Items (Read-Only)</span>
                    </div>
                    <div className="space-y-2">
                    {activeToken.items.map((it: TokenItem) => (
                      <div key={it.id} className="p-3 bg-gray-800/20 border border-gray-800 rounded-xl flex flex-col justify-center select-none">
                        <div className="flex justify-between items-center w-full">
                          <div className="flex-1">
                            <p className="text-xs font-bold text-gray-300 leading-tight">{it.menuItemName}</p>
                            <p className="text-[10px] text-gray-500 font-bold mt-0.5">Qty: {it.quantity}</p>
                          </div>
                          <span className="text-sm font-bold text-gray-400">{formatCurrency(it.total)}</span>
                        </div>
                      </div>
                    ))}
                    </div>
                  </div>
                )}

                {/* Pending New Items */}
                {cart.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3 text-emerald-400">
                      <Plus size={14} /> <span className="text-[10px] font-black uppercase tracking-widest">Pending KOT Additions</span>
                    </div>
                    <div className="space-y-2">
                    {cart.map(item => (
                      <div key={item.id} className="p-3 bg-[#1e2028] border border-gray-700 shadow-md rounded-xl flex flex-col gap-3 relative">
                        <div className="flex justify-between items-start">
                          <p className="text-sm font-bold text-white pr-6 leading-tight">{item.name}</p>
                          <button onClick={() => removeFromCart(item.id)} className="p-1.5 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition absolute top-2 right-2"><Trash2 size={14}/></button>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                           <div className="flex items-center bg-[#111318] rounded-xl p-1 border border-gray-800">
                             <button onClick={() => updateQty(item.id, -1)} className="w-8 h-8 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition"><Minus size={16}/></button>
                             <span className="w-10 text-center text-sm font-bold">{item.quantity}</span>
                             <button onClick={() => updateQty(item.id, 1)} className="w-8 h-8 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition"><Plus size={16}/></button>
                           </div>
                           <span className="font-bold text-emerald-400">{formatCurrency(item.price * item.quantity)}</span>
                        </div>
                      </div>
                    ))}
                    </div>
                  </div>
                )}

                {(!activeToken || !activeToken.items?.length) && cart.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center opacity-30 text-center px-6">
                    <div className="w-20 h-20 bg-gray-800 rounded-[30px] flex items-center justify-center mb-6">
                      <ShoppingBag size={40} className="text-gray-400" />
                    </div>
                    <h3 className="font-black text-xl mb-1">Empty Table</h3>
                    <p className="text-xs font-bold uppercase tracking-widest">Select items from menu</p>
                  </div>
                )}
             </div>

             {/* Checkout Footer block */}
             <div className="p-5 bg-[#16181e] border-t border-gray-800 shrink-0 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
               <div className="flex justify-between mb-4 text-emerald-400 border-b border-gray-800/50 pb-4">
                 <span className="font-black uppercase tracking-widest text-[10px] self-end">Pending Total</span>
                 <span className="font-black text-2xl leading-none">{formatCurrency(pendingTotal)}</span>
               </div>
               <button 
                 onClick={() => confirmOrderMutation.mutate()}
                 disabled={cart.length === 0 || confirmOrderMutation.isPending}
                 className="w-full py-5 rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 transition active:scale-95 disabled:opacity-50 disabled:active:scale-100 bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_30px_rgba(16,185,129,0.2)] disabled:shadow-none"
               >
                 {confirmOrderMutation.isPending ? <Loader2 className="animate-spin" /> : activeToken ? 'Confirm Adds → KOT' : 'Create & Print KOT'}
               </button>
             </div>
          </div>
        </main>
      )}

      {/* ── MODALS ── */}
      {isTokenModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
           <div className="bg-[#1a1c23] border border-gray-800 rounded-3xl p-8 max-w-sm w-full mx-4 shadow-2xl relative">
              <button onClick={() => setIsTokenModalOpen(false)} className="absolute top-4 right-4 p-2 text-gray-500 hover:text-white bg-gray-800 rounded-full transition"><Minus className="rotate-45" size={16} /></button>
              
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-purple-600/20 border border-purple-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4 text-purple-400">
                   <LayoutGrid size={32} />
                </div>
                <h3 className="font-black text-2xl text-white mb-1">Table {selectedTable?.name}</h3>
                <p className="text-sm font-bold text-gray-500">Scan token or start a new bill</p>
              </div>

              <div className="space-y-6">
                <div className="relative">
                  <input 
                    autoFocus
                    type="text" 
                    value={tokenLookupInput}
                    onChange={(e) => setTokenLookupInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && lookupMutation.mutate(tokenLookupInput)}
                    placeholder="Scan QR / Number"
                    className="w-full px-6 py-4 bg-[#0f1014] border border-gray-800 rounded-2xl text-center font-bold tracking-widest focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 outline-none transition text-white placeholder-gray-600"
                  />
                  <button onClick={() => lookupMutation.mutate(tokenLookupInput)} disabled={!tokenLookupInput || lookupMutation.isPending} className="absolute right-2 top-2 bottom-2 px-5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl font-bold transition flex items-center justify-center shadow shadow-purple-600/30">
                    {lookupMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                  </button>
                </div>

                <div className="flex items-center gap-4 py-2 opacity-50">
                  <div className="h-px bg-gray-700 flex-1" />
                  <span className="text-[10px] font-black tracking-widest uppercase text-gray-400">OR</span>
                  <div className="h-px bg-gray-700 flex-1" />
                </div>

                <button onClick={startNewOrder} className="w-full py-4 bg-[#0f1014] border border-gray-800 hover:border-emerald-500 hover:bg-emerald-500/10 text-gray-300 hover:text-emerald-400 font-black rounded-2xl flex items-center justify-center gap-2 transition group shadow-lg">
                  <Plus size={20} className="group-hover:scale-125 transition-transform" /> START NEW TOKEN
                </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
