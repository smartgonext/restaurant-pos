import { useState, useEffect, useMemo, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useMainposStore } from '@/stores/mainposStore';
import { useAuthStore } from '@/stores/authStore';
import { useSocket } from '@/hooks/useSocket';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Search, CreditCard, Banknote, Smartphone, LogOut,
  Trash2, Edit, CheckCircle, ChevronLeft,
  History as HistoryIcon, Tag, RefreshCw, Wallet, Printer,
  AlignLeft, LayoutGrid, RotateCcw, ChevronDown, ShoppingCart
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';

const SERVER_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

// Axios instance that injects Main POS JWT
const posApi = (token: string | null) => axios.create({
  baseURL: '/api/mainpos',
  headers: token ? { Authorization: `Bearer ${token}` } : {},
});

interface MenuItem { id: number; name: string; price: number; categoryId: number | null; image: string | null; isVeg: boolean | null; productQR?: string; }
interface Category { id: number; name: string; }
interface TokenItem {
  id: number; menuItemId: number; menuItemName: string; price: number; quantity: number; total: number;
  addedBy: string; isRemoved: boolean; removedBy?: string; removeReason?: string;
}
interface TokenData {
  id: number; tokenNumber: number; qrCode: string; status: string;
  customerName?: string; customerPhone?: string;
  subtotal: number; sgst: number; cgst: number; igst: number; total: number;
  discountApplied: number; loyaltyPointsEarned: number; loyaltyPointsClaimed: number;
  items: TokenItem[]; payments: { id: number; method: string; amount: number; paidAt: string }[];
  edits: { id: number; action: string; menuItemName: string; oldValue?: string; newValue?: string; reason: string; staffUsername: string; createdAt: string }[];
  customer?: { id: number; name: string; phone?: string; loyaltyPoints: number };
}

interface LocalCartItem {
  id: string;
  menuItemId: number;
  name: string;
  price: number;
  quantity: number;
}

// ── Print final bill helper ───────────────────────────────────────────────────
function printFinalBill(token: TokenData, bakeryName = 'TableTrack Bakery') {
  const win = window.open('', '_blank', 'width=400,height=700');
  if (!win) return;
  const activeItems = token.items.filter(i => !i.isRemoved);
  const itemRows = activeItems.map(i =>
    `<tr><td>${i.menuItemName}</td><td style="text-align:center">${i.quantity}</td><td style="text-align:right">₹${Number(i.total).toFixed(2)}</td></tr>`
  ).join('');
  
  win.document.write(`
    <!DOCTYPE html><html><head><title>Receipt ${token.tokenNumber}</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: 'Courier New', monospace; background:#fff; color:#000; padding:12px; }
      .center { text-align:center; }
      table { width:100%; border-collapse:collapse; margin:8px 0; font-size:10pt; }
      td { padding:3px 0; }
      .divider { border-top:1px dashed #000; margin:8px 0; }
      .total { font-weight:700; font-size:14pt; }
      @media print { .no-print { display:none!important; } }
    </style></head><body>
    <div class="center">
      <div style="font-size:16pt;font-weight:700;">${bakeryName}</div>
      <div style="font-size:10pt;color:#555;">${new Date().toLocaleString('en-IN')}</div>
      <div style="font-size:11pt;font-weight:600;margin-top:8px;">TAX INVOICE</div>
      <div>Token #${token.tokenNumber}</div>
    </div>
    <div class="divider"></div>
    ${token.customerName ? `<div style="font-size:10pt;">Bill To: ${token.customerName} ${token.customerPhone ? `(${token.customerPhone})` : ''}</div><div class="divider"></div>` : ''}
    <table>
      <tr style="border-bottom:1px solid #000;font-weight:600;"><td>Item</td><td style="text-align:center">Qty</td><td style="text-align:right">Total</td></tr>
      ${itemRows}
    </table>
    <div class="divider"></div>
    <table style="font-size:10pt;">
      <tr><td>Subtotal</td><td style="text-align:right">₹${Number(token.subtotal).toFixed(2)}</td></tr>
      ${Number(token.sgst) > 0 ? `<tr><td>SGST</td><td style="text-align:right">₹${Number(token.sgst).toFixed(2)}</td></tr>
      <tr><td>CGST</td><td style="text-align:right">₹${Number(token.cgst).toFixed(2)}</td></tr>` : ''}
      ${Number(token.igst) > 0 ? `<tr><td>IGST</td><td style="text-align:right">₹${Number(token.igst).toFixed(2)}</td></tr>` : ''}
      ${Number(token.discountApplied) > 0 ? `<tr><td>Loyalty Discount</td><td style="text-align:right;color:green;">-₹${Number(token.discountApplied).toFixed(2)}</td></tr>` : ''}
    </table>
    <div class="divider"></div>
    <div class="total center">TOTAL: ₹${Number(token.total).toFixed(2)}</div>
    <div class="divider"></div>
    <div class="center" style="font-size:9pt;color:#555;">
      Thank You & Visit Again!<br/>
      ${token.loyaltyPointsEarned > 0 ? `<strong>🏆 You earned ${token.loyaltyPointsEarned} points!</strong>` : ''}
    </div>
    <script>window.onload=()=>{window.print();window.close();}</script>
    </body></html>
  `);
  win.document.close();
}

