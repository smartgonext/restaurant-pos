import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { 
  Search, Plus, Minus, Send, LogOut, LayoutGrid, RotateCcw, 
  ShoppingCart, AlertCircle, Clock, User, Loader2, ChevronDown
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Navigate, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';

const SERVER_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

interface MenuItem { 
  id: number; 
  name: string; 
  price: number; 
  categoryId: number | null; 
  image?: string | null;
  category?: { name: string; isKOTEnabled: boolean };
}

interface Category { 
  id: number; 
  name: string; 
}

interface Table {
  id: number;
  name: string;
  status: 'available' | 'occupied' | 'cleanup';
  seatCount?: number;
}

interface Token {
  id: number;
  tokenNumber: number;
  qrCode: string;
  customerName?: string;
  customerPhone?: string;
  items: any[];
  subtotal: number;
  total: number;
}

interface PendingItem {
  id: string;
  menuItemId: number;
  name: string;
  price: number;
  quantity: number;
}

export default function WaiterTerminal() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ── STATES ──
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [activeToken, setActiveToken] = useState<Token | null>(null);
  const [tokenLookupInput, setTokenLookupInput] = useState('');
  
  const [pendingCart, setPendingCart] = useState<PendingItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  // Customer states (for new token)
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isCreatingToken, setIsCreatingToken] = useState(false);
  
  const [isConfirming, setIsConfirming] = useState(false);
  const [kotSuccess, setKotSuccess] = useState(false);
  const [isClosingTable, setIsClosingTable] = useState(false);

  // Redirect if not authorized
  if (!user || !['waiter', 'admin', 'branch_head', 'chef', 'staff'].includes(user.role)) {
    return <Navigate to="/login" replace />;
  }

  // ── QUERIES ──
  const { data: tables = [], isLoading: isLoadingTables } = useQuery<Table[]>({
    queryKey: ['waiter-tables'],
    queryFn: async () => {
      const { data } = await api.get('/restaurant/tables');
      return data.data;
    },
    refetchInterval: 5000,
  });

  const { data: items = [] } = useQuery<MenuItem[]>({
    queryKey: ['waiter-items'],
    queryFn: async () => {
      const { data } = await api.get('/subpos/items');
      return data.data;
    },
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['waiter-categories'],
    queryFn: async () => {
      const { data } = await api.get('/subpos/categories');
      return data.data;
    },
  });

  // ── MUTATIONS ──
  const lookupTokenMut = useMutation({
    mutationFn: async (input: string) => {
      if (!selectedTable) throw new Error('Select a table first');
      const isNum = /^\d+$/.test(input.trim());
      const body = isNum ? { tokenNumber: Number(input) } : { qrCode: input.trim() };
      const { data } = await api.post('/restaurant/tokens/lookup', body);
      return data.data;
    },
    onSuccess: (data) => {
      if (data.status === 'paid') {
        toast.error('❌ Token already paid');
        return;
      }
      setActiveToken(data);
      setTokenLookupInput('');
      toast.success(`✅ Token #${data.tokenNumber} linked to ${selectedTable?.name}`);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || '❌ Token not found');
    },
  });

  const createTokenMut = useMutation({
    mutationFn: async () => {
      if (!selectedTable) throw new Error('Select a table first');
      const { data } = await api.post('/subpos/token/create', {
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        items: pendingCart.map(i => ({ menuItemId: i.menuItemId, quantity: i.quantity }))
      });
      return data.data;
    },
    onSuccess: (data) => {
      const token = (data as any).token ?? data;
      setActiveToken(token);
      setPendingCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setIsCreatingToken(false);
      qc.invalidateQueries({ queryKey: ['waiter-tables'] });
      toast.success(`✅ Token #${token.tokenNumber} created & linked!`);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || '❌ Failed to create token');
    }
  });

  const closeTableMut = useMutation({
    mutationFn: async () => {
      if (!activeToken) throw new Error('No active token');
      await api.post(`/restaurant/tables/${selectedTable?.id}/close`, {
        bakeryTokenId: activeToken.id
      });
    },
    onSuccess: () => {
      toast.success('🏁 Table closed & bill finalized!');
      handleClearStates();
      qc.invalidateQueries({ queryKey: ['waiter-tables'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || '❌ Failed to close table');
    }
  });

  const confirmOrderMut = useMutation({
    mutationFn: async () => {
      if (!activeToken || !selectedTable) throw new Error('missing table or token');
      if (pendingCart.length === 0) throw new Error('no items to send');

      const payload = {
        bakeryTokenId: activeToken.id,
        tableId: selectedTable.id,
        items: pendingCart.map(i => ({
          menuItemId: i.menuItemId,
          quantity: i.quantity,
        })),
      };

      const { data } = await api.post('/restaurant/orders', payload);
      return data.data;
    },
    onSuccess: () => {
      setPendingCart([]);
      setKotSuccess(true);
      qc.invalidateQueries({ queryKey: ['waiter-tables'] });

      if (activeToken?.tokenNumber) {
        lookupTokenMut.mutate(String(activeToken.tokenNumber));
      }

      toast.success('🚀 KOT SENT TO KITCHEN!', {
        duration: 3000,
        icon: '🍳',
        style: { background: '#10b981', color: '#fff', fontWeight: 'bold' }
      });

      setTimeout(() => {
        setKotSuccess(false);
      }, 2000);
    },
    onSettled: () => {
      setIsConfirming(false);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || '❌ Failed to send KOT');
    },
  });

  // ── HANDLERS ──
  const loadExistingTableToken = async (table: Table) => {
    try {
      const { data } = await api.get('/restaurant/orders', {
        params: { tableId: table.id, status: 'running', type: 'token', limit: 1 },
      });
      const orders = data.data as any[];
      if (orders.length > 0 && orders[0].bakeryToken) {
        const token = orders[0].bakeryToken;
        setActiveToken(token);
        toast.success(`🔁 Loaded open token #${token.tokenNumber} for ${table.name}`);
      } else {
        toast(`🪑 ${table.name} is occupied. Please scan or create token`);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to fetch active table token');
    }
  };

  const handleSelectTable = (table: Table) => {
    setSelectedTable(table);
    setActiveToken(null);
    setPendingCart([]);
    setTokenLookupInput('');

    if (table.status !== 'available') {
      loadExistingTableToken(table);
    } else {
      toast(`🪑 ${table.name} selected. Add items and link token.`);
    }
  };

  const handleAddToCart = (item: MenuItem) => {
    setPendingCart(prev => {
      const existing = prev.find(p => p.menuItemId === item.id);
      if (existing) {
        return prev.map(p => p.menuItemId === item.id ? { ...p, quantity: p.quantity + 1 } : p);
      }
      return [...prev, {
        id: Math.random().toString(36).substr(2, 9),
        menuItemId: item.id,
        name: item.name,
        price: item.price,
        quantity: 1,
      }];
    });
    toast.success(`Added ${item.name}`, { duration: 800 });
  };

  const handleUpdateQty = (id: string, delta: number) => {
    setPendingCart(prev =>
      prev.map(p => p.id === id ? { ...p, quantity: Math.max(1, p.quantity + delta) } : p)
    );
  };

  const handleRemoveItem = (id: string) => {
    setPendingCart(prev => prev.filter(p => p.id !== id));
  };

  const handleClearStates = () => {
    setSelectedTable(null);
    setActiveToken(null);
    setPendingCart([]);
    setTokenLookupInput('');
    setSearchQuery('');
    setActiveCategory('all');
    setCustomerName('');
    setCustomerPhone('');
    setIsCreatingToken(false);
  };

  const handleLookupToken = () => {
    if (!tokenLookupInput.trim()) {
      toast.error('Enter or scan token');
      return;
    }
    lookupTokenMut.mutate(tokenLookupInput);
  };

  const handleConfirmOrder = async () => {
    if (pendingCart.length === 0) {
      toast.error('Add items first');
      return;
    }
    setIsConfirming(true);
    confirmOrderMut.mutate();
  };

  // ── DERIVED STATE ──
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchCat = activeCategory === 'all' || item.categoryId === parseInt(activeCategory);
      const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [items, activeCategory, searchQuery]);

  const pendingSubtotal = pendingCart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const pendingTax = pendingSubtotal * 0.05;
  const pendingTotal = pendingSubtotal + pendingTax;
  
  const existingItems = activeToken?.items?.filter((i: any) => !i.isRemoved) || [];
  const existingSubtotal = activeToken?.subtotal ?? existingItems.reduce((s: number, item: any) => s + (item.price * item.quantity || item.total || 0), 0);
  const existingTotal = activeToken?.total ?? existingSubtotal;
  const combinedTotal = existingTotal + pendingTotal;

  const availableTables = tables.filter(t => ['available', 'occupied'].includes(t.status));

  return (
    <div className="flex flex-col h-screen bg-[#0f1014] text-white overflow-hidden">
      
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#1a1c23] border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <ShoppingCart className="w-5 h-5 text-teal-500" />
          <span className="font-bold text-gray-200 uppercase tracking-wide text-sm">WAITER TERMINAL</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500">{user?.name}</span>
          <button onClick={logout} className="flex items-center gap-1.5 text-gray-400 hover:text-white transition text-xs font-bold uppercase">
            <LogOut className="w-4 h-4" /> Exit
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="flex flex-1 overflow-hidden p-4 gap-4">
        
        {/* LEFT: Table Selection + Token Input */}
        <div className="flex-1 flex flex-col min-h-0 bg-[#1a1c23] rounded-xl p-4 border border-gray-800">
          
          <div className="mb-4">
            <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">Select Table</h3>
            
            <div className="space-y-2 max-h-[60%] overflow-y-auto">
              {isLoadingTables ? (
                <div className="text-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-500" />
                </div>
              ) : availableTables.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-xs">No tables available</div>
              ) : (
                availableTables.map(table => (
                  <button
                    key={table.id}
                    onClick={() => handleSelectTable(table)}
                    className={cn(
                      'w-full px-3 py-2.5 rounded-md text-sm font-bold transition-all',
                      selectedTable?.id === table.id
                        ? 'bg-teal-600 text-white ring-2 ring-teal-400'
                        : 'bg-[#0f1014] border border-gray-700 text-gray-300 hover:border-gray-600'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span>{table.name}</span>
                      <span className={cn(
                        'w-2.5 h-2.5 rounded-full',
                        table.status === 'available' ? 'bg-green-500' : 'bg-red-500'
                      )} />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Token Input Section */}
          {selectedTable && !activeToken && !isCreatingToken && (
            <div className="mt-auto pt-4 border-t border-gray-700">
              <h3 className="text-sm font-bold text-gray-400 uppercase mb-3 text-center">Enter / Scan Token</h3>
              <div className="grid grid-cols-1 gap-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tokenLookupInput}
                    onChange={(e) => setTokenLookupInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLookupToken()}
                    placeholder="Token # or QR..."
                    autoFocus
                    className="flex-1 bg-[#0f1014] border border-gray-700 rounded-md px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-teal-500 focus:outline-none transition"
                  />
                  <button
                    onClick={handleLookupToken}
                    disabled={lookupTokenMut.isPending}
                    className="bg-teal-600 hover:bg-teal-500 text-white px-4 py-2.5 rounded-md text-sm font-bold transition disabled:opacity-50"
                  >
                    {lookupTokenMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : '✓'}
                  </button>
                </div>
                <div className="relative py-2 text-center overflow-hidden">
                  <span className="bg-[#1a1c23] px-2 text-[10px] text-gray-600 relative z-10 font-bold uppercase tracking-widest">OR</span>
                  <div className="absolute top-1/2 left-0 w-full h-[1px] bg-gray-800" />
                </div>
                <button
                  onClick={() => setIsCreatingToken(true)}
                  className="w-full bg-white/5 border border-gray-700 hover:bg-white/10 text-gray-300 py-3 rounded-md text-xs font-black uppercase tracking-widest transition"
                >
                  Create New Token
                </button>
              </div>
            </div>
          )}

          {/* New Token Form */}
          {selectedTable && isCreatingToken && (
            <div className="mt-auto pt-4 border-t border-gray-700 space-y-3">
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-xs font-black text-teal-500 uppercase tracking-widest">Customer Details</h3>
                <button 
                   onClick={() => setIsCreatingToken(false)}
                   className="text-gray-600 hover:text-white"
                >
                  ×
                </button>
              </div>
              <input
                type="text"
                placeholder="Name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full bg-[#0f1014] border border-gray-700 rounded-md px-3 py-2 text-xs text-white"
              />
              <input
                type="text"
                placeholder="Phone (Optional)"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full bg-[#0f1014] border border-gray-700 rounded-md px-3 py-2 text-xs text-white"
              />
              <button 
                onClick={() => createTokenMut.mutate()}
                disabled={createTokenMut.isPending || (pendingCart.length === 0)}
                className="w-full bg-teal-600 hover:bg-teal-500 text-white py-3 rounded-md text-xs font-black uppercase tracking-widest transition disabled:opacity-30"
              >
                {createTokenMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Create & Link'}
              </button>
              {pendingCart.length === 0 && (
                <p className="text-[10px] text-yellow-500/80 text-center italic">Add items first to create token</p>
              )}
            </div>
          )}

          {/* Selected Table + Token Display */}
          {selectedTable && activeToken && (
            <div className="mt-4 pt-4 border-t border-gray-700 space-y-2">
{/* Current Active Token Bill Info */}
              <div className="bg-[#0f1014] rounded-md p-3 text-xs border border-teal-500/30 shadow-glow-sm">
                <div className="flex justify-between mb-2">
                  <span className="text-gray-500 font-bold uppercase tracking-tighter">Token #</span>
                  <span className="font-black text-teal-400 text-sm tracking-widest">{activeToken.tokenNumber}</span>
                </div>
                {activeToken.customerName && (
                  <div className="flex justify-between mb-2 pb-2 border-b border-gray-800">
                    <span className="text-gray-500 font-bold uppercase tracking-tighter">Customer</span>
                    <span className="text-gray-300 font-medium truncate ml-2">{activeToken.customerName}</span>
                  </div>
                )}
                <div className="flex justify-between mt-1">
                  <span className="text-gray-500 font-bold uppercase tracking-tighter">Existing Bill</span>
                  <span className="text-teal-400 font-black">{formatCurrency(activeToken.total)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MIDDLE: Items Grid */}
        <div className="flex-[2.5] flex flex-col min-h-0 bg-[#1a1c23] rounded-xl p-4 border border-gray-800 overflow-hidden">
          
          {/* Filter Bar */}
          <div className="mb-4 space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search items..."
                  className="w-full bg-[#0f1014] border border-gray-700 rounded-md py-2.5 pl-10 pr-4 text-sm text-white placeholder-gray-600 focus:border-teal-500 focus:outline-none transition"
                />
              </div>
              <button
                onClick={() => { setSearchQuery(''); setActiveCategory('all'); }}
                className="bg-teal-600/90 hover:bg-teal-500 text-white px-4 rounded-md text-sm font-bold flex items-center gap-2 transition"
              >
                <RotateCcw className="w-4 h-4" /> Reset
              </button>
            </div>

            {/* Category Dropdown */}
            <div className="relative inline-block w-full max-w-xs">
              <button
                onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                className="w-full bg-[#0f1014] border border-gray-700 rounded-md py-2.5 px-3 text-xs font-bold text-left flex justify-between items-center text-gray-400 hover:border-gray-600"
              >
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-3.5 h-3.5" />
                  {activeCategory === 'all' ? 'All Categories' : categories.find(c => c.id === parseInt(activeCategory))?.name || 'Category'}
                </div>
                <ChevronDown className={cn('w-4 h-4 transition', showCategoryDropdown && 'rotate-180')} />
              </button>
              
              {showCategoryDropdown && (
                <div className="absolute top-full left-0 w-full mt-2 bg-[#0f1014] border border-gray-700 rounded-md z-50 overflow-hidden">
                  <button
                    onClick={() => { setActiveCategory('all'); setShowCategoryDropdown(false); }}
                    className={cn(
                      'w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-800',
                      activeCategory === 'all' && 'bg-teal-600/30 text-teal-400'
                    )}
                  >
                    All Categories
                  </button>
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => { setActiveCategory(String(cat.id)); setShowCategoryDropdown(false); }}
                      className={cn(
                        'w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-800',
                        activeCategory === String(cat.id) && 'bg-teal-600/30 text-teal-400'
                      )}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Items Grid */}
          <div className="flex-1 overflow-y-auto">
            {!selectedTable ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <AlertCircle className="w-8 h-8 mb-2" />
                <p className="text-sm font-bold uppercase tracking-widest">Select a table to start</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <p className="text-sm">No items found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => handleAddToCart(item)}
                    className="bg-[#0f1014] border border-gray-700 rounded-md p-3 hover:border-teal-500 hover:bg-gray-900 transition text-left group"
                  >
                    {item.image && (
                      <img
                        src={`${SERVER_URL}${item.image}`}
                        alt={item.name}
                        className="w-full h-20 object-cover rounded-md mb-2 group-hover:brightness-110 transition"
                      />
                    )}
                    <p className="text-xs font-bold text-gray-300 truncate group-hover:text-teal-400">{item.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{formatCurrency(item.price)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Cart Summary */}
        <div className="flex-1 flex flex-col min-h-0 bg-[#1a1c23] rounded-xl p-4 border border-gray-800 overflow-hidden">
          
          <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">Pending Items</h3>

          {/* Existing Items (Read-only) */}
          {existingItems.length > 0 && (
            <div className="mb-4 pb-3 border-b border-gray-700">
              <p className="text-xs text-gray-600 mb-2 uppercase font-bold">Existing Bill</p>
              <div className="space-y-1 text-xs">
                {existingItems.map((item: any) => (
                  <div key={item.id} className="flex justify-between text-gray-500">
                    <span>{item.menuItemName} ×{item.quantity}</span>
                    <span>{formatCurrency(item.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending Cart */}
          <div className="flex-1 overflow-y-auto mb-3 space-y-2">
            {pendingCart.length === 0 ? (
              <div className="text-center py-8 text-gray-600 text-xs">No pending items</div>
            ) : (
              pendingCart.map(item => (
                <div key={item.id} className="bg-[#0f1014] rounded-md p-3 border border-gray-700 text-xs">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-gray-300">{item.name}</span>
                    <button
                      onClick={() => handleRemoveItem(item.id)}
                      className="text-red-500 hover:text-red-400 text-xs font-bold"
                    >
                      ×
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleUpdateQty(item.id, -1)}
                        className="bg-gray-700 hover:bg-gray-600 text-white p-1 rounded w-6 h-6 flex items-center justify-center text-xs"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-8 text-center font-bold">{item.quantity}</span>
                      <button
                        onClick={() => handleUpdateQty(item.id, 1)}
                        className="bg-teal-600 hover:bg-teal-500 text-white p-1 rounded w-6 h-6 flex items-center justify-center text-xs"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <span className="text-gray-400">{formatCurrency(item.price * item.quantity)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Totals */}
          {pendingCart.length > 0 && (
            <div className="border-t border-gray-700 pt-3 mb-3 space-y-2 text-xs">
              <div className="flex justify-between text-gray-500">
                <span>Subtotal</span>
                <span>{formatCurrency(pendingSubtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Tax (5%)</span>
                <span>{formatCurrency(pendingTax)}</span>
              </div>
              <div className="flex justify-between font-bold text-teal-400 text-sm">
                <span>TOTAL</span>
                <span>{formatCurrency(pendingTotal)}</span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2 mt-auto pt-3 border-t border-gray-700">
            {kotSuccess && (
              <div className="bg-green-900/30 border border-green-700 rounded-md p-2 text-center text-xs text-green-400 font-bold">
                ✅ KOT sent! Clearing...
              </div>
            )}
            
            <button
              onClick={handleConfirmOrder}
              disabled={pendingCart.length === 0 || isConfirming || !activeToken || !selectedTable}
              className="w-full bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white py-3 rounded-md font-bold flex items-center justify-center gap-2 transition"
            >
              {isConfirming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  CONFIRM ORDER
                </>
              )}
            </button>

            <button
              onClick={handleClearStates}
              className="w-full bg-gray-700 hover:bg-gray-600 text-gray-300 py-2 rounded-md text-sm font-bold transition"
            >
              CLEAR
            </button>

            {/* Final Bill Button (Under Confirm) */}
            {activeToken && (
               <div className="pt-2 border-t border-gray-800">
                  <button
                    onClick={() => {
                      if (confirm(`Finalize Bill for ${activeToken.tokenNumber}?\nTotal: ${formatCurrency(activeToken.total + pendingTotal)}`)) {
                        closeTableMut.mutate();
                      }
                    }}
                    disabled={closeTableMut.isPending || isConfirming}
                    className="w-full bg-rose-600 hover:bg-rose-500 text-white py-3 rounded-md font-black text-xs uppercase tracking-widest transition flex items-center justify-center gap-2"
                  >
                    {closeTableMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "CLOSE BILL & FREE TABLE"}
                  </button>
               </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
