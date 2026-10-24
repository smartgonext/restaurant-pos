import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  ChevronDown,
  Loader2,
  LogOut,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShoppingCart,
  Receipt,
  UserRound,
  Phone,
  X,
} from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';

const SERVER_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

interface MenuItem {
  id: number;
  name: string;
  price: number;
  categoryId: number | null;
  image?: string | null;
}

interface Category {
  id: number;
  name: string;
}

interface Table {
  id: number;
  name: string;
  status: 'available' | 'occupied' | 'cleanup' | string;
}

interface TokenLike {
  id: number;
  tokenNumber: number;
  qrCode: string;
  status?: string;
  customerName?: string;
  customerPhone?: string;
  subtotal?: number;
  total?: number;
  items?: Array<{ id: string | number; menuItemName?: string; name?: string; quantity: number; total?: number; price?: number }>;
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
  const qc = useQueryClient();

  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [activeToken, setActiveToken] = useState<TokenLike | null>(null);
  const [tokenLookupInput, setTokenLookupInput] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [pendingCart, setPendingCart] = useState<PendingItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [billPreview, setBillPreview] = useState<TokenLike | null>(null);

  if (!user || !['waiter', 'admin', 'branch_head', 'chef', 'staff'].includes(user.role)) {
    return <Navigate to="/login" replace />;
  }

  const { data: tables = [], isLoading: isLoadingTables } = useQuery<Table[]>({
    queryKey: ['waiter-tables-v2'],
    queryFn: async () => {
      const { data } = await api.get('/restaurant/tables');
      return data.data;
    },
    refetchInterval: 5000,
  });

  const { data: items = [] } = useQuery<MenuItem[]>({
    queryKey: ['waiter-items-v2'],
    queryFn: async () => {
      const { data } = await api.get('/subpos/items');
      return data.data;
    },
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['waiter-categories-v2'],
    queryFn: async () => {
      const { data } = await api.get('/subpos/categories');
      return data.data;
    },
  });

  const lookupTokenMut = useMutation({
    mutationFn: async (input: string) => {
      const isNum = /^\d+$/.test(input.trim());
      const body = isNum ? { tokenNumber: Number(input.trim()) } : { qrCode: input.trim() };
      const { data } = await api.post('/restaurant/tokens/lookup', body);
      return data.data as TokenLike;
    },
    onSuccess: (tok) => {
      if (tok.status === 'paid') {
        toast.error('This token is already paid');
        return;
      }
      setActiveToken(tok);
      setTokenLookupInput('');
      setCustomerName(tok.customerName || '');
      setCustomerPhone(tok.customerPhone || '');
      toast.success(`Token #${tok.tokenNumber} attached`);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Token not found');
    },
  });