// ── Print a small token slip with QR code and token number ──────────────────
function printTokenSlip(token: TokenData) {
  try {
    const win = window.open('', '_blank', 'width=300,height=420');
    if (!win) return;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(token.qrCode)}`;
    win.document.write(`
      <!doctype html><html><head><meta charset="utf-8"><title>Token ${token.tokenNumber}</title>
      <style>body{font-family:Arial,Helvetica,sans-serif;padding:12px;text-align:center;color:#000} .num{font-size:18px;font-weight:700;margin:12px 0} img{width:180px;height:180px;object-fit:contain}</style>
      </head><body>
        <div style="font-size:14pt;font-weight:700;">Token #${token.tokenNumber}</div>
        <div style="margin:10px 0"><img src="${qrUrl}" alt="QR"/></div>
        <div style="font-size:10pt;color:#555">Scan to retrieve order</div>
        <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),600);}</script>
      </body></html>
    `);
    win.document.close();
  } catch (err) {
    console.error('Print token failed', err);
  }
}

// ── Password modal for delete/edit ────────────────────────────────────────────
function PasswordModal({ onConfirm, onCancel, action }: {
  onConfirm: (password: string, reason: string) => void;
  onCancel: () => void;
  action: 'delete' | 'edit';
}) {
  const [pwd, setPwd] = useState('');
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]">
      <div className="bg-[#1a1c23] rounded-2xl p-6 w-full max-w-sm mx-4 border border-gray-800 shadow-2xl">
        <h3 className="text-white font-bold text-lg mb-4">
          {action === 'delete' ? '🗑 Delete Item' : '✏️ Edit Quantity'} — Enter Admin Password
        </h3>
        <input
          type="password" autoFocus value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          placeholder="Admin Password"
          className="w-full px-4 py-2.5 bg-[#0f1014] border border-gray-800 rounded-xl text-white placeholder-gray-500 mb-3 focus:outline-none focus:border-purple-500 transition-colors"
        />
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required)"
          rows={2}
          className="w-full px-4 py-2.5 bg-[#0f1014] border border-gray-800 rounded-xl text-white placeholder-gray-500 mb-4 resize-none focus:outline-none focus:border-purple-500 text-sm transition-colors"
        />
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 border border-gray-700 text-gray-400 rounded-xl hover:bg-gray-800 transition">Cancel</button>
          <button
            onClick={() => { if (!pwd || !reason) { toast.error('Password and reason required'); return; } onConfirm(pwd, reason); }}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition"
          >Confirm</button>
        </div>
      </div>
    </div>
  );
}

// ── Loyalty claim modal ───────────────────────────────────────────────────────
function LoyaltyModal({ customer, pointValue = 0.5, onApply, onCancel }: {
  customer: TokenData['customer'];
  pointValue?: number;
  onApply: (points: number) => void;
  onCancel: () => void;
}) {
  const available = customer?.loyaltyPoints ?? 0;
  const [points, setPoints] = useState(available);
  const discount = (points * pointValue).toFixed(2);
  if (!customer) return null;
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]">
      <div className="bg-[#1a1c23] rounded-2xl p-6 w-full max-w-sm mx-4 border border-gray-800 shadow-2xl">
        <h3 className="text-white font-bold text-lg mb-1">🏆 Claim Loyalty Points</h3>
        <p className="text-gray-400 text-sm mb-4">{customer.name} · Available: <strong className="text-green-400">{available} pts</strong></p>
        <div className="mb-4">
          <label className="text-gray-400 text-sm block mb-1">Points to claim</label>
          <input
            type="number" min={0} max={available} value={points}
            onChange={(e) => setPoints(Math.min(available, Math.max(0, +e.target.value)))}
            className="w-full px-4 py-2.5 bg-[#0f1014] border border-gray-800 rounded-xl text-white focus:outline-none focus:border-purple-500 transition-colors"
          />
        </div>
        <div className="bg-green-900/30 border border-green-700/50 rounded-xl p-3 mb-4 text-center">
          <span className="text-green-400 text-lg font-bold">₹{discount} discount</span>
          <span className="text-gray-400 text-sm block">will be applied to this bill</span>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 border border-gray-700 text-gray-400 rounded-xl hover:bg-gray-800 transition">Cancel</button>
          <button onClick={() => onApply(points)} disabled={points <= 0} className="flex-1 py-2.5 bg-green-600/80 hover:bg-green-600 text-white font-bold rounded-xl transition disabled:opacity-50">Apply</button>
        </div>
      </div>
    </div>
  );
}

export default function MainPOSTerminal() {
  const { isAuthenticated, terminal, token: authToken, logout } = useMainposStore();
  const { socket } = useSocket();
  const { user } = useAuthStore();

  const [lookupInput, setLookupInput] = useState('');
  const [currentToken, setCurrentToken] = useState<TokenData | null>(null);
  const [localCart, setLocalCart] = useState<LocalCartItem[]>([]);
  const displayWindowRef = useRef<Window | null>(null);
  const isPresentingRef = useRef(false);
  const presentDebounceTimer = useRef<number | null>(null);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const debouncedCustomerPhone = useDebounce(customerPhone, 500);

  // Menu View State
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  // Modals
  const [deleteModal, setDeleteModal] = useState<{ itemId: number; name: string } | null>(null);
  const [editModal, setEditModal] = useState<{ itemId: number; name: string; qty: number } | null>(null);
  const [loyaltyModal, setLoyaltyModal] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paidSuccess, setPaidSuccess] = useState(false);

  if (!isAuthenticated) return <Navigate to="/mainpos" replace />;

  const api = posApi(authToken);

  // Fetch items and categories
  const { data: allItems = [] } = useQuery<MenuItem[]>({
    queryKey: ['mainpos-items'],
    queryFn: async () => {
      const { data } = await api.get('/items');
      return data.data;
    },
  });
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['mainpos-categories'],
    queryFn: async () => {
      const { data } = await api.get('/categories');
      return data.data;
    },
  });

  const { data: loyaltyConfig } = useQuery({
    queryKey: ['mainpos-loyalty-config'],
    queryFn: async () => {
      const { data } = await api.get('/loyalty-config');
      return data.data;
    },
  });

  const { data: customerSuggestions = [] } = useQuery({
    queryKey: ['mainpos-customers', debouncedCustomerPhone],
    queryFn: async () => {
      if (debouncedCustomerPhone.length < 3) return [];
      const { data } = await api.get(`/customers?search=${debouncedCustomerPhone}`);
      return data.data;
    },
    enabled: debouncedCustomerPhone.length >= 3,
  });

  // Restaurant settings (used to compute tax rates for local cart preview)
  const { data: restaurantSettings } = useQuery({
    queryKey: ['restaurant-settings'],
    queryFn: async () => {
      const { data } = await axios.get('/api/restaurant/settings');
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
  });

  const filteredItems = useMemo(() => {
    return allItems.filter(item => {
      const matchCat = activeCategory === 'all' || item.categoryId === parseInt(activeCategory);
      const matchSearch = item.name.toLowerCase().includes(search.toLowerCase()) || 
        (item.productQR && item.productQR === search);
      return matchCat && matchSearch;
    });
  }, [allItems, activeCategory, search]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const exactMatch = allItems.find(i => i.productQR === search || String(i.id) === search);
      if (exactMatch) {
         handleAddToCart(exactMatch);
         setSearch('');
         toast.success(`Scanned: ${exactMatch.name}`, { duration: 800, icon: '🏷️' });
      } else if (filteredItems.length === 1) {
         handleAddToCart(filteredItems[0]);
         setSearch('');
      } else if (search.trim().length > 0) {
         toast.error('Item not found for scanning');
         setSearch('');
      }
    }
  };

  const saveToken = async () => {
    if (localCart.length === 0) {
      toast.error('No items to save');
      return;
    }
    if (currentToken?.status === 'paid') {
      toast.error('Cannot add items to a paid token');
      return;
    }
    setIsSubmitting(true);
    try {
      const itemsPayload = localCart.map(i => ({ menuItemId: i.menuItemId, quantity: i.quantity }));
      if (!currentToken) {
        await createTokenMut.mutateAsync({ items: itemsPayload, customerName: customerName || undefined, customerPhone: customerPhone || undefined });
      } else {
        await addItemsMut.mutateAsync({ qr: currentToken.qrCode, items: itemsPayload });
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to save token');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Present Bill to Customer Display ──
  const presentToCustomer = async () => {
    if (!currentToken && localCart.length === 0) {
      toast.error('No bill to present');
      return;
    }
    const tokenNum = currentToken?.tokenNumber;
    // Open Customer Display (with token param if saved token)
    const displayUrl = tokenNum ? `${window.location.origin}/admin/customer-display?token=${tokenNum}` : `${window.location.origin}/admin/customer-display`;
    const displayWindow = window.open(displayUrl, 'CustomerDisplay', 'width=1920,height=1080,menubar=no,toolbar=no,location=no');
    if (!displayWindow) {
      toast.error('Failed to open customer display. Check popup blocker.');
      return;
    }

    // keep a reference to the opened window so we can detect close
    displayWindowRef.current = displayWindow;

    // If we have a saved token, notify server to broadcast saved token
    if (currentToken) {
      try {
        await api.post(`/token/${currentToken.qrCode}/present`);
        toast.success(`Bill #${tokenNum} presented on customer display`, { duration: 2000 });
      } catch (err: any) {
        console.error('Present to customer failed', err);
        toast.error('Failed to notify customer displays');
      }
      isPresentingRef.current = true;
      return;
    }

    // Ephemeral presentation: send current localCart to displays via socket or fallback API
    const mappedItems = localCart.map(i => {
      const mi = allItems.find(ai => ai.id === i.menuItemId);
      const rawImage = mi?.image || undefined;
      const image = rawImage ? (rawImage.startsWith('http') ? rawImage : `${SERVER_URL}${rawImage}`) : `https://ui-avatars.com/api/?name=${encodeURIComponent(i.name.charAt(0) || 'A')}&background=1a1c23&color=fff`;
      return { menuItemId: i.menuItemId, name: i.name, price: i.price, quantity: i.quantity, image };
    });
    const subtotal = mappedItems.reduce((s, it) => s + (it.price * it.quantity), 0);
    const payload = { restaurantId: user?.restaurant?.id, items: mappedItems, subtotal, total: subtotal };
    try {
      if (socket) {
        socket.emit('customer_display_update', payload);
      } else {
        await api.post('/token/present', payload);
      }
      toast.success('Presented live cart to customer display', { duration: 2000 });
      isPresentingRef.current = true;
    } catch (err: any) {
      console.error('Present ephemeral failed', err);
      toast.error('Failed to present live cart');
    }
  };

  // ── Handlers ──
  const lookupToken = async () => {
    if (!lookupInput.trim()) return;
    try {
      const isNum = /^\d+$/.test(lookupInput.trim());
      const body = isNum ? { tokenNumber: Number(lookupInput) } : { qrCode: lookupInput.trim() };
      const { data } = await api.post('/token/lookup', body);
      setCurrentToken(data.data);
      if (data.data.customerName) setCustomerName(data.data.customerName);
      if (data.data.customerPhone) setCustomerPhone(data.data.customerPhone);
      setLookupInput('');
      toast.success(`Token #${data.data.tokenNumber} loaded`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Token not found');
    }
  };

  const clearToken = () => {
    setCurrentToken(null);
    setLocalCart([]);
    setCustomerName('');
    setCustomerPhone('');
  };

  const handleAddToCart = (item: MenuItem) => {
    setLocalCart(prev => {
      const existing = prev.find(p => p.menuItemId === item.id);
      if (existing) {
        return prev.map(p => p.menuItemId === item.id ? { ...p, quantity: p.quantity + 1 } : p);
      }
      return [...prev, { id: Math.random().toString(36).substr(2, 9), menuItemId: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
    toast.success(`Added ${item.name}`, { duration: 1000 });
  };

  const updateLocalQty = (id: string, delta: number) => {
    setLocalCart(prev => prev.map(p => p.id === id ? { ...p, quantity: Math.max(1, p.quantity + delta) } : p));
  };

  const removeLocalItem = (id: string) => {
    setLocalCart(prev => prev.filter(p => p.id !== id));
  };

  // When presenting an ephemeral cart, emit live updates (debounced) while the display window is open
  useEffect(() => {
    if (!isPresentingRef.current) return;
    // debounce
    if (presentDebounceTimer.current) {
      window.clearTimeout(presentDebounceTimer.current as number);
    }
    presentDebounceTimer.current = window.setTimeout(() => {
      const mappedItems = localCart.map(i => ({ menuItemId: i.menuItemId, name: i.name, price: i.price, quantity: i.quantity }));
      const subtotal = mappedItems.reduce((s, it) => s + (it.price * it.quantity), 0);
      const payload = { restaurantId: user?.restaurant?.id, items: mappedItems, subtotal, total: subtotal };
      try {
        if (socket) {
          socket.emit('customer_display_update', payload);
        } else {
          // best-effort fallback to HTTP
          api.post('/token/present', payload).catch(() => {});
        }
      } catch (e) {
        // ignore
      }
    }, 300) as unknown as number;

    return () => {
      if (presentDebounceTimer.current) {
        window.clearTimeout(presentDebounceTimer.current as number);
        presentDebounceTimer.current = null;
      }
    };
  }, [localCart]);

  // Monitor the opened display window; stop presenting when it's closed
  useEffect(() => {
    const id = window.setInterval(() => {
      try {
        if (displayWindowRef.current && displayWindowRef.current.closed) {
          isPresentingRef.current = false;
          displayWindowRef.current = null;
        }
      } catch (e) {
        // ignore cross-origin access errors
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Existing Token Mutations ──
  const deleteItemMut = useMutation({
    mutationFn: async ({ itemId, adminPassword, reason }: { itemId: number; adminPassword: string; reason: string }) => {
      const { data } = await api.delete(`/token/${currentToken!.qrCode}/items/${itemId}`, { data: { adminPassword, reason } });
      return data.data;
    },
    onSuccess: (data) => { setCurrentToken(data); setDeleteModal(null); toast.success('Item removed'); },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to remove item'),
  });

  const editItemMut = useMutation({
    mutationFn: async ({ itemId, quantity, adminPassword, reason }: { itemId: number; quantity: number; adminPassword: string; reason: string }) => {
      const { data } = await api.put(`/token/${currentToken!.qrCode}/items/${itemId}`, { quantity, adminPassword, reason });
      return data.data;
    },
    onSuccess: (data) => { setCurrentToken(data); setEditModal(null); toast.success('Quantity updated'); },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to update quantity'),
  });

  const loyaltyMut = useMutation({
    mutationFn: async (pointsToClaim: number) => {
      const { data } = await api.post(`/token/${currentToken!.qrCode}/loyalty/claim`, {
        customerId: currentToken!.customer!.id,
        pointsToClaim,
      });
      return data.data;
    },
    onSuccess: (data) => { setCurrentToken(data); setLoyaltyModal(false); toast.success('Loyalty discount applied!'); },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Loyalty claim failed'),
  });

  const assignCustomerMut = useMutation({
    mutationFn: async (c: { name: string, phone: string }) => {
      if (!currentToken) return null;
      const { data } = await api.post(`/token/${currentToken.qrCode}/customer`, {
        customerName: c.name, customerPhone: c.phone
      });
      return data.data;
    },
    onSuccess: (data) => {
      if (data) setCurrentToken(data);
      toast.success('Customer linked to token');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to link customer'),
  });

  const createTokenMut = useMutation({
    mutationFn: async (payload: { items: { menuItemId: number; quantity: number }[]; customerName?: string; customerPhone?: string }) => {
      const { data } = await api.post('/token/create', payload);
      return data.data;
    },
    onSuccess: (data) => {
      setCurrentToken(data);
      setLocalCart([]);
      if (data.customerName) setCustomerName(data.customerName);
      if (data.customerPhone) setCustomerPhone(data.customerPhone);
      toast.success('Token saved');
      // Print a small token slip and reset UI for next customer
      try { printTokenSlip(data); } catch (err) { console.error(err); }
      setTimeout(() => {
        setCurrentToken(null);
        setCustomerName('');
        setCustomerPhone('');
      }, 700);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to create token'),
  });

  const addItemsMut = useMutation({
    mutationFn: async (payload: { qr: string; items: { menuItemId: number; quantity: number }[] }) => {
      const { data } = await api.post(`/token/${payload.qr}/items/bulk`, { items: payload.items });
      return data.data;
    },
    onSuccess: (data) => {
      setCurrentToken(data);
      setLocalCart([]);
      toast.success('Items added to token');
      // Print token slip and reset UI for next customer
      try { printTokenSlip(data); } catch (err) { console.error(err); }
      setTimeout(() => {
        setCurrentToken(null);
        setCustomerName('');
        setCustomerPhone('');
      }, 700);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to add items to token'),
  });

  // ── Sync & Pay Flow ──
  const processPayment = async (method: string) => {
    if (!currentToken && localCart.length === 0) {
      toast.error('Cart is empty');
      return;
    }

    if (currentToken?.status === 'paid') {
      toast.success('This token is already fully paid');
      return;
    }

    setIsSubmitting(true);
    let targetQrCode = currentToken?.qrCode;

    try {
      if (!currentToken) {
        // 1. Create token from localCart
        const createRes = await api.post('/token/create', { 
          items: localCart.map(i => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
          customerName: customerName || undefined,
          customerPhone: customerPhone || undefined
        });
        targetQrCode = createRes.data.data.qrCode;
      } else if (localCart.length > 0) {
        // 2. Add local items to existing token
        await api.post(`/token/${currentToken.qrCode}/items/bulk`, { items: localCart.map(i => ({ menuItemId: i.menuItemId, quantity: i.quantity })) });
      }

      // Fetch latest token to get exact amount
      const tRes = await api.get(`/token/${targetQrCode}`);
      const latestToken = tRes.data.data;
      const totalPaid = latestToken.payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
      const remaining = Math.max(0, Number(latestToken.total) - totalPaid);

      if (remaining > 0) {
        // 3. Process Payment
        const payRes = await api.post(`/token/${targetQrCode}/payment`, { method, amount: remaining });
        const responseData = payRes.data?.data || payRes.data;

        if (responseData?.message) {
          toast.success(responseData.message);
        }

        const finalToken = responseData?.token ?? responseData;

        if (!finalToken) {
          throw new Error('Payment response missing final token data');
        }

        setCurrentToken(finalToken);
        setLocalCart([]);

        if (finalToken?.status === 'paid') {
          setPaidSuccess(true);
          printFinalBill(finalToken);
          setTimeout(() => {
            setPaidSuccess(false);
            setCurrentToken(null);
            setCustomerName('');
            setCustomerPhone('');
          }, 3000);
        } else {
          toast.success('Partial payment recorded');
        }
      } else {
         toast.success('Token is already fully paid');
         setLocalCart([]);
         setCurrentToken(latestToken);
      }
    } catch (err: any) {
      const errorMsg = err?.response?.data?.error || err?.message || 'Payment process failed';
      toast.error(errorMsg);
      console.error('MainPOS payment error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Derived State ──
  const activeTokenItems = currentToken?.items.filter(i => !i.isRemoved) ?? [];
  const removedTokenItems = currentToken?.items.filter(i => i.isRemoved) ?? [];
  
  const localCartSubtotal = localCart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const existingRemaining = currentToken 
    ? Math.max(0, Number(currentToken.total) - currentToken.payments.reduce((s, p) => s + Number(p.amount), 0))
    : 0;
  
  // Tax approximations for local cart display only (backend handles actual final tax)
  const sgst = Number(restaurantSettings?.sgstRate ?? 0);
  const cgst = Number(restaurantSettings?.cgstRate ?? 0);
  const taxRate = (sgst + cgst) / 100;
  const localCartTax = localCartSubtotal * taxRate;
  const displayTotal = currentToken 
    ? existingRemaining + localCartSubtotal + localCartTax 
    : localCartSubtotal + localCartTax;

  const isCartEmpty = activeTokenItems.length === 0 && localCart.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh)] bg-[#0f1014] text-white overflow-hidden">
      
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#1a1c23] border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <CreditCard className="w-5 h-5 text-purple-500" />
          <span className="font-bold text-gray-200 uppercase tracking-wide text-sm">{terminal?.name ?? 'MAIN POS'}</span>
        </div>
        <button onClick={logout} className="flex items-center gap-1.5 text-gray-400 hover:text-white transition text-xs font-bold uppercase">
          <LogOut className="w-4 h-4" /> Exit POS
        </button>
      </div>

      {/* Main Grid View */}
      <div className="flex flex-1 overflow-hidden p-4 gap-4">
        
        {/* LEFT COMPONENT: Search & Items */}
        <div className="flex-[2.5] flex flex-col min-h-0 bg-[#0f1014] rounded-xl">
           {/* Top Filter Bar */}
           <div className="mb-4 space-y-3">
              <div className="flex gap-3">
                 <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input 
                      type="text" 
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={handleSearchKeyDown}
                      placeholder="Search menu items or scan barcode..." 
                      className="w-full bg-[#1a1c23] border border-gray-800 rounded-md py-2.5 pl-10 pr-4 text-sm outline-none focus:border-purple-500/50 transition-all text-white placeholder-gray-500"
                    />
                 </div>
                 <div className="flex gap-1">
                    <button 
                      onClick={() => { setSearch(''); setActiveCategory('all'); }}
                      className="bg-purple-600/90 hover:bg-purple-500 text-white px-6 rounded-md text-sm font-bold flex items-center gap-2 transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" /> Reset
                    </button>
                 </div>
              </div>

              <div className="relative inline-block w-full max-w-[220px]">
                 <button onClick={() => setShowCategoryDropdown(!showCategoryDropdown)} className="w-full bg-[#1a1c23] border border-gray-800 rounded-md py-2.5 px-3 text-xs font-bold text-left flex justify-between items-center text-gray-400 hover:border-gray-700 transition-all">
                    <div className="flex items-center gap-2">
                       <LayoutGrid className="w-3.5 h-3.5" /> Filter by Category
                    </div>
                    <ChevronDown className="w-4 h-4" />
                 </button>
                 {showCategoryDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1c23] border border-gray-800 rounded-md z-20 max-h-60 overflow-y-auto custom-scrollbar shadow-xl">
                       <button onClick={() => { setActiveCategory('all'); setShowCategoryDropdown(false); }} className={cn("w-full text-left px-3 py-2.5 text-xs font-bold transition-all", activeCategory === 'all' ? 'bg-purple-500/20 text-purple-400' : 'text-gray-400 hover:bg-gray-800')}>
                          All Items
                       </button>
                       {categories.map((cat: any) => (
                          <button key={cat.id} onClick={() => { setActiveCategory(cat.id.toString()); setShowCategoryDropdown(false); }} className={cn("w-full text-left px-3 py-2.5 text-xs font-bold transition-all", activeCategory === cat.id.toString() ? 'bg-purple-500/20 text-purple-400' : 'text-gray-400 hover:bg-gray-800')}>
                             {cat.name}
                          </button>
                       ))}
                    </div>
                 )}
              </div>
           </div>

           {/* Items Grid */}
           <div className="flex-1 overflow-y-auto custom-scrollbar pb-6 rounded-md pr-1">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6 gap-3">
                 {filteredItems.map(item => (
                    <button 
                       key={item.id}
                       onClick={() => handleAddToCart(item)}
                       disabled={currentToken?.status === 'paid'}
                       className="flex flex-col bg-[#1a1c23] rounded-lg overflow-hidden border border-gray-800 hover:border-gray-600 transition-all group scale-100 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                    >
                       <div className="relative aspect-square w-full bg-[#14151a]">
                          <img 
                            src={item.image ? (item.image.startsWith('http') ? item.image : `${SERVER_URL}${item.image}`) : `https://ui-avatars.com/api/?name=${item.name.charAt(0)}&background=1a1c23&color=fff`}
                            className="w-full h-full object-cover transition-all"
                            alt={item.name}
                          />
                          <div className="absolute top-2 right-2 flex gap-1">
                             <div className={cn("w-3.5 h-3.5 rounded-sm border border-white/20 flex items-center justify-center bg-white/10", item.isVeg ? "text-green-500" : "text-red-500")}>
                                <div className="w-1.5 h-1.5 rounded-full bg-current" />
                             </div>
                          </div>
                       </div>
                       <div className="p-3 text-left w-full relative before:absolute before:inset-0 before:bg-gradient-to-t before:from-[#1a1c23] before:to-transparent before:opacity-0 group-hover:before:opacity-100 transition-opacity">
                          <h4 className="text-[11px] font-bold text-white uppercase truncate mb-1 relative z-10">{item.name}</h4>
                          <span className="text-xs font-black text-purple-400 tracking-tight relative z-10">{formatCurrency(item.price)}</span>
                       </div>
                    </button>
                 ))}
              </div>
           </div>
        </div>

        {/* RIGHT COMPONENT: Action Panel Sidebar */}
        <div className="flex-[1] min-w-0 sm:min-w-[380px] bg-[#1a1c23] rounded-xl border border-gray-800 flex flex-col shadow-2xl relative overflow-hidden">
            
            {/* Top: Token Lookup Bar */}
            <div className="p-4 border-b border-gray-800 bg-[#16181e] space-y-3">
               <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1">
                    <HistoryIcon className="w-3 h-3" /> existing token (optional)
                  </span>
                  {currentToken && (
                    <button onClick={clearToken} className="text-[10px] bg-red-500/10 text-red-400 hover:bg-red-500/20 px-2 py-0.5 rounded transition">Clear</button>
                  )}
               </div>

               <div className="flex gap-2">
                  <div className="relative flex-1">
                     <input 
                       type="text"
                       value={lookupInput}
                       onChange={(e) => setLookupInput(e.target.value)}
                       onKeyDown={(e) => e.key === 'Enter' && lookupToken()}
                       placeholder="Scan QR or Enter #"
                       className="w-full bg-[#0f1014] border border-gray-800 rounded-md py-2.5 pl-3 pr-4 text-sm font-black text-white outline-none focus:border-purple-500 placeholder-gray-600"
                     />
                  </div>
                  <button onClick={lookupToken} className="bg-purple-600 hover:bg-purple-500 text-white px-4 rounded-md font-bold text-xs transition duration-200">
                    Find
                  </button>
               </div>

               {/* Current Token Meta Info */}
               {currentToken && (
                 <div className="p-3 bg-[#0f1014] border border-gray-800 rounded-md mt-2 flex flex-col gap-1.5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-1.5 opacity-10"><Tag className="w-16 h-16"/></div>
                    <div className="flex justify-between items-center relative z-10">
                       <span className="text-sm font-black text-white">Token #{currentToken.tokenNumber}</span>
                       <span className={cn("text-[9px] uppercase font-bold px-2 py-0.5 rounded", 
                          currentToken?.status === 'paid' ? 'bg-green-500/20 text-green-400' :
                          currentToken?.status === 'partial_paid' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-blue-500/20 text-blue-400'
                       )}>
                          {currentToken?.status?.replace('_', ' ') ?? 'unknown'}
                       </span>
                    </div>
                    {currentToken.customerName && (
                       <div className="text-xs text-gray-400 font-medium relative z-10">{currentToken.customerName} {currentToken.customerPhone ? `(${currentToken.customerPhone})` : ''}</div>
                    )}
                 </div>
               )}
            </div>

            {/* Middle: Cart Items */}
            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar flex flex-col gap-2 relative">
                {isCartEmpty ? (
                   <div className="absolute inset-0 flex flex-col items-center justify-center opacity-30 pointer-events-none">
                      <ShoppingCart className="w-16 h-16 mb-4 text-gray-400" />
                      <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Cart is empty</p>
                   </div>
                ) : (
                   <>
                     {/* Existing Token Items */}
                     {activeTokenItems.length > 0 && (
                        <div className="mb-2">
                           <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 px-1 flex justify-between">
                              <span>Saved Items</span>
                              <span className="text-blue-400">(Sync'd)</span>
                           </div>
                           <div className="space-y-1.5">
                              {activeTokenItems.map((item) => (
                                <div key={`exist-${item.id}`} className="flex gap-3 bg-[#0f1014] border border-gray-800/60 p-2.5 rounded hover:border-gray-700 transition items-center">
                                  <img
                                   src={item.menuItem?.image ? (item.menuItem.image.startsWith('http') ? item.menuItem.image : `${SERVER_URL}${item.menuItem.image}`) : `https://ui-avatars.com/api/?name=${encodeURIComponent(item.menuItemName)}&background=1a1c23&color=fff`}
                                   alt={item.menuItemName}
                                   className="w-12 h-12 rounded-md object-cover flex-shrink-0"
                                  />
                                  <div className="flex-1 min-w-0">
                                   <h4 className="text-xs font-bold text-white uppercase truncate leading-tight">{item.menuItemName}</h4>
                                   <div className="text-gray-500 text-[11px] font-bold mt-1">₹{Number(item.price).toFixed(2)} × {item.quantity} = {formatCurrency(item.total)}</div>
                                  </div>
                                  {currentToken?.status !== 'paid' && (
                                   <div className="flex flex-col gap-1">
                                    <button onClick={() => setEditModal({ itemId: item.id, name: item.menuItemName, qty: item.quantity })} className="p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded transition"><Edit size={12}/></button>
                                    <button onClick={() => setDeleteModal({ itemId: item.id, name: item.menuItemName })} className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded transition"><Trash2 size={12}/></button>
                                   </div>
                                  )}
                                </div>
                              ))}
                           </div>
                        </div>
                     )}

                     {removedTokenItems.length > 0 && (
                        <div className="mb-2 space-y-1 opacity-50">
                           {removedTokenItems.map(item => (
                              <div key={`rem-${item.id}`} className="flex justify-between items-center bg-[#0f1014] p-2 rounded text-[10px] text-gray-500 line-through">
                                 <span>{item.menuItemName} × {item.quantity}</span>
                                 <span className="italic">{item.removeReason}</span>
                              </div>
                           ))}
                        </div>
                     )}

                     {/* New Local Items */}
                     {localCart.length > 0 && (
                        <div className="mb-2">
                           <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 px-1 flex justify-between">
                              <span>New Items</span>
                              <span className="text-green-400">(Unsaved)</span>
                           </div>
                           <div className="space-y-1.5">
                              {localCart.map((item) => (
                                <div key={item.id} className="flex gap-3 bg-purple-500/5 border border-purple-500/20 p-2.5 rounded relative overflow-hidden group items-center">
                                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-purple-500"></div>
                                  <img
                                    src={(() => { const mi = allItems.find(ai => ai.id === item.menuItemId); const img = mi?.image; return img ? (img.startsWith('http') ? img : `${SERVER_URL}${img}`) : `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=1a1c23&color=fff`; })()}
                                    alt={item.name}
                                    className="w-12 h-12 rounded-md object-cover flex-shrink-0 ml-2"
                                  />
                                  <div className="flex-1 min-w-0 pl-1">
                                    <h4 className="text-xs font-bold text-white uppercase truncate leading-tight mb-1">{item.name}</h4>
                                    <div className="flex text-[11px] items-center gap-2">
                                      <span className="font-bold text-gray-400">{formatCurrency(item.price)}</span>
                                      <span className="text-gray-600">x</span>
                                      <div className="flex items-center bg-[#1a1c23] border border-gray-700 rounded overflow-hidden h-6">
                                        <button onClick={() => updateLocalQty(item.id, -1)} className="px-2 h-full hover:bg-gray-700 transition">-</button>
                                        <span className="font-bold text-white w-5 text-center">{item.quantity}</span>
                                        <button onClick={() => updateLocalQty(item.id, 1)} className="px-2 h-full hover:bg-gray-700 transition">+</button>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end justify-between">
                                    <span className="text-xs font-black text-white">{formatCurrency(item.price * item.quantity)}</span>
                                    <button onClick={() => removeLocalItem(item.id)} className="text-gray-500 hover:text-red-400 mt-1 transition group-hover:opacity-100 opacity-60">
                                      <Trash2 size={13}/>
                                    </button>
                                  </div>
                                </div>
                              ))}
                           </div>
                        </div>
                     )}
                   </>
                )}
            </div>

            {/* Bottom: Summary and Payments */}
            <div className="bg-[#0f1014] border-t border-gray-800">
               {/* Customer Assignment */}
               {(!currentToken || currentToken?.status !== 'paid') && (
                 <div className="p-3 border-b border-gray-800/50 flex gap-2 relative">
                   <div className="relative flex-1">
                     <input
                       type="text"
                       value={customerName}
                       onChange={(e) => setCustomerName(e.target.value)}
                       placeholder="Cust Name (Opt)"
                       className="w-full px-3 py-2 bg-[#1a1c23] border border-gray-800 rounded-md text-white placeholder-gray-600 text-[11px] focus:outline-none focus:ring-1 focus:ring-[#7c5cfc] transition"
                     />
                   </div>
                   <div className="relative flex-1">
                     <input
                       type="tel"
                       value={customerPhone}
                       onFocus={() => setShowCustomerDropdown(true)}
                       onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                       onChange={(e) => { setCustomerPhone(e.target.value); setShowCustomerDropdown(true); }}
                       placeholder="Phone (Opt)"
                       className="w-full px-3 py-2 bg-[#1a1c23] border border-gray-800 rounded-md text-white placeholder-gray-600 text-[11px] focus:outline-none focus:ring-1 focus:ring-[#7c5cfc] transition"
                     />
                     {showCustomerDropdown && customerSuggestions.length > 0 && (
                       <div className="absolute bottom-full mb-1 right-0 w-64 bg-[#1a1c23] border border-gray-800 rounded-xl z-50 shadow-2xl overflow-hidden">
                         {customerSuggestions.map((c: any) => (
                           <button
                             key={c.id}
                             onMouseDown={(e) => {
                               e.preventDefault();
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
                   {currentToken && (customerPhone || customerName) && (currentToken.customerPhone !== customerPhone || currentToken.customerName !== customerName) && (
                     <button
                       onClick={() => assignCustomerMut.mutate({ name: customerName, phone: customerPhone })}
                       disabled={assignCustomerMut.isPending}
                       className="px-3 bg-[#7c5cfc] hover:bg-[#6b4ce6] text-white rounded-md text-[10px] font-bold uppercase transition disabled:opacity-50"
                     >
                       Save
                     </button>
                   )}
                 </div>
               )}

               {/* Summary Details */}
               <div className="p-4 space-y-2 border-b border-gray-800/50 text-[11px] font-bold text-gray-400">
                  {currentToken && (
                    <div className="flex justify-between">
                       <span>Existing Subtotal</span>
                       <span>₹{Number(currentToken.subtotal).toFixed(2)}</span>
                    </div>
                  )}
                  {localCartSubtotal > 0 && (
                     <div className="flex justify-between text-gray-300">
                        <span>New Items Subtotal</span>
                        <span>{formatCurrency(localCartSubtotal)}</span>
                     </div>
                  )}
                  {Number(currentToken?.discountApplied) > 0 && (
                     <div className="flex justify-between text-green-400">
                        <span>🏆 Loyalty Discount</span>
                        <span>-₹{Number(currentToken!.discountApplied).toFixed(2)}</span>
                     </div>
                  )}
                  
                  <div className="flex justify-between text-base font-black text-white pt-2 border-t border-gray-800 mt-2">
                     <span>TOTAL TO PAY</span>
                     <span className={cn(localCart.length > 0 && "text-green-400")}>
                        {formatCurrency(displayTotal)}
                     </span>
                  </div>
               </div>

               {/* Loyalty Action */}
               {currentToken?.customer && currentToken?.status !== 'paid' && (
                 <div className="px-3 pt-3">
                    <button
                       onClick={() => setLoyaltyModal(true)}
                       className="w-full py-2 bg-gray-900 border border-green-500/30 text-green-400 hover:bg-green-500/10 rounded-md text-[11px] uppercase tracking-wider font-bold transition flex items-center justify-center gap-2"
                     >
                       <Tag className="w-3.5 h-3.5" /> Claim Points ({currentToken.customer.loyaltyPoints} available)
                    </button>
                 </div>
               )}

               {/* Save Token Action */}
               {localCart.length > 0 && (
                 <div className="p-3 border-b border-gray-800/50">
                   <button
                     onClick={saveToken}
                     disabled={isSubmitting || currentToken?.status === 'paid'}
                     className="w-full py-2 bg-[#7c5cfc] hover:bg-[#6b4ce6] text-white rounded-md text-[11px] font-bold uppercase transition disabled:opacity-50"
                   >
                     {currentToken ? 'Save Items to Token' : 'Save as Token'}
                   </button>
                 </div>
               )}

               {/* Present to Customer Display Action */}
               {(currentToken || (localCart.length > 0 && !currentToken)) && (
                 <div className="px-3 py-2 border-b border-gray-800/50">
                   <button
                     onClick={presentToCustomer}
                     disabled={isSubmitting || (currentToken?.status === 'paid' && localCart.length === 0)}
                     className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-[11px] font-bold uppercase transition disabled:opacity-50 flex items-center justify-center gap-2"
                   >
                     🖥️ Present to Customer
                   </button>
                 </div>
               )}

               {/* Payment Methods Grid */}
               <div className="p-3">
                 {currentToken?.status === 'paid' && localCart.length === 0 ? (
                    <div className="space-y-2">
                       <div className="w-full py-3 bg-green-500/10 border border-green-500/20 text-green-400 rounded-md font-bold uppercase tracking-widest text-center text-xs flex items-center justify-center gap-2">
                          <CheckCircle size={14}/> Paid Successfully
                       </div>
                       <button
                         onClick={() => printFinalBill(currentToken)}
                         className="w-full py-3 bg-[#1a1c23] border border-gray-700 hover:bg-gray-800 text-white rounded-md font-bold text-xs flex items-center justify-center gap-2 uppercase tracking-wider transition"
                       >
                         <Printer className="w-4 h-4" /> REPRINT BILL
                       </button>
                    </div>
                 ) : (
                    <div className="grid grid-cols-4 gap-1.5">
                       <button onClick={() => processPayment('cash')} disabled={isSubmitting || isCartEmpty} className="bg-[#27ae60] hover:bg-[#2ecc71] disabled:opacity-50 disabled:grayscale text-white py-3 rounded text-[10px] font-black uppercase flex flex-col items-center gap-1.5 transition-colors">
                          <Banknote size={16}/> Cash
                       </button>
                       <button onClick={() => processPayment('gpay')} disabled={isSubmitting || isCartEmpty} className="bg-[#2980b9] hover:bg-[#3498db] disabled:opacity-50 disabled:grayscale text-white py-3 rounded text-[10px] font-black uppercase flex flex-col items-center gap-1.5 transition-colors">
                          <Smartphone size={16}/> GPay
                       </button>
                       <button onClick={() => processPayment('card')} disabled={isSubmitting || isCartEmpty} className="bg-[#8e44ad] hover:bg-[#9b59b6] disabled:opacity-50 disabled:grayscale text-white py-3 rounded text-[10px] font-black uppercase flex flex-col items-center gap-1.5 transition-colors">
                          <CreditCard size={16}/> Card
                       </button>
                       <button onClick={() => processPayment('upi')} disabled={isSubmitting || isCartEmpty} className="bg-[#e67e22] hover:bg-[#f39c12] disabled:opacity-50 disabled:grayscale text-white py-3 rounded text-[10px] font-black uppercase flex flex-col items-center gap-1.5 transition-colors">
                          <Wallet size={16}/> UPI
                       </button>
                    </div>
                 )}
               </div>
            </div>
        </div>
      </div>

      {/* Modals */}
      {deleteModal && (
        <PasswordModal
          action="delete"
          onConfirm={(password, reason) => deleteItemMut.mutate({ itemId: deleteModal.itemId, adminPassword: password, reason })}
          onCancel={() => setDeleteModal(null)}
        />
      )}
      {editModal && (
        <PasswordModal
          action="edit"
          onConfirm={(password, reason) => editItemMut.mutate({ itemId: editModal.itemId, quantity: editModal.qty, adminPassword: password, reason })}
          onCancel={() => setEditModal(null)}
        />
      )}
      {loyaltyModal && currentToken?.customer && (
        <LoyaltyModal
          customer={currentToken.customer}
          pointValue={Number(loyaltyConfig?.pointValue ?? 0.5)}
          onApply={(points) => loyaltyMut.mutate(points)}
          onCancel={() => setLoyaltyModal(false)}
        />
      )}

      {/* Payment Success Overlay */}
      {paidSuccess && (
        <div className="fixed inset-0 bg-black/98 flex items-center justify-center z-[200] backdrop-blur-sm">
          <div className="text-center animate-in fade-in zoom-in duration-300">
            <div className="w-32 h-32 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-6">
               <CheckCircle className="w-16 h-16 text-green-400" />
            </div>
            <p className="text-white text-4xl font-black uppercase tracking-widest bg-gradient-to-r from-green-400 to-emerald-400 text-transparent bg-clip-text">Payment Successful!</p>
            {currentToken?.loyaltyPointsEarned ? <p className="text-green-400/80 mt-4 text-sm font-bold uppercase tracking-widest">🏆 {currentToken.loyaltyPointsEarned} loyalty points earned</p> : null}
            <p className="text-gray-500 mt-6 text-xs font-bold uppercase tracking-widest animate-pulse">Ready for next order</p>
          </div>
        </div>
      )}
    </div>
  );
}
