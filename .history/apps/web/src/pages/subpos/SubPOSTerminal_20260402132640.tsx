import { useState, useEffect, useRef, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSubposStore } from '@/stores/subposStore';
import axios from 'axios';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import { Search, Plus, Minus, LogOut, Printer, User, Phone, Hash, RefreshCw, Sun, Moon, LayoutGrid, Check } from 'lucide-react';
import { useThemeStore } from '@/stores/themeStore';
import { formatCurrency, cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';

const SERVER_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

// ── Axios instance that injects Sub POS JWT ───────────────────────────────────
const subposApi = axios.create({ baseURL: '/api/subpos' });
subposApi.interceptors.request.use((c) => {
  const token = useSubposStore.getState().token;
  if (token) c.headers.Authorization = `Bearer ${token}`;
  return c;
});

interface MenuItem { id: number; name: string; price: number; categoryId: number | null; image: string | null; isVeg?: boolean; productQR?: string; }
interface Category { id: number; name: string; }
interface BillItem { menuItemId: number; name: string; price: number; quantity: number; }

interface TokenResult {
  tokenId: number; tokenNumber: number; qrCode: string; qrUrl: string;
  token: { subtotal: number; sgst: number; cgst: number; igst: number; total: number };
}

// ── Print bill helper ─────────────────────────────────────────────────────────
function printTokenSlip(token: TokenResult, items: BillItem[], customerName?: string, customerPhone?: string, bakeryName = 'TableTrack Bakery') {
  const win = window.open('', '_blank', 'width=400,height=700');
  if (!win) return;
  const itemRows = items.map(i =>
    `<tr><td>${i.name}</td><td style="text-align:center">${i.quantity}</td><td>₹${i.price.toFixed(2)}</td><td style="text-align:right">₹${(i.price * i.quantity).toFixed(2)}</td></tr>`
  ).join('');
  win.document.write(`
    <!DOCTYPE html><html><head><title>Token ${token.tokenNumber}</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: 'Courier New', monospace; background:#fff; color:#000; padding:12px; }
      .center { text-align:center; }
      .token-number { font-size:72pt; font-weight:900; letter-spacing:0.1em; line-height:1; color:#000; }
      .token-qr { width:180px; height:180px; margin:16px auto; display:block; }
      table { width:100%; border-collapse:collapse; margin:8px 0; font-size:10pt; }
      td { padding:3px 4px; }
      .divider { border-top:1px dashed #000; margin:8px 0; }
      .total { font-weight:700; font-size:14pt; }
      .footer { font-size:9pt; color:#555; margin-top:12px; }
      @media print { .no-print { display:none!important; } }
    </style></head><body>
    <div class="center">
      <div style="font-size:18pt;font-weight:700;">${bakeryName}</div>
      <div style="font-size:10pt;color:#555;">${new Date().toLocaleString('en-IN')}</div>
    </div>
    <div class="divider"></div>
    <div class="center">
      <div style="font-size:11pt;font-weight:600;letter-spacing:0.05em;">TOKEN NUMBER</div>
      <div class="token-number">${token.tokenNumber}</div>
    </div>
    <div class="center">
      <svg class="token-qr" id="qr-placeholder">${generateQRSVG()}</svg>
    </div>
    <div class="divider"></div>
    ${customerName ? `<div style="font-size:10pt;">👤 ${customerName}${customerPhone ? ` · ${customerPhone}` : ''}</div>` : ''}
    <table>
      <tr style="border-bottom:1px solid #000;font-weight:600;"><td>Item</td><td>Qty</td><td>Price</td><td style="text-align:right">Amt</td></tr>
      ${itemRows}
    </table>
    <div class="divider"></div>
    <div style="font-size:10pt;">Subtotal: ₹${Number(token.token.subtotal).toFixed(2)}</div>
    ${Number(token.token.sgst) > 0 ? `<div style="font-size:10pt;">SGST: ₹${Number(token.token.sgst).toFixed(2)}</div><div style="font-size:10pt;">CGST: ₹${Number(token.token.cgst).toFixed(2)}</div>` : ''}
    ${Number(token.token.igst) > 0 ? `<div style="font-size:10pt;">IGST: ₹${Number(token.token.igst).toFixed(2)}</div>` : ''}
    <div class="divider"></div>
    <div class="total center">TOTAL: ₹${Number(token.token.total).toFixed(2)}</div>
    <div class="divider"></div>
    <div class="center footer">
      Show this token at Main POS to pay<br/>
      QR Code: ${token.qrCode.slice(0, 8)}...
    </div>
    <script>window.onload=()=>{window.print();window.close();}<\/script>
    </body></html>
  `);
  win.document.close();
}

function generateQRSVG() {
  return `<rect width="180" height="180" fill="#f0f0f0" rx="8"/><text x="90" y="95" text-anchor="middle" font-size="12" fill="#999">QR Code</text>`;
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SubPOSTerminal() {
  const { isAuthenticated, terminal, token: authToken, logout } = useSubposStore();
  const { theme, toggleTheme } = useThemeStore();
  const qc = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [lastToken, setLastToken] = useState<TokenResult | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [todayCount, setTodayCount] = useState(0);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [lookupInput, setLookupInput] = useState('');
  const [loadedToken, setLoadedToken] = useState<any | null>(null);

  if (!isAuthenticated) return <Navigate to="/subpos" replace />;

  const debouncedCustomerPhone = useDebounce(customerPhone, 500);

  // Inject token for queries
  const headers = { Authorization: `Bearer ${authToken}` };

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['subpos-categories'],
    queryFn: async () => {
      const { data } = await axios.get('/api/subpos/categories', { headers });
      return data.data;
    },
    staleTime: 60_000,
  });

  const { data: items = [] } = useQuery<MenuItem[]>({
    queryKey: ['subpos-items'],
    queryFn: async () => {
      const { data } = await axios.get('/api/subpos/items', { headers });
      return data.data;
    },
    staleTime: 60_000,
  });

  const { data: customerSuggestions = [] } = useQuery({
    queryKey: ['subpos-customers', debouncedCustomerPhone],
    queryFn: async () => {
      if (debouncedCustomerPhone.length < 3) return [];
      const { data } = await axios.get(`/api/subpos/customers?search=${debouncedCustomerPhone}`, { headers });
      return data.data;
    },
    enabled: debouncedCustomerPhone.length >= 3,
  });

  const fetchTodayCount = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/subpos/tokens-today', { headers });
      setTodayCount(data.data.count);
    } catch {}
  }, [authToken]);

  useEffect(() => { fetchTodayCount(); }, [fetchTodayCount]);

  const lookupToken = async () => {
    if (!lookupInput.trim()) return;
    try {
      const isNum = /^\d+$/.test(lookupInput.trim());
      const body = isNum ? { tokenNumber: Number(lookupInput.trim()) } : { qrCode: lookupInput.trim() };
      const { data } = await subposApi.post('/token/lookup', body);
      setLoadedToken(data.data);
      toast.success(`Token #${data.data.tokenNumber} loaded`);
      setLookupInput('');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Token not found');
    }
  };

  const isAppendingRef = useRef(false);

  // ── Global Keyboard Shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Create Token with F12 OR Ctrl+Enter
      if (e.key === 'F12' || (e.ctrlKey && e.key === 'Enter')) {
        e.preventDefault();
        const pending = document.getElementById('btn-create-token');
        if (pending && !pending.hasAttribute('disabled')) {
          pending.click();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── Create token mutation ──
  const createToken = useMutation({
    mutationFn: async () => {
      if (!loadedToken) {
        const { data } = await axios.post('/api/subpos/token/create', {
          items: billItems.map(i => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
          customerName: customerName || undefined,
          customerPhone: customerPhone || undefined,
        }, { headers });
        return data.data as TokenResult;
      } else {
        if (billItems.length === 0) throw new Error('No items to add');
        // append each item to existing token
        for (const it of billItems) {
          await axios.post(`/api/subpos/token/${loadedToken.qrCode}/items`, { menuItemId: it.menuItemId, quantity: it.quantity }, { headers });
        }
        // fetch updated token and shape into TokenResult
        const { data } = await axios.get(`/api/subpos/token/${loadedToken.qrCode}`, { headers });
        const t = data.data;
        const tokenResult: TokenResult = {
          tokenId: t.id,
          tokenNumber: t.tokenNumber,
          qrCode: t.qrCode,
          qrUrl: `/token/${t.qrCode}`,
          token: {
            subtotal: Number(t.subtotal ?? 0),
            sgst: Number(t.sgst ?? 0),
            cgst: Number(t.cgst ?? 0),
            igst: Number(t.igst ?? 0),
            total: Number(t.total ?? 0),
          },
        };
        return tokenResult;
      }
    },
    onSuccess: (result) => {
      setLastToken(result);
      setShowPrintPreview(true);
      printTokenSlip(result, billItems, customerName, customerPhone);
      setBillItems([]);
      setCustomerName('');
      setCustomerPhone('');
      // increment only when creating new token
      if (!isAppendingRef.current) setTodayCount((c) => c + 1);
      // reset loaded token (ready for next customer)
      setLoadedToken(null);
      isAppendingRef.current = false;
      toast.success(`Token #${result.tokenNumber} created!`);
      searchRef.current?.focus();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to create token'),
  });

  // ── Filtered items ──
  const filteredItems = items.filter((item) => {
    const matchCat = selectedCategoryId === null || item.categoryId === selectedCategoryId;
    const matchSearch = !searchQuery || 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      item.productQR === searchQuery ||
      String(item.id) === searchQuery;
    return matchCat && matchSearch;
  });

  // ── Barcode Match Logic ──
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Try to find exact match by QR or ID first
      const exactMatch = items.find(i => i.productQR === searchQuery || String(i.id) === searchQuery);
      if (exactMatch) {
        addItem(exactMatch);
        setSearchQuery('');
        toast.success(`Scanned: ${exactMatch.name}`, { duration: 800, icon: '🏷️' });
      } else if (filteredItems.length === 1) {
        addItem(filteredItems[0]);
        setSearchQuery('');
      } else if (searchQuery.trim().length > 0) {
        toast.error('Item not found for barcode');
        setSearchQuery('');
      }
    }
  };

  // ── Bill helpers ──
  const addItem = (item: MenuItem) => {
    setBillItems((prev) => {
      const existing = prev.find((i) => i.menuItemId === item.id);
      if (existing) return prev.map((i) => i.menuItemId === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { menuItemId: item.id, name: item.name, price: Number(item.price), quantity: 1 }];
    });
  };
  const removeItem = (menuItemId: number) =>
    setBillItems((prev) => prev.filter((i) => i.menuItemId !== menuItemId));
  const changeQty = (menuItemId: number, delta: number) =>
    setBillItems((prev) => prev.map((i) =>
      i.menuItemId === menuItemId ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i
    ));

  const subtotal = billItems.reduce((s, i) => s + i.price * i.quantity, 0);

  return (
    <div style={{ height: 'calc(var(--vh, 1vh)*100)' }} className="flex flex-col overflow-hidden bg-[#0f1014]">
      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#1a1c23] border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-bold text-white text-lg tracking-tight">{terminal?.name ?? 'Sub POS Terminal'}</span>
          <span className="text-gray-700 text-lg">|</span>
          <span className="text-gray-400 text-sm font-medium">Tokens Today: <strong className="text-[#7c5cfc] font-black">{todayCount}</strong></span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-500 text-sm hidden sm:inline font-medium">{new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}</span>
          <button onClick={logout} className="flex items-center gap-1.5 text-gray-400 hover:text-white transition text-sm bg-gray-800/50 hover:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700/50">
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </div>

      {/* ── Main Area ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── LEFT: Item Grid ── */}
        <div className="flex flex-col w-3/5 border-r border-gray-800 overflow-hidden">
          {/* Search */}
          <div className="p-3 border-b border-gray-800 flex-shrink-0 bg-[#0f1014]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onKeyDown={handleSearchKeyDown}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search items or scan barcode..."
                className="w-full pl-9 pr-4 py-3 bg-[#1a1c23] border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#7c5cfc] focus:border-transparent text-sm transition-all shadow-inner"
                autoFocus
              />
            </div>
          </div>

          {/* Category tabs */}
          <div className="flex gap-2 p-3 overflow-x-auto flex-shrink-0 border-b border-gray-800 bg-[#0f1014] scrollbar-hide">
            <button
              onClick={() => setSelectedCategoryId(null)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all border",
                selectedCategoryId === null 
                  ? "bg-[#7c5cfc]/10 text-[#7c5cfc] border-[#7c5cfc]/30 shadow-[0_0_15px_rgba(124,92,252,0.15)]" 
                  : "bg-[#1a1c23] text-gray-400 border-gray-800 hover:bg-gray-800 hover:text-gray-300"
              )}
            >
              All Items
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all border",
                  selectedCategoryId === cat.id 
                    ? "bg-[#7c5cfc]/10 text-[#7c5cfc] border-[#7c5cfc]/30 shadow-[0_0_15px_rgba(124,92,252,0.15)]" 
                    : "bg-[#1a1c23] text-gray-400 border-gray-800 hover:bg-gray-800 hover:text-gray-300"
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Items grid */}
          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 bg-[#0f1014] content-start">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                onClick={() => addItem(item)}
                className="flex flex-col bg-[#1a1c23] rounded-xl overflow-hidden border border-gray-800 hover:border-gray-600 transition-all group scale-100 active:scale-95 shadow-lg"
              >
                <div className="relative aspect-auto h-32 w-full bg-[#0f1014]">
                  <img 
                      src={item.image ? (item.image.startsWith('http') ? item.image : `${SERVER_URL}${item.image}`) : `https://ui-avatars.com/api/?name=${item.name}&background=1a1c23&color=fff`} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                      alt={item.name} 
                  />
                  {item.isVeg !== undefined && (
                     <div className="absolute top-2 right-2 p-1 bg-black/50 backdrop-blur-md rounded border border-white/10">
                        <div className={cn("w-2 h-2 rounded-full", item.isVeg ? "bg-green-500" : "bg-red-500")} />
                     </div>
                  )}
                </div>
                <div className="p-3 text-left w-full">
                  <h4 className="text-[11px] font-bold text-gray-200 uppercase truncate mb-1">{item.name}</h4>
                  <span className="text-sm font-black text-[#7c5cfc] tracking-tight">{formatCurrency(item.price)}</span>
                </div>
              </button>
            ))}
            {filteredItems.length === 0 && (
              <div className="col-span-full text-center text-gray-500 py-16 flex flex-col items-center">
                <Search className="w-12 h-12 text-gray-700 mb-4 opacity-50" />
                <p className="text-lg font-medium">No items found</p>
                <p className="text-sm">Try assigning items to this Sub POS category.</p>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Bill Panel ── */}
        <div className="flex flex-col w-2/5 overflow-hidden bg-[#121318]">
          {/* Bill header */}
          <div className="px-5 py-4 border-b border-gray-800 flex-shrink-0 bg-[#1a1c23] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#7c5cfc]/20 flex items-center justify-center">
                <Hash className="w-4 h-4 text-[#7c5cfc]" />
              </div>
              <div>
                 <p className="text-white font-bold text-sm leading-none">Token Order</p>
                 <p className="text-[10px] text-gray-400 mt-1">Ready for generation</p>
              </div>
            </div>
            <span className="px-2.5 py-1 bg-gray-800 text-gray-300 text-[10px] font-bold uppercase rounded-md border border-gray-700 tracking-wider">
               {billItems.length} ITEMS
            </span>
          </div>

          {/* Bill items */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
            {billItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-600 pb-10">
                <div className="w-16 h-16 rounded-2xl bg-gray-800/30 flex items-center justify-center mb-4 border border-gray-800/50">
                   <LayoutGrid className="w-8 h-8 text-gray-700" />
                </div>
                <p className="font-semibold text-sm text-gray-500">Cart is empty</p>
                <p className="text-xs text-gray-600 mt-1.5 max-w-[200px]">Tap items from the left grid or scan barcodes</p>
              </div>
            ) : (
                billItems.map((item) => (
                  <div key={item.menuItemId} className="flex flex-col gap-2 bg-[#1a1c23] rounded-xl px-4 py-3 border border-gray-800 hover:border-gray-700 transition">
                    <div className="flex items-start justify-between">
                       <div className="flex-1 pr-3 flex items-center gap-3">
                         <img
                           src={(() => { const mi = items.find(it => it.id === item.menuItemId); const img = mi?.image; return img ? (img.startsWith('http') ? img : `${SERVER_URL}${img}`) : `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=1a1c23&color=fff`; })()}
                           alt={item.name}
                           className="w-12 h-12 rounded-md object-cover flex-shrink-0"
                         />
                         <div>
                           <div className="text-gray-100 text-[13px] font-bold leading-snug">{item.name}</div>
                           <div className="text-gray-500 text-[11px] font-medium mt-0.5">{formatCurrency(item.price)} each</div>
                         </div>
                       </div>
                       <button onClick={() => removeItem(item.menuItemId)} className="text-gray-600 hover:text-red-400 p-1 rounded-md transition flex-shrink-0">
                         ✕
                       </button>
                    </div>
                    
                    <div className="flex items-center justify-between mt-1">
                        <div className="flex items-center gap-1.5 bg-[#0f1014] rounded-lg p-1 border border-gray-800">
                          <button onClick={() => changeQty(item.menuItemId, -1)} className="w-8 h-8 bg-gray-800 hover:bg-gray-700 rounded-md text-gray-300 flex items-center justify-center transition active:scale-95">
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-white font-black text-sm w-7 text-center">{item.quantity}</span>
                          <button onClick={() => changeQty(item.menuItemId, 1)} className="w-8 h-8 bg-gray-800 hover:bg-gray-700 rounded-md text-gray-300 flex items-center justify-center transition active:scale-95">
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="text-white font-black text-[15px] tabular-nums tracking-tight">
                           {formatCurrency(item.price * item.quantity)}
                        </div>
                    </div>
                  </div>
                ))
            )}
          </div>

          {/* Totals + Customer + CTA */}
          <div className="flex-shrink-0 border-t border-gray-800 p-4 space-y-4 bg-[#1a1c23]">
            {/* Quick totals */}
            <div className="space-y-1">
              <div className="flex justify-between text-sm text-gray-400 font-medium px-1">
                <span>Subtotal Items</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-white font-black text-xl pt-2 pb-1 px-1 border-t border-gray-800 mt-2">
                <span>Total Due</span>
                <span className="text-[#7c5cfc] tracking-tight">{formatCurrency(subtotal)}</span>
              </div>
            </div>

            {/* Customer info */}
            <div className="flex gap-2 relative">
              <div className="relative flex-1">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Cust Name (Opt)"
                  className="w-full pl-9 pr-3 py-2.5 bg-[#0f1014] border border-gray-800 rounded-xl text-white placeholder-gray-600 text-[13px] focus:outline-none focus:ring-1 focus:ring-[#7c5cfc] transition"
                />
              </div>
              <div className="relative flex-1">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="tel"
                  value={customerPhone}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                  onChange={(e) => { setCustomerPhone(e.target.value); setShowCustomerDropdown(true); }}
                  placeholder="Phone (Opt)"
                  className="w-full pl-9 pr-3 py-2.5 bg-[#0f1014] border border-gray-800 rounded-xl text-white placeholder-gray-600 text-[13px] focus:outline-none focus:ring-1 focus:ring-[#7c5cfc] transition"
                />
                
                {showCustomerDropdown && customerSuggestions.length > 0 && (
                  <div className="absolute top-full right-0 mt-2 w-64 bg-[#1a1c23] border border-gray-800 rounded-xl z-50 shadow-2xl overflow-hidden">
                    {customerSuggestions.map((c: any) => (
                      <button
                        key={c.id}
                        onMouseDown={(e) => {
                          e.preventDefault(); // Prevent onBlur from hiding
                          setCustomerPhone(c.phone || '');
                          setCustomerName(c.name || '');
                          setShowCustomerDropdown(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-800 flex justify-between items-center transition-colors border-b border-gray-800/50 last:border-0"
                      >
                        <div>
                          <div className="text-sm font-bold text-white">{c.name || 'Unknown'}</div>
                          <div className="text-xs text-gray-400 font-medium">{c.phone}</div>
                        </div>
                        {c.loyaltyPoints > 0 && (
                          <div className="text-[10px] font-bold bg-[#7c5cfc]/20 text-[#7c5cfc] px-2 py-1 rounded">
                            {c.loyaltyPoints} pts
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Create Token button */}
            <button
              id="btn-create-token"
              onClick={() => createToken.mutate()}
              disabled={billItems.length === 0 || createToken.isPending}
              className="w-full py-4 bg-[#7c5cfc] hover:bg-[#6b4ce6] disabled:bg-gray-800/50 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-black text-[15px] uppercase tracking-wider rounded-xl transition-all duration-200 shadow-[0_4px_20px_rgba(124,92,252,0.3)] disabled:shadow-none flex items-center justify-center gap-2 group border border-[#7c5cfc]/20 disabled:border-transparent"
            >
              {createToken.isPending ? (
                <><span className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" /> CREATING...</>
              ) : (
                <><Printer className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" /> GENERATE TOKEN <span className="text-[10px] font-bold opacity-60 bg-black/20 px-1.5 py-0.5 rounded ml-1 normal-case">(F12)</span></>
              )}
            </button>

            {/* Reprint last token */}
            {lastToken && (
               <div className="pt-2">
                 <button
                   onClick={() => { if (lastToken) printTokenSlip(lastToken, [], customerName); }}
                   className="w-full py-2.5 border border-gray-800 text-gray-400 hover:text-white hover:border-gray-600 hover:bg-gray-800/50 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2"
                 >
                   <RefreshCw className="w-3.5 h-3.5" /> Reprint Last Token (#{lastToken.tokenNumber})
                 </button>
               </div>
            )}
          </div>
        </div>
      </div>

      {/* Print preview modal (auto-closes after print) */}
      {showPrintPreview && lastToken && (
        <div className="fixed inset-0 bg-[#0f1014]/80 backdrop-blur-md flex items-center justify-center z-[100] no-print" onClick={() => setShowPrintPreview(false)}>
          <div className="bg-[#1a1c23] rounded-3xl p-8 text-center max-w-sm w-full mx-4 shadow-2xl border border-gray-800 transform animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-[#7c5cfc]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Printer className="w-8 h-8 text-[#7c5cfc]" />
            </div>
            <div className="text-7xl font-black text-white mb-1 tracking-tighter">{lastToken.tokenNumber}</div>
            <p className="text-[#7c5cfc] text-sm font-bold uppercase tracking-widest mb-6">Token Printed</p>
            <button
              onClick={() => setShowPrintPreview(false)}
              className="w-full py-3.5 bg-gray-800 text-white rounded-xl font-bold hover:bg-gray-700 border border-gray-700 transition active:scale-95"
            >
              Ready for Next Customer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