  const confirmOrderMut = useMutation({
    mutationFn: async () => {
      if (!selectedTable) throw new Error('Select table first');
      if (pendingCart.length === 0) throw new Error('Add items first');

      if (activeToken) {
        const payload = {
          bakeryTokenId: activeToken.id,
          tableId: selectedTable.id,
          type: 'dine_in',
          items: pendingCart.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
        };
        await api.post('/restaurant/orders', payload);
        return { mode: 'existing_token' as const };
      }

      const createPayload = {
        items: pendingCart.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
      };

      const createRes = await api.post('/subpos/token/create', createPayload);
      const created = createRes.data?.data?.token as TokenLike | undefined;

      if (!created) {
        throw new Error('Token creation failed');
      }

      setActiveToken(created);
      setCustomerName(created.customerName || customerName);
      setCustomerPhone(created.customerPhone || customerPhone);
      return { mode: 'new_token' as const, tokenNumber: created.tokenNumber };
    },
    onSuccess: (result) => {
      setPendingCart([]);
      qc.invalidateQueries({ queryKey: ['waiter-tables-v2'] });
      if (result.mode === 'new_token') {
        toast.success(`Token generated (#${result.tokenNumber}) and sent to kitchen`);
      } else {
        toast.success('Order sent to kitchen');
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to confirm order');
    },
  });

  const billPreviewMut = useMutation({
    mutationFn: async () => {
      if (!activeToken?.qrCode) throw new Error('No active token');
      const { data } = await api.get(`/subpos/token/${activeToken.qrCode}`);
      return data.data as TokenLike;
    },
    onSuccess: (tokenData) => {
      setBillPreview(tokenData);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to load bill preview');
    },
  });

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const catMatch = activeCategory === 'all' || item.categoryId === Number(activeCategory);
      const searchMatch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      return catMatch && searchMatch;
    });
  }, [items, activeCategory, searchQuery]);

  const pendingSubtotal = useMemo(
    () => pendingCart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [pendingCart],
  );

  const pendingTax = pendingSubtotal * 0.05;
  const pendingTotal = pendingSubtotal + pendingTax;

  const handleSelectTable = (table: Table) => {
    setSelectedTable(table);
    setPendingCart([]);
    setActiveToken(null);
    setTokenLookupInput('');
    setCustomerName('');
    setCustomerPhone('');
  };

  const addToPending = (item: MenuItem) => {
    if (!selectedTable) {
      toast.error('Select table first');
      return;
    }

    setPendingCart((prev) => {
      const existing = prev.find((p) => p.menuItemId === item.id);
      if (existing) {
        return prev.map((p) => (p.menuItemId === item.id ? { ...p, quantity: p.quantity + 1 } : p));
      }
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          menuItemId: item.id,
          name: item.name,
          price: item.price,
          quantity: 1,
        },
      ];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setPendingCart((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item,
      ),
    );
  };

  const removePending = (id: string) => {
    setPendingCart((prev) => prev.filter((item) => item.id !== id));
  };

  const resetView = () => {
    setSelectedTable(null);
    setActiveToken(null);
    setTokenLookupInput('');
    setPendingCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setSearchQuery('');
    setActiveCategory('all');
    setBillPreview(null);
  };

  const canConfirm = !!selectedTable && pendingCart.length > 0 && !confirmOrderMut.isPending;

  return (
    <div className="min-h-screen bg-[#0f1014] text-white">
      <div className="flex items-center justify-between px-4 py-3 bg-[#1a1c23] border-b border-gray-800">
        <div className="flex items-center gap-3">
          <ShoppingCart className="w-5 h-5 text-teal-500" />
          <div>
            <p className="font-bold text-sm tracking-wide uppercase">Waiter Terminal</p>
            <p className="text-xs text-gray-500">Fast table workflow</p>
          </div>
        </div>
        <button onClick={logout} className="flex items-center gap-1.5 text-gray-400 hover:text-white text-xs font-bold uppercase">
          <LogOut className="w-4 h-4" /> Exit
        </button>
      </div>

      <div className="p-4 grid grid-cols-1 xl:grid-cols-[300px_1fr_360px] gap-4">
        <section className="bg-[#1a1c23] border border-gray-800 rounded-xl p-4">
          <h3 className="text-xs uppercase font-bold text-gray-400 mb-3">Tables</h3>
          <div className="space-y-2 max-h-60 xl:max-h-[45vh] overflow-auto">
            {isLoadingTables ? (
              <div className="py-6 text-center text-gray-500"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>
            ) : (
              tables.map((table) => (
                <button
                  key={table.id}
                  onClick={() => handleSelectTable(table)}
                  className={cn(
                    'w-full px-3 py-2.5 rounded-md border text-left transition',
                    selectedTable?.id === table.id
                      ? 'bg-teal-600/20 border-teal-500 text-white'
                      : 'bg-[#0f1014] border-gray-700 text-gray-300 hover:border-gray-500',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{table.name}</span>
                    <span className={cn('w-2.5 h-2.5 rounded-full', table.status === 'available' ? 'bg-green-500' : table.status === 'cleanup' ? 'bg-yellow-500' : 'bg-red-500')} />
                  </div>
                  <p className="text-[11px] text-gray-500 uppercase mt-1">{table.status}</p>
                </button>
              ))
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-700 space-y-2">
            <p className="text-xs font-bold text-gray-400 uppercase">Existing Token (Optional)</p>
            <div className="flex gap-2">
              <input
                value={tokenLookupInput}
                onChange={(e) => setTokenLookupInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && tokenLookupInput.trim() && lookupTokenMut.mutate(tokenLookupInput)}
                placeholder="Token # or QR"
                className="flex-1 bg-[#0f1014] border border-gray-700 rounded-md px-3 py-2 text-sm"
              />
              <button
                onClick={() => lookupTokenMut.mutate(tokenLookupInput)}
                disabled={!tokenLookupInput.trim() || lookupTokenMut.isPending || !selectedTable}
                className="px-3 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 rounded-md text-sm font-bold"
              >
                {lookupTokenMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Link'}
              </button>
            </div>
            {activeToken && (
              <div className="bg-[#0f1014] border border-gray-700 rounded-md p-2 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">Token</span><span className="font-bold text-teal-400">#{activeToken.tokenNumber}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Customer</span><span>{activeToken.customerName || 'Walk-in'}</span></div>
              </div>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-700 space-y-2">
            <p className="text-xs font-bold text-gray-400 uppercase">New Token Details (If no token)</p>
            <div className="relative">
              <UserRound className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-500" />
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Customer name"
                className="w-full bg-[#0f1014] border border-gray-700 rounded-md pl-8 pr-3 py-2 text-sm"
              />
            </div>
            <div className="relative">
              <Phone className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-500" />
              <input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Customer phone"
                className="w-full bg-[#0f1014] border border-gray-700 rounded-md pl-8 pr-3 py-2 text-sm"
              />
            </div>
            <p className="text-[11px] text-gray-500">If token is not linked, Confirm Order will auto-generate token from these details.</p>
          </div>
        </section>

        <section className="bg-[#1a1c23] border border-gray-800 rounded-xl p-4 min-h-[320px]">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between mb-3">
            <div className="flex gap-2 flex-1">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-500" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search items"
                  className="w-full bg-[#0f1014] border border-gray-700 rounded-md py-2 pl-9 pr-3 text-sm"
                />
              </div>
              <button
                onClick={() => { setSearchQuery(''); setActiveCategory('all'); }}
                className="px-3 py-2 rounded-md bg-teal-600/90 hover:bg-teal-500 text-sm font-bold flex items-center gap-1"
              >
                <RotateCcw className="w-4 h-4" /> Reset
              </button>
            </div>

            <div className="relative sm:w-56">
              <button
                onClick={() => setShowCategoryDropdown((v) => !v)}
                className="w-full bg-[#0f1014] border border-gray-700 rounded-md py-2 px-3 text-xs font-bold flex justify-between items-center"
              >
                <span>{activeCategory === 'all' ? 'All Categories' : categories.find((c) => c.id === Number(activeCategory))?.name || 'Category'}</span>
                <ChevronDown className={cn('w-4 h-4 transition', showCategoryDropdown && 'rotate-180')} />
              </button>
              {showCategoryDropdown && (
                <div className="absolute z-50 mt-2 w-full bg-[#0f1014] border border-gray-700 rounded-md overflow-hidden">
                  <button onClick={() => { setActiveCategory('all'); setShowCategoryDropdown(false); }} className={cn('w-full text-left px-3 py-2 text-sm hover:bg-gray-800', activeCategory === 'all' && 'text-teal-400 bg-teal-500/10')}>All Categories</button>
                  {categories.map((cat) => (
                    <button key={cat.id} onClick={() => { setActiveCategory(String(cat.id)); setShowCategoryDropdown(false); }} className={cn('w-full text-left px-3 py-2 text-sm hover:bg-gray-800', activeCategory === String(cat.id) && 'text-teal-400 bg-teal-500/10')}>
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {!selectedTable ? (
            <div className="h-64 flex flex-col items-center justify-center text-gray-500">
              <AlertCircle className="w-7 h-7 mb-2" />
              <p>Select a table first</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[65vh] overflow-auto">
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => addToPending(item)}
                  className="bg-[#0f1014] border border-gray-700 rounded-md p-2.5 text-left hover:border-teal-500 hover:bg-[#13151c] transition"
                >
                  {item.image && (
                    <img src={`${SERVER_URL}${item.image}`} alt={item.name} className="w-full h-24 object-cover rounded mb-2" />
                  )}
                  <p className="text-xs font-bold text-gray-200 line-clamp-1">{item.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{formatCurrency(item.price)}</p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="bg-[#1a1c23] border border-gray-800 rounded-xl p-4 flex flex-col min-h-[320px]">
          <h3 className="text-xs uppercase font-bold text-gray-400 mb-3">Pending Cart</h3>

          <div className="flex-1 overflow-auto space-y-2">
            {pendingCart.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-gray-600 text-sm">No pending items</div>
            ) : (
              pendingCart.map((item) => (
                <div key={item.id} className="bg-[#0f1014] border border-gray-700 rounded-md p-2.5 text-xs">
                  <div className="flex items-start justify-between mb-2">
                    <p className="font-bold text-gray-200 line-clamp-1">{item.name}</p>
                    <button onClick={() => removePending(item.id)} className="text-red-500 hover:text-red-400"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateQty(item.id, -1)} className="w-6 h-6 rounded bg-gray-700 flex items-center justify-center"><Minus className="w-3 h-3" /></button>
                      <span className="w-7 text-center font-bold">{item.quantity}</span>
                      <button onClick={() => updateQty(item.id, 1)} className="w-6 h-6 rounded bg-teal-600 flex items-center justify-center"><Plus className="w-3 h-3" /></button>
                    </div>
                    <span className="text-gray-400">{formatCurrency(item.price * item.quantity)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-gray-700 mt-3 pt-3 space-y-1.5 text-xs">
            <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{formatCurrency(pendingSubtotal)}</span></div>
            <div className="flex justify-between text-gray-500"><span>Tax (5%)</span><span>{formatCurrency(pendingTax)}</span></div>
            <div className="flex justify-between font-bold text-teal-400 text-sm"><span>Total</span><span>{formatCurrency(pendingTotal)}</span></div>
          </div>

          <div className="mt-3 space-y-2">
            <button
              onClick={() => confirmOrderMut.mutate()}
              disabled={!canConfirm}
              className="w-full py-3 rounded-md bg-teal-600 hover:bg-teal-500 disabled:opacity-50 font-bold text-sm flex items-center justify-center gap-2"
            >
              {confirmOrderMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {activeToken ? 'Confirm Order' : 'Confirm + Generate Token'}
            </button>

            <button
              onClick={() => billPreviewMut.mutate()}
              disabled={!activeToken || billPreviewMut.isPending}
              className="w-full py-2.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-bold text-sm flex items-center justify-center gap-2"
            >
              {billPreviewMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
              Close Bill / Preview
            </button>

            <button onClick={resetView} className="w-full py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-sm font-bold">Clear</button>
          </div>
        </section>
      </div>

      {billPreview && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md bg-[#151823] border border-gray-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-white">Bill Preview</h3>
              <button onClick={() => setBillPreview(null)} className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-1 text-sm mb-3">
              <div className="flex justify-between"><span className="text-gray-500">Table</span><span>{selectedTable?.name || '-'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Token</span><span>#{billPreview.tokenNumber}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Customer</span><span>{billPreview.customerName || 'Walk-in'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Phone</span><span>{billPreview.customerPhone || '-'}</span></div>
            </div>

            <div className="max-h-44 overflow-auto border border-gray-700 rounded-md p-2 bg-[#0f1014] text-xs space-y-1">
              {(billPreview.items || []).map((it) => (
                <div key={String(it.id)} className="flex justify-between text-gray-300">
                  <span>{it.menuItemName || it.name} x{it.quantity}</span>
                  <span>{formatCurrency(Number(it.total || Number(it.price || 0) * it.quantity))}</span>
                </div>
              ))}
            </div>

            <div className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between text-gray-400"><span>Subtotal</span><span>{formatCurrency(Number(billPreview.subtotal || 0))}</span></div>
              <div className="flex justify-between text-teal-400 font-bold"><span>Total</span><span>{formatCurrency(Number(billPreview.total || 0))}</span></div>
            </div>

            <button
              onClick={() => {
                setBillPreview(null);
                setPendingCart([]);
                toast.success('Bill ready for Main POS payment. Table will auto-free after payment.');
              }}
              className="mt-4 w-full py-2.5 rounded-md bg-teal-600 hover:bg-teal-500 font-bold"
            >
              Send To Payment
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
