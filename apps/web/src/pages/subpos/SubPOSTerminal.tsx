import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSubposStore } from '@/stores/subposStore';
import { useAuthStore } from '@/stores/authStore';
import axios from 'axios';
import restaurantApi from '@/lib/api';
import { API_BASE_URL } from '@/lib/config';
import toast from 'react-hot-toast';
import { useClickSound } from '@/hooks/useClickSound';
import {
  Search, Plus, Minus, LogOut, Printer, User, Phone, Hash, RefreshCw,
  Bell, CreditCard, Banknote, Smartphone, Trash2, Edit, ChevronLeft, ChevronRight,
  CheckCircle, ShoppingCart, Tag, History as HistoryIcon,
  RotateCcw, Wallet, RotateCw, Sun, Moon, X
} from 'lucide-react';
import { useThemeStore } from '@/stores/themeStore';
import KotPopup from '@/components/KotPopup';
import { ReturnItemsModal } from '@/components/ReturnItemsModal';
import { formatCurrency, cn, resolveImageUrl } from '@/lib/utils';
import { formatQtyDisplay, getQtyPresets, hasSmallUnitConversion, parseQtyInput } from '@/lib/posUnits';
import { useDebounce } from '@/hooks/useDebounce';
import { useSocket } from '@/hooks/useSocket';
import { useRealtimeOrders } from '@/hooks/useRealtimeOrders';
import { useWeightedBarcodeScanner } from '@/hooks/useWeightedBarcodeScanner';
import { isKgMeasuredItem, parseWeightFromBarcode } from '@/lib/weightedBarcodeParser';
import { useTouchLongPress } from '@/hooks/useTouchLongPress';
import { ItemOptionsModal } from '@/components/modals/ItemOptionsModal';

// ── Axios instance ────────────────────────────────────────────────────────────
const subposApi = axios.create({ baseURL: `${API_BASE_URL}/subpos` });
subposApi.interceptors.request.use((c) => {
  const token = useSubposStore.getState().token;
  if (token) c.headers.Authorization = `Bearer ${token}`;
  return c;
});

// ── Types ─────────────────────────────────────────────────────────────────────
interface InventoryMRP {
  id: number;
  mrp: number;
  purchaseRate: number;
  profitPercent: number;
  sellingPrice: number;
  isActive?: boolean;
  createdAt?: string;
}

interface MenuItem {
  id: number;
  name: string;
  price: number;
  categoryId: number | null;
  category?: { id: number; name: string; isKOTEnabled: boolean } | null;
  image: string | null;
  isVeg?: boolean;
  salesUnit?: string | null;
  taxType?: string | null;
  taxPercent?: number | null;
  enablePackOptions?: boolean;
  packOptions?: Array<{
    label: string;
    price?: number;
    sellingPrice?: number;
    purchaseRate?: number;
    profitPercent?: number;
    productQR?: string;
    quantity?: number;
    unitLabel?: string;
  }>;
  productQR?: string;
  inventoryItem?: {
    id: number;
    name?: string;
    sku?: string;
    barcode?: string;
    inventoryMRPs?: InventoryMRP[];
    unit?: any;
  };
}

interface Category { id: number; name: string; }

interface BillSettings {
  showGST?: boolean;
  showUnitForKOT?: boolean;
  showUnitForNonKOT?: boolean;
  loyaltyDiscountFormat?: string;
  thankYouMessage?: string | null;
  showTokenNumber?: boolean;
  showRestaurantInfo?: boolean;
  showPhoneNumber?: boolean;
  sgstRate?: number;
  cgstRate?: number;
  igstRate?: number;
  taxMode?: string;
  isInterState?: boolean;
  upiVpa?: string;
  upiId?: string;
}

interface LocalCartItem {
  id: string;
  menuItemId: number;
  name: string;
  displayName?: string;
  price: number;
  quantity: number;
  salesUnit?: string | null;
  inventoryItemMRPId?: number;
  purchaseRate?: number;
  profitPercent?: number;
  inventoryItemName?: string;
  inventoryMRPs?: InventoryMRP[];
  modifiers?: { name: string; price: number }[];
}

interface TokenResult {
  tokenId: number; tokenNumber: number; qrCode: string; qrUrl: string;
  itemCount?: number;
  token: { subtotal: number; sgst: number; cgst: number; igst: number; total: number };
}

// ── Core pricing helpers ──────────────────────────────────────────────────────
function getMRPSellingPrice(m: InventoryMRP): number {
  if (m.sellingPrice !== undefined && m.sellingPrice !== null) return Number(m.sellingPrice);
  return Number(m.purchaseRate) * (1 + Number(m.profitPercent ?? 0) / 100);
}

function getActiveMRPs(mrps: InventoryMRP[]): InventoryMRP[] {
  return (mrps ?? []).filter(m => m.isActive !== false);
}

function getLineTaxBreakdown(amount: number, taxType?: string | null, taxPercent?: number | null) {
  const safeAmount = Number(amount || 0);
  const rate = Math.max(0, Number(taxPercent ?? 0));
  const mode = String(taxType || 'external').toLowerCase();
  if (mode === 'internal') {
    const divisor = 1 + rate / 100;
    const taxable = divisor > 0 ? safeAmount / divisor : safeAmount;
    const tax = safeAmount - taxable;
    return { mode, taxPercent: rate, taxable, tax, final: safeAmount };
  }
  const tax = safeAmount * rate / 100;
  return { mode: 'external', taxPercent: rate, taxable: safeAmount, tax, final: safeAmount + tax };
}

type PosPackOption = {
  label: string;
  price: number;
  purchaseRate?: number;
  profitPercent?: number;
  productQR?: string;
  quantity?: number;
  unitLabel?: string;
};

import { printHtmlOrFallback } from '@/lib/electronPrint';

// ── Print token slip ──────────────────────────────────────────────────────────
function printTokenSlip(
  token: TokenResult,
  items: LocalCartItem[],
  customerName?: string,
  customerPhone?: string,
  bakeryName = 'SMARTGONEXT Bakery',
  settings?: BillSettings,
) {
  const invokePrint = async () => {
    const userRest = useAuthStore.getState().user?.restaurant as any;
    const finalRestaurantName = (settings as any)?.restaurantName || userRest?.name || (bakeryName !== 'SMARTGONEXT Bakery' ? bakeryName : '') || 'SMARTGONEXT Bakery';
    const cfg = {
      showTokenNumber: settings?.showTokenNumber ?? true,
      showRestaurantInfo: settings?.showRestaurantInfo ?? true,
      showPhoneNumber: settings?.showPhoneNumber ?? true,
      showLogo: (settings as any)?.showLogo ?? true,
      logoUrl: resolveImageUrl((settings as any)?.logoUrl || userRest?.logo || ''),
      restaurantAddress: (settings as any)?.restaurantAddress || userRest?.address || '',
      restaurantPhone: (settings as any)?.restaurantPhone || userRest?.phone || '',
    };
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(token.qrCode)}`;
    const totalItems = token.itemCount ?? items.length;
    const totalAmt = formatCurrency(Number(token.token?.total ?? 0));
    const html = `
      <!doctype html><html><head><meta charset="utf-8"><title>Token ${token.tokenNumber}</title>
      <style>body{font-family:Arial,Helvetica,sans-serif;padding:12px;text-align:center;color:#000;margin:0} img.logo{max-height:45px;max-width:120px;margin:0 auto 4px auto;display:block;} img.qr{width:180px;height:180px;object-fit:contain}</style>
      </head><body>
        ${cfg.showLogo && cfg.logoUrl ? `<img class="logo" src="${cfg.logoUrl}" alt="Logo" />` : ''}
        ${cfg.showRestaurantInfo ? `<div style="font-size:12pt;font-weight:700;">${finalRestaurantName}</div>` : ''}
        ${cfg.showRestaurantInfo && cfg.restaurantAddress ? `<div style="font-size:8pt;color:#333;">${cfg.restaurantAddress}</div>` : ''}
        ${cfg.showPhoneNumber && cfg.restaurantPhone ? `<div style="font-size:8pt;color:#333;">Ph: ${cfg.restaurantPhone}</div>` : ''}
        ${cfg.showTokenNumber ? `<div style="font-size:14pt;font-weight:700;margin-top:4px;">Token #${token.tokenNumber}</div>` : ''}
        ${customerName ? `<div style="font-size:10pt;margin-top:4px;">${customerName}${cfg.showPhoneNumber && customerPhone ? ` · ${customerPhone}` : ''}</div>` : ''}
        <div style="font-size:10pt;margin-top:4px;">Total Items: <strong>${totalItems}</strong></div>
        <div style="font-size:12pt;font-weight:700;margin-top:6px;">Total: <strong>${totalAmt}</strong></div>
        <div style="margin:10px 0"><img class="qr" src="${qrUrl}" alt="QR"/></div>
        <div style="font-size:10pt;color:#555">Scan to retrieve order</div>
      </body></html>
    `;
    await printHtmlOrFallback(html);
  };
  invokePrint().catch(err => console.error('Print token failed', err));
}

// ── Touch Menu Item Card Component ──────────────────────────────────────────
function TouchMenuItemCard({
  item,
  isLight,
  isDisabled,
  onTap,
  onLongPress,
}: {
  item: MenuItem;
  isLight: boolean;
  isDisabled?: boolean;
  onTap: (item: MenuItem) => void;
  onLongPress: (item: MenuItem) => void;
}) {
  const activeMRPs = getActiveMRPs(item.inventoryItem?.inventoryMRPs ?? []);
  const displayPrice = activeMRPs.length > 0 ? getMRPSellingPrice(activeMRPs[0]) : Number(item.price);

  const touchHandlers = useTouchLongPress({
    onClick: () => {
      if (!isDisabled) onTap(item);
    },
    onLongPress: () => {
      if (!isDisabled) onLongPress(item);
    },
    threshold: 500,
  });

  return (
    <div
      {...touchHandlers}
      className={cn(
        "flex flex-col rounded-lg overflow-hidden border transition-all group scale-100 active:scale-95 select-none cursor-pointer",
        isDisabled ? "opacity-50 pointer-events-none" : "",
        isLight
          ? "bg-white border-slate-200 hover:border-purple-500 hover:shadow-md text-slate-900"
          : "bg-[#1a1c23] border-gray-800 hover:border-gray-600 text-white"
      )}
    >
      <div className={cn("relative w-full h-32 overflow-hidden flex items-center justify-center", isLight ? "bg-slate-50" : "bg-[#14151a]")}>
        <img
          src={resolveImageUrl(item.image) || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name.charAt(0))}&background=1a1c23&color=fff`}
          className="w-full h-full object-cover transition-all group-hover:scale-105"
          alt={item.name}
          onError={(e) => {
            e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name.charAt(0))}&background=1a1c23&color=fff`;
          }}
        />
        <div className="absolute top-2 right-2 flex gap-1">
          {item.isVeg !== undefined && (
            <div className={cn('w-3.5 h-3.5 rounded-sm border flex items-center justify-center bg-white/20 backdrop-blur-sm', isLight ? 'border-slate-400' : 'border-white/20', item.isVeg ? 'text-green-600 font-black' : 'text-red-600 font-black')}>
              <div className="w-1.5 h-1.5 rounded-full bg-current" />
            </div>
          )}
        </div>
        {activeMRPs.length > 1 && (
          <div className="absolute bottom-1 left-1 bg-purple-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow">
            {activeMRPs.length} prices
          </div>
        )}
      </div>
      <div className={cn("p-2.5 text-left w-full border-t transition-colors", isLight ? "bg-white border-slate-100" : "bg-[#1a1c23] border-gray-800")}>
        <h4 className={cn("text-[11px] font-bold uppercase truncate mb-1", isLight ? "text-slate-800" : "text-white")}>{item.name}</h4>
        <span className={cn("text-xs font-black tracking-tight", isLight ? "text-purple-700" : "text-purple-400")}>{formatCurrency(displayPrice)}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
import { useEnterKeyNavigation } from '@/hooks/useEnterKeyNavigation';

export default function SubPOSTerminal() {
  useEnterKeyNavigation();
  const { isAuthenticated, terminal, token: authToken, logout } = useSubposStore();
  const { theme, toggleTheme } = useThemeStore();
  const isLight = theme === 'light';
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const { socket } = useSocket();
  const kotPopupEnabled = useSubposStore(s => s.kotPopupEnabled ?? true);
  const setKotPopupEnabled = useSubposStore(s => s.setKotPopupEnabled ?? (() => {}));

  useRealtimeOrders();

  useEffect(() => {
    if (!socket) return;
    const invalidate = () => qc.invalidateQueries({ queryKey: ['subpos-items'] } as any);
    const invalidateAll = () => {
      qc.invalidateQueries({ queryKey: ['subpos-items'] } as any);
      qc.invalidateQueries({ queryKey: ['subpos-categories'] } as any);
    };
    socket.on('inventory.item.updated', invalidate);
    socket.on('purchaseOrder.received', invalidateAll);
    socket.on('purchaseOrder.created', invalidateAll);
    socket.on('supplier.updated', invalidate);
    return () => {
      socket.off('inventory.item.updated', invalidate);
      socket.off('purchaseOrder.received', invalidateAll);
      socket.off('purchaseOrder.created', invalidateAll);
      socket.off('supplier.updated', invalidate);
    };
  }, [socket, qc]);

  // ── State ──
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);

  useWeightedBarcodeScanner((scanResult) => {
    const processed = processScannedBarcode(scanResult.rawBarcode);
    if (!processed) {
      setSearchQuery(scanResult.rawBarcode);
    }
  });

  const [localCart, setLocalCart] = useState<LocalCartItem[]>([]);
  const [packPickerItem, setPackPickerItem] = useState<MenuItem | null>(null);
  const [activeModifierItem, setActiveModifierItem] = useState<any | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<Record<number, any[]>>({}); // groupId -> array of options
  const [optionsModalTarget, setOptionsModalTarget] = useState<{
    item: any;
    cartItemId?: string;
    existingQty?: number;
    existingIsParcel?: boolean;
    existingNotes?: string;
    existingSelectedModifiers?: { name: string; price: number }[];
  } | null>(null);

  const handleSaveItemOptions = ({
    quantity,
    isParcel,
    notes,
    modifiers,
  }: {
    quantity: number;
    isParcel: boolean;
    notes: string;
    modifiers: { name: string; price: number }[];
  }) => {
    if (!optionsModalTarget) return;

    const item = optionsModalTarget.item;
    const cartItemId = optionsModalTarget.cartItemId;

    let namePrefix = isParcel ? '📦 [PARCEL] ' : '';
    let modNames = modifiers.map(m => m.name).join(', ');
    let modText = modNames ? ` (${modNames})` : '';
    let noteText = notes ? ` [Note: ${notes}]` : '';

    const baseName = item.name || (item as any).displayName || 'Item';
    const cleanBaseName = baseName
      .replace(/^📦\s*\[PARCEL\]\s*/i, '')
      .split(' (')[0]
      .split(' [Note:')[0];
    const finalDisplayName = `${namePrefix}${cleanBaseName}${modText}${noteText}`;

    let basePrice = Number(item.price || 0);
    const allMRPs = item.inventoryItem?.inventoryMRPs ?? item.inventoryMRPs ?? [];
    const activeMRPs = getActiveMRPs(allMRPs);
    if (activeMRPs.length > 0) {
      basePrice = getMRPSellingPrice(activeMRPs[0]);
    }

    const modPriceTotal = modifiers.reduce((sum, m) => sum + (m.price || 0), 0);
    const finalPrice = basePrice + modPriceTotal;

    if (cartItemId) {
      setLocalCart(prev => prev.map(p => {
        if (p.id === cartItemId) {
          return {
            ...p,
            quantity,
            price: finalPrice,
            displayName: finalDisplayName,
            modifiers,
            notes,
            isParcel,
          } as any;
        }
        return p;
      }));
      toast.success(`Updated ${cleanBaseName} options`, { icon: '📝' });
    } else {
      const newId = addCartEntry({
        item: item as MenuItem,
        price: finalPrice,
        displayName: finalDisplayName,
        salesUnit: (item as MenuItem).salesUnit ?? null,
        quantity,
      });

      setLocalCart(prev => prev.map(p => p.id === newId ? {
        ...p,
        modifiers,
        notes,
        isParcel,
      } as any : p));
    }

    setOptionsModalTarget(null);
  };
  const [qtyEditor, setQtyEditor] = useState<{ id: string; value: string } | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [lastToken, setLastToken] = useState<TokenResult | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [todayCount, setTodayCount] = useState(0);
  const [lookupInput, setLookupInput] = useState('');
  const [loadedToken, setLoadedToken] = useState<any | null>(null);
  const [customTotalOverride, setCustomTotalOverride] = useState<number | null>(null);
  const [isEditingTotal, setIsEditingTotal] = useState<boolean>(false);
  const [totalInputVal, setTotalInputVal] = useState<string>('');
  const [existingTokenItems, setExistingTokenItems] = useState<LocalCartItem[]>([]);
  const [kotsModalOpen, setKotsModalOpen] = useState(false);
  const [selectedKot, setSelectedKot] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [browsingOrderIndex, setBrowsingOrderIndex] = useState<number | null>(null);
  const [priceEditor, setPriceEditor] = useState<{ id: string; value: string } | null>(null);

  // ── Chrome-Style Multi-Tab Bill State ──
  const [tabs, setTabs] = useState<Array<{
    id: string;
    customerName: string;
    customerPhone: string;
    localCart: LocalCartItem[];
    customTotalOverride: number | null;
    loadedToken: any | null;
    existingTokenItems: LocalCartItem[];
    browsingOrderIndex: number | null;
  }>>([
    {
      id: 'tab-1',
      customerName: '',
      customerPhone: '',
      localCart: [],
      customTotalOverride: null,
      loadedToken: null,
      existingTokenItems: [],
      browsingOrderIndex: null,
    }
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-1');

  // Keep active tab in sync with current state
  useEffect(() => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? {
      ...t,
      customerName,
      customerPhone,
      localCart,
      customTotalOverride,
      loadedToken,
      existingTokenItems,
      browsingOrderIndex,
    } : t));
  }, [activeTabId, customerName, customerPhone, localCart, customTotalOverride, loadedToken, existingTokenItems, browsingOrderIndex]);

  const handleSwitchTab = (targetTabId: string) => {
    if (targetTabId === activeTabId) return;
    const target = tabs.find(t => t.id === targetTabId);
    if (!target) return;

    setActiveTabId(targetTabId);
    setCustomerName(target.customerName || '');
    setCustomerPhone(target.customerPhone || '');
    setLocalCart(target.localCart || []);
    setCustomTotalOverride(target.customTotalOverride ?? null);
    setLoadedToken(target.loadedToken ?? null);
    setExistingTokenItems(target.existingTokenItems || []);
    setBrowsingOrderIndex(target.browsingOrderIndex ?? null);
  };

  const handleAddNewTab = () => {
    const newId = `tab-${Date.now()}`;
    const newTab = {
      id: newId,
      customerName: '',
      customerPhone: '',
      localCart: [],
      customTotalOverride: null,
      loadedToken: null,
      existingTokenItems: [],
      browsingOrderIndex: null,
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newId);
    setCustomerName('');
    setCustomerPhone('');
    setLocalCart([]);
    setCustomTotalOverride(null);
    setLoadedToken(null);
    setExistingTokenItems([]);
    setBrowsingOrderIndex(null);
    toast.success('Opened new bill tab');
  };

  const handleCloseTab = (tabIdToClose: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) {
      setCustomerName('');
      setCustomerPhone('');
      setLocalCart([]);
      setCustomTotalOverride(null);
      setLoadedToken(null);
      setExistingTokenItems([]);
      setBrowsingOrderIndex(null);
      setTabs([{
        id: 'tab-1',
        customerName: '',
        customerPhone: '',
        localCart: [],
        customTotalOverride: null,
        loadedToken: null,
        existingTokenItems: [],
        browsingOrderIndex: null,
      }]);
      setActiveTabId('tab-1');
      toast.success('Cleared bill tab');
      return;
    }

    const newTabs = tabs.filter(t => t.id !== tabIdToClose);
    setTabs(newTabs);

    if (activeTabId === tabIdToClose) {
      const fallbackTab = newTabs[newTabs.length - 1];
      setActiveTabId(fallbackTab.id);
      setCustomerName(fallbackTab.customerName || '');
      setCustomerPhone(fallbackTab.customerPhone || '');
      setLocalCart(fallbackTab.localCart || []);
      setCustomTotalOverride(fallbackTab.customTotalOverride ?? null);
      setLoadedToken(fallbackTab.loadedToken ?? null);
      setExistingTokenItems(fallbackTab.existingTokenItems || []);
      setBrowsingOrderIndex(fallbackTab.browsingOrderIndex ?? null);
    }
  };

  const searchRef = useRef<HTMLInputElement>(null);
  const cartScrollRef = useRef<HTMLDivElement | null>(null);
  const isAppendingRef = useRef(false);

  if (!isAuthenticated) return <Navigate to="/subpos" replace />;

  const debouncedCustomerPhone = useDebounce(customerPhone, 500);
  const headers = useMemo(() => ({ Authorization: `Bearer ${authToken}` }), [authToken]);

  // ── Queries ──
  const { data: todayTokens = [] } = useQuery({
    queryKey: ['subpos-today-tokens-list', authToken],
    queryFn: async () => {
      try {
        const { data } = await subposApi.get('/today-orders', { headers });
        return Array.isArray(data.data) ? data.data : [];
      } catch {
        return [];
      }
    },
    enabled: !!authToken,
    staleTime: 15_000,
    refetchInterval: 10000,
  });

  const handlePrevBill = () => {
    if (!todayTokens || todayTokens.length === 0) {
      toast.error('No previous bills found for today');
      return;
    }
    if (browsingOrderIndex === null) {
      setBrowsingOrderIndex(0);
    } else if (browsingOrderIndex < todayTokens.length - 1) {
      setBrowsingOrderIndex(prev => (prev === null ? 0 : prev + 1));
    } else {
      toast('Reached oldest bill for today');
    }
  };

  const handleNextBill = () => {
    if (browsingOrderIndex === null) return;
    if (browsingOrderIndex === 0) {
      setBrowsingOrderIndex(null);
    } else {
      setBrowsingOrderIndex(prev => (prev === null ? null : prev - 1));
    }
  };

  const updateLocalPrice = (itemId: string, newPrice: number) => {
    const validPrice = Math.max(0, newPrice);
    setLocalCart(prev => prev.map(it => it.id === itemId ? { ...it, price: validPrice } : it));
    setPriceEditor(null);
    toast.success(`Unit price updated: ₹${validPrice.toFixed(2)}`);
  };
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['subpos-categories', authToken],
    queryFn: async () => { const { data } = await subposApi.get('/categories', { headers: { Authorization: `Bearer ${authToken}` } }); return data.data; },
    enabled: !!authToken,
    staleTime: 60_000,
  });

  const { data: allItems = [] } = useQuery<MenuItem[]>({
    queryKey: ['subpos-items', authToken],
    queryFn: async () => { const { data } = await subposApi.get('/items', { headers: { Authorization: `Bearer ${authToken}` } }); return data.data; },
    enabled: !!authToken,
    staleTime: 60_000,
  });

  const { data: billSettings } = useQuery<BillSettings>({
    queryKey: ['subpos-bill-settings', authToken],
    queryFn: async () => { const { data } = await subposApi.get('/bill-settings', { headers: { Authorization: `Bearer ${authToken}` } }); return data.data; },
    enabled: !!authToken,
    staleTime: 60_000,
  });

  const { data: customerSuggestions = [] } = useQuery({
    queryKey: ['subpos-customers', debouncedCustomerPhone],
    queryFn: async () => {
      if (debouncedCustomerPhone.length < 3) return [];
      const { data } = await subposApi.get(`/customers?search=${debouncedCustomerPhone}`, { headers });
      return data.data;
    },
    enabled: debouncedCustomerPhone.length >= 3,
  });

  // ── Auto-fill customer name from phone match ──
  useEffect(() => {
    if (customerName || !customerPhone) return;
    const exactMatch = customerSuggestions.find((c: any) => c.phone === customerPhone);
    if (exactMatch) setCustomerName(exactMatch.name || '');
  }, [customerPhone, customerName, customerSuggestions]);

  // ── Today count ──
  const fetchTodayCount = useCallback(async () => {
    try {
      const { data } = await subposApi.get('/tokens-today', { headers });
      setTodayCount(data.data.count);
    } catch {}
  }, [authToken]);

  useEffect(() => { fetchTodayCount(); }, [fetchTodayCount]);

  // ── Keyboard shortcut (F12 / Ctrl+Enter) ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F12' || (e.ctrlKey && e.key === 'Enter')) {
        e.preventDefault();
        const btn = document.getElementById('btn-create-token');
        if (btn && !btn.hasAttribute('disabled')) btn.click();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── KOT detail popup ──
  useEffect(() => {
    const handler = (e: any) => {
      const payload = e?.detail;
      const kot = payload?.kot ?? (Array.isArray(payload?.kots) ? payload.kots[0] : null);
      if (!kot) return;
      setSelectedKot(kot);
      setKotsModalOpen(true);
    };
    window.addEventListener('show_kot_detail', handler as EventListener);
    return () => window.removeEventListener('show_kot_detail', handler as EventListener);
  }, []);

  // ── Inventory MRP helpers ──
  const findInventoryMRPsByName = useCallback(async (inventoryName: string): Promise<InventoryMRP[] | undefined> => {
    if (!inventoryName || !inventoryName.trim()) return undefined;
    try {
      const response = await restaurantApi.get('/restaurant/inventory/items');
      const list = response.data?.data as Array<{ name?: string; inventoryMRPs?: InventoryMRP[] }>;
      const match = (list || []).find(it => String(it.name || '').trim().toLowerCase() === inventoryName.trim().toLowerCase());
      return match?.inventoryMRPs?.filter(m => m.isActive !== false) ?? undefined;
    } catch { return undefined; }
  }, []);

  const updateLocalCartItem = useCallback((id: string, updates: Partial<LocalCartItem>) => {
    setLocalCart(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  }, []);

  const attachInventoryMRPsToCartItem = useCallback(async (cartItemId: string, inventoryName: string) => {
    const mrps = await findInventoryMRPsByName(inventoryName);
    if (!mrps || mrps.length === 0) return;
    const selected = mrps[0];
    updateLocalCartItem(cartItemId, {
      inventoryItemName: inventoryName,
      inventoryMRPs: mrps,
      inventoryItemMRPId: selected.id,
      purchaseRate: selected.purchaseRate,
      profitPercent: selected.profitPercent,
      price: getMRPSellingPrice(selected),
    });
  }, [findInventoryMRPsByName, updateLocalCartItem]);

  // ── Token lookup ──
  const lookupToken = async () => {
    if (!lookupInput.trim()) return;
    try {
      const isNum = /^\d+$/.test(lookupInput.trim());
      const body = isNum ? { tokenNumber: Number(lookupInput.trim()) } : { qrCode: lookupInput.trim() };
      const { data } = await subposApi.post('/token/lookup', body);
      const tokenData = data.data;
      setLoadedToken(tokenData);
      // Map existing token items into localCart-compatible shape for display
      const mapped: LocalCartItem[] = (tokenData.items || [])
        .filter((i: any) => !i.isRemoved)
        .map((i: any): LocalCartItem => ({
          id: `existing-${i.id}`,
          menuItemId: i.menuItemId ?? i.menuItem?.id,
          name: i.menuItem?.name || i.menuItemName || 'Item',
          displayName: i.menuItemName || i.menuItem?.name || 'Item',
          price: Number(i.price ?? 0),
          quantity: Number(i.quantity ?? 0),
          salesUnit: i.menuItem?.salesUnit ?? null,
          inventoryItemMRPId: i.inventoryItemMRPId ?? undefined,
          purchaseRate: i.purchaseRate !== undefined ? Number(i.purchaseRate) : undefined,
          profitPercent: i.profitPercent !== undefined ? Number(i.profitPercent) : undefined,
        }));
      setExistingTokenItems(mapped);
      if (tokenData.customerName) setCustomerName(tokenData.customerName);
      if (tokenData.customerPhone) setCustomerPhone(tokenData.customerPhone);
      toast.success(`Token #${tokenData.tokenNumber} loaded`);
      setLookupInput('');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Token not found');
    }
  };

  const clearToken = () => {
    setLoadedToken(null);
    setExistingTokenItems([]);
    setCustomerName('');
    setCustomerPhone('');
  };

  // ── Pack options helpers ──
  const getPackOptions = (item: MenuItem): PosPackOption[] => {
    if (!item?.enablePackOptions) return [];
    if (!Array.isArray(item?.packOptions)) return [];
    if (!item?.category || item.category.isKOTEnabled) return [];
    return item.packOptions
      .map((p: any) => {
        const label = String(p?.label ?? '').trim();
        const directPrice = Number(p?.sellingPrice ?? p?.price ?? 0);
        const pr = Number(p?.purchaseRate ?? 0);
        const pp = Number(p?.profitPercent ?? 0);
        const computed = pr > 0 ? Number((pr * (1 + pp / 100)).toFixed(2)) : 0;
        const finalPrice = Number.isFinite(directPrice) && directPrice > 0 ? directPrice : computed;
        return {
          label,
          price: finalPrice,
          purchaseRate: Number.isFinite(pr) ? pr : undefined,
          profitPercent: Number.isFinite(pp) ? pp : undefined,
          productQR: String(p?.productQR ?? '').trim() || undefined,
          quantity: Number.isFinite(Number(p?.quantity)) ? Number(p?.quantity) : undefined,
          unitLabel: String(p?.unitLabel ?? '').trim() || undefined,
        } as PosPackOption;
      })
      .filter((p) => p.label.length > 0 && Number.isFinite(p.price) && p.price > 0);
  };

  const findPackByBarcode = (barcode: string) => {
    const code = String(barcode || '').trim();
    if (!code) return null;
    for (const item of allItems) {
      const pack = getPackOptions(item).find((p) => p.productQR === code);
      if (pack) return { item, pack };
    }
    return null;
  };

  const processScannedBarcode = (rawBarcode: string) => {
    const code = String(rawBarcode || '').trim();
    if (!code) return false;

    const weightResult = parseWeightFromBarcode(code);
    if (weightResult && weightResult.isWeightBased) {
      const item = allItems.find(i => {
        const qr = String(i.productQR || '').trim().toLowerCase();
        const invSku = String(i.inventoryItem?.sku || '').trim().toLowerCase();
        const invBc = String(i.inventoryItem?.barcode || '').trim().toLowerCase();
        
        const targets = new Set<string>();
        if (weightResult.productQR) targets.add(weightResult.productQR.trim().toLowerCase());
        if (weightResult.skuRaw) {
          targets.add(weightResult.skuRaw.trim().toLowerCase());
          targets.add(weightResult.skuRaw.replace(/^0+/, '').trim().toLowerCase());
        }
        if (weightResult.prefix && weightResult.skuRaw) {
          targets.add(`${weightResult.prefix}${weightResult.skuRaw}`.trim().toLowerCase());
        }

        if (qr && targets.has(qr)) return true;
        if (invSku && targets.has(invSku)) return true;
        if (invBc && targets.has(invBc)) return true;
        if (targets.has(String(i.id))) return true;
        return false;
      });
      if (item && isKgMeasuredItem(item.salesUnit)) {
        const allMRPs = item.inventoryItem?.inventoryMRPs ?? [];
        const activeMRPs = getActiveMRPs(allMRPs);
        if (activeMRPs.length > 0) {
          const active = activeMRPs[0];
          const price = getMRPSellingPrice(active);
          addCartEntry({
            item,
            price,
            mrpId: active.id,
            purchaseRate: active.purchaseRate,
            profitPercent: active.profitPercent,
            displayName: item.name,
            salesUnit: item.salesUnit ?? null,
            quantity: weightResult.quantity,
          });
        } else {
          addCartEntry({
            item,
            price: Number(item.price),
            displayName: item.name,
            salesUnit: item.salesUnit ?? null,
            quantity: weightResult.quantity,
          });
        }
        setSearchQuery('');
        toast.success(`✓ Added ${item.name}: ${weightResult.quantity.toFixed(2)}kg`, { duration: 1000, icon: '📦' });
        return true;
      }
      if (item) {
        handleAddToCart(item);
        setSearchQuery('');
        return true;
      }
    }

    const packMatch = findPackByBarcode(code);
    if (packMatch) {
      const displayName = `${packMatch.item.name} - ${packMatch.pack.label}`;
      const newId = addCartEntry({
        item: packMatch.item,
        price: Number(packMatch.pack.price),
        purchaseRate: packMatch.pack.purchaseRate,
        profitPercent: packMatch.pack.profitPercent,
        displayName,
        salesUnit: packMatch.pack.unitLabel || packMatch.item.salesUnit || null,
      });
      void attachInventoryMRPsToCartItem(newId, displayName);
      setSearchQuery('');
      toast.success(`Scanned: ${displayName}`, { duration: 800, icon: '🏷️' });
      return true;
    }

    const exactMatch = allItems.find(i => i.productQR === code || String(i.id) === code);
    if (exactMatch) {
      handleAddToCart(exactMatch);
      setSearchQuery('');
      return true;
    }

    const textMatches = allItems.filter(item => {
      const q = code.toLowerCase();
      return item.name.toLowerCase().includes(q) ||
        (item.productQR && item.productQR.toLowerCase() === q) ||
        (item.productQR && item.productQR.toLowerCase().includes(q)) ||
        String(item.id) === code;
    });
    if (textMatches.length === 1) {
      handleAddToCart(textMatches[0]);
      setSearchQuery('');
      return true;
    }

    return false;
  };

  // ── Filtered items ──
  const filteredItems = allItems.filter((item) => {
    const normalizedSearch = String(searchQuery || '').trim();
    const q = normalizedSearch.toLowerCase();
    const weightResult = parseWeightFromBarcode(normalizedSearch);
    const matchCat = selectedCategoryId === null || item.categoryId === selectedCategoryId;
    const matchSearch = !q ||
      String(item.name || '').toLowerCase().includes(q) ||
      String(item.category?.name || '').toLowerCase().includes(q) ||
      String(item.productQR || '').toLowerCase() === q ||
      String(item.productQR || '').toLowerCase().includes(q) ||
      String(weightResult?.productQR || '').toLowerCase() === String(item.productQR || '').toLowerCase() ||
      String(item.inventoryItem?.barcode || '').toLowerCase().includes(q) ||
      String(item.inventoryItem?.sku || '').toLowerCase().includes(q) ||
      String(item.id) === normalizedSearch;
    return matchCat && matchSearch;
  });

  // ── Add to cart ──
  const { playSound, playAddSound, playIncrementSound, playDecrementSound, playDeleteSound, playTokenSound, playKeypadSound } = useClickSound();

  const addCartEntry = (options: {
    item: MenuItem;
    price: number;
    mrpId?: number;
    purchaseRate?: number;
    profitPercent?: number;
    displayName?: string;
    salesUnit?: string | null;
    quantity?: number;
    inventoryItemName?: string;
    inventoryMRPs?: InventoryMRP[];
  }): string => {
    const id = Math.random().toString(36).substr(2, 9);
    const { item, price, mrpId, purchaseRate, profitPercent, displayName, salesUnit, quantity = 1, inventoryItemName, inventoryMRPs } = options;
    let returnedId = id;
    setLocalCart(prev => {
      const resolvedName = displayName || item.name;
      const match = prev.find(p =>
        p.menuItemId === item.id &&
        Number(p.price) === Number(price) &&
        ((p.inventoryItemMRPId ?? null) === (mrpId ?? null)) &&
        ((p.displayName || p.name) === resolvedName)
      );
      if (match) {
        returnedId = match.id;
        return prev.map(p => p.id === match.id ? { ...p, quantity: Number((p.quantity + quantity).toFixed(3)) } : p);
      }
      const newEntry: LocalCartItem = {
        id,
        menuItemId: item.id,
        name: item.name,
        displayName: resolvedName,
        salesUnit: salesUnit ?? item.salesUnit ?? null,
        price,
        quantity,
        inventoryItemMRPId: mrpId,
        purchaseRate: purchaseRate ? Number(purchaseRate) : undefined,
        profitPercent: profitPercent ? Number(profitPercent) : undefined,
        inventoryItemName,
        inventoryMRPs,
      };
      return [newEntry, ...prev];
    });
    setTimeout(() => {
      const el = document.getElementById(`local-${returnedId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
    toast.success(`Added ${displayName || item.name}`, { duration: 800 });
    return returnedId;
  };

  const handleAddToCart = (item: MenuItem) => {
    playSound();
    const packs = getPackOptions(item);
    if (packs.length > 0) {
      setPackPickerItem(item);
      return;
    }
    const allMRPs = item.inventoryItem?.inventoryMRPs ?? [];
    const activeMRPs = getActiveMRPs(allMRPs);
    if (activeMRPs.length > 0) {
      const active = activeMRPs[0];
      const price = getMRPSellingPrice(active);
      addCartEntry({
        item,
        price,
        mrpId: active.id,
        purchaseRate: active.purchaseRate,
        profitPercent: active.profitPercent,
        displayName: item.name,
        salesUnit: item.salesUnit ?? null,
        inventoryMRPs: activeMRPs,
      });
      return;
    }
    addCartEntry({
      item,
      price: Number(item.price),
      displayName: item.name,
      salesUnit: item.salesUnit ?? null,
      quantity: 1,
    });
    return;
  };

  const handleAddWithModifiers = () => {
    if (!activeModifierItem) return;
    playSound();

    const allMRPs = activeModifierItem.inventoryItem?.inventoryMRPs ?? [];
    const activeMRPs = getActiveMRPs(allMRPs);
    let basePrice = Number(activeModifierItem.price);
    let mrpId: number | undefined = undefined;
    let purchaseRate: number | undefined = undefined;
    let profitPercent: number | undefined = undefined;

    if (activeMRPs.length > 0) {
      const active = activeMRPs[0];
      basePrice = getMRPSellingPrice(active);
      mrpId = active.id;
      purchaseRate = active.purchaseRate;
      profitPercent = active.profitPercent;
    }

    const flatModifiers = Object.values(selectedModifiers).flat().map(opt => ({
      name: opt.name,
      price: Number(opt.price || 0)
    }));

    const modPriceTotal = flatModifiers.reduce((sum, m) => sum + m.price, 0);
    const finalPrice = basePrice + modPriceTotal;

    const modNames = flatModifiers.map(m => m.name).join(', ');
    const displayName = modNames ? `${activeModifierItem.name} (${modNames})` : activeModifierItem.name;

    const newId = addCartEntry({
      item: activeModifierItem,
      price: finalPrice,
      mrpId,
      purchaseRate,
      profitPercent,
      displayName,
      salesUnit: activeModifierItem.salesUnit ?? null,
      quantity: 1,
      inventoryMRPs: activeMRPs.length > 0 ? activeMRPs : undefined,
    });

    setLocalCart(prev => prev.map(p => p.id === newId ? {
      ...p,
      modifiers: flatModifiers
    } : p));

    setActiveModifierItem(null);
    setSelectedModifiers({});
  };

  // ── Barcode scan on Enter ──
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const rawBarcode = searchQuery.trim();
      if (!rawBarcode) return;

      if (processScannedBarcode(rawBarcode)) return;

      const exactMatch = allItems.find(i => i.productQR === rawBarcode || String(i.id) === rawBarcode);
      if (exactMatch) {
        handleAddToCart(exactMatch);
        setSearchQuery('');
        toast.success(`Scanned: ${exactMatch.name}`, { duration: 800, icon: '🏷️' });
      } else if (filteredItems.length === 1) {
        handleAddToCart(filteredItems[0]);
        setSearchQuery('');
      } else if (rawBarcode.length > 0) {
        toast.error('Item not found for scanning');
        setSearchQuery('');
      }
    }
  };

  // ── Cart item actions ──
  const changeLocalItemMRP = (cartItemId: string, selectedMRP: InventoryMRP) => {
    const newPrice = getMRPSellingPrice(selectedMRP);
    setLocalCart(prev => prev.map(p => p.id === cartItemId ? {
      ...p,
      inventoryItemMRPId: selectedMRP.id,
      purchaseRate: Number(selectedMRP.purchaseRate),
      profitPercent: Number(selectedMRP.profitPercent ?? 0),
      price: newPrice,
    } : p));
  };

  const updateLocalQty = (id: string, delta: number) => {
    if (delta > 0) playIncrementSound();
    else playDecrementSound();
    setLocalCart(prev => prev.map((p) => {
      if (p.id !== id) return p;
      const step = hasSmallUnitConversion(p.salesUnit) ? 0.25 : 1;
      const next = Number((p.quantity + (delta * step)).toFixed(3));
      return { ...p, quantity: Math.max(step, next) };
    }));
  };

  const setLocalQtyAbsolute = (id: string, qty: number) =>
    setLocalCart(prev => prev.map((p) => (p.id === id ? { ...p, quantity: Number(qty.toFixed(3)) } : p)));

  const removeLocalItem = (id: string) => {
    playDeleteSound();
    setLocalCart(prev => prev.filter(p => p.id !== id));
  };

  // ── Totals ──
  const localCartSubtotal = localCart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const storeTaxRate = billSettings?.showGST === false
    ? 0
    : (billSettings ? (Number(billSettings.sgstRate || 0) + Number(billSettings.cgstRate || 0) + Number(billSettings.igstRate || 0)) : null);

  const localCartTax = localCart.reduce((sum, item) => {
    const menu = allItems.find((m) => m.id === item.menuItemId);
    const taxRate = (storeTaxRate !== null && storeTaxRate !== undefined && storeTaxRate > 0) ? storeTaxRate : Number(menu?.taxPercent ?? 0);
    const line = getLineTaxBreakdown(Number(item.price) * Number(item.quantity), menu?.taxType, taxRate);
    return sum + Number(line.tax || 0);
  }, 0);
  const localCartFinal = localCart.reduce((sum, item) => {
    const menu = allItems.find((m) => m.id === item.menuItemId);
    const taxRate = (storeTaxRate !== null && storeTaxRate !== undefined && storeTaxRate > 0) ? storeTaxRate : Number(menu?.taxPercent ?? 0);
    const line = getLineTaxBreakdown(Number(item.price) * Number(item.quantity), menu?.taxType, taxRate);
    return sum + Number(line.final || 0);
  }, 0);

  const existingSubtotal = existingTokenItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const calculatedTotal = loadedToken
    ? Math.max(0, Number(loadedToken.total ?? existingSubtotal) - (loadedToken.payments ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0)) + localCartFinal
    : localCartFinal;
  const displayTotal = customTotalOverride !== null ? customTotalOverride : calculatedTotal;

  const isCartEmpty = existingTokenItems.length === 0 && localCart.length === 0;
  const combinedCartItemsCount = existingTokenItems.length + localCart.length;

  // ── Create / save token mutation ──
  const createToken = useMutation({
    mutationFn: async () => {
      if (!customerName || !customerName.trim()) throw new Error('Customer Name is REQUIRED! Please enter customer name before generating token.');
      if (localCart.length === 0) throw new Error('No items to save');
      const itemsPayload = localCart.map(i => ({
        menuItemId: i.menuItemId,
        quantity: i.quantity,
        inventoryItemMRPId: i.inventoryItemMRPId,
        purchaseRate: i.purchaseRate !== undefined ? Number(i.purchaseRate) : undefined,
        linePrice: i.price,
        menuItemName: i.displayName || i.name,
      }));

      if (!loadedToken) {
        const { data } = await subposApi.post('/token/create', {
          items: itemsPayload,
          customerName: customerName || undefined,
          customerPhone: customerPhone || undefined,
          staffId: user?.id,
        }, { headers });
        return { ...(data.data as TokenResult), itemCount: localCart.length };
      } else {
        for (const it of itemsPayload) {
          await subposApi.post(`/token/${loadedToken.qrCode}/items`, { ...it, staffId: user?.id }, { headers });
        }
        const { data } = await subposApi.get(`/token/${loadedToken.qrCode}`, { headers });
        const t = data.data;
        return {
          tokenId: t.id, tokenNumber: t.tokenNumber, qrCode: t.qrCode, qrUrl: `/token/${t.qrCode}`,
          itemCount: localCart.length,
          token: { subtotal: Number(t.subtotal ?? 0), sgst: Number(t.sgst ?? 0), cgst: Number(t.cgst ?? 0), igst: Number(t.igst ?? 0), total: Number(t.total ?? 0) },
        } as TokenResult;
      }
    },
    onSuccess: (result) => {
      playTokenSound();
      setLastToken(result);
      setShowPrintPreview(true);
      printTokenSlip(result, localCart, customerName, customerPhone, terminal?.name || 'SMARTGONEXT Bakery', billSettings);
      setLocalCart([]);
      setCustomerName('');
      setCustomerPhone('');
      if (!isAppendingRef.current) setTodayCount((c) => c + 1);
      setLoadedToken(null);
      setExistingTokenItems([]);
      isAppendingRef.current = false;
      toast.success(`Token #${result.tokenNumber} created!`);
      searchRef.current?.focus();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || err?.message || 'Failed to create token'),
  });

  return (
    <div className={cn(
      "fixed inset-0 flex flex-col overflow-hidden w-screen h-[100dvh] transition-colors duration-200",
      isLight ? "bg-slate-100 text-slate-900" : "bg-[#0f1014] text-white"
    )}>

      {/* ── Top Bar ── */}
      <div className={cn(
        "flex items-center justify-between px-4 py-3 border-b flex-shrink-0 transition-colors duration-200",
        isLight ? "bg-white border-slate-200 text-slate-900 shadow-sm" : "bg-[#1a1c23] border-gray-800 text-white"
      )}>
        <div className="flex items-center gap-3">
          <CreditCard className="w-5 h-5 text-purple-500" />
          <span className={cn("font-bold uppercase tracking-wide text-sm", isLight ? "text-slate-800" : "text-gray-200")}>{terminal?.name ?? 'SUB POS'}</span>
          {user?.name && (
            <span className={cn("px-2 py-0.5 text-[10px] font-black uppercase rounded-md border tracking-wider", isLight ? "bg-purple-100 text-purple-800 border-purple-200" : "bg-purple-500/10 text-purple-300 border-purple-500/20")}>
              Staff: {user.name}
            </span>
          )}
          <span className={cn("text-lg", isLight ? "text-slate-300" : "text-gray-700")}>|</span>
          <span className={cn("text-sm font-medium", isLight ? "text-slate-600" : "text-gray-400")}>
            Tokens Today: <strong className="text-[#7c5cfc] font-black">{todayCount}</strong>
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className={cn(
              "py-1.5 px-2.5 rounded-md text-[11px] font-bold uppercase transition flex items-center gap-1.5 border",
              isLight
                ? "bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300"
                : "bg-gray-800 hover:bg-gray-700 text-amber-400 border-gray-700"
            )}
            title={isLight ? "Switch to Dark Mode" : "Switch to Light Mode"}
          >
            {isLight ? <Moon className="w-3.5 h-3.5 text-indigo-600" /> : <Sun className="w-3.5 h-3.5 text-amber-400" />}
            <span>{isLight ? "Dark" : "Light"}</span>
          </button>
          <span className={cn(
            "px-2.5 py-1 text-[10px] font-bold uppercase rounded-md border tracking-wider",
            isLight ? "bg-slate-100 text-slate-700 border-slate-300" : "bg-gray-800 text-gray-300 border-gray-700"
          )}>
            {combinedCartItemsCount} ITEMS
          </span>
          <button
            onClick={() => setKotsModalOpen(true)}
            className={cn(
              "py-2 px-3 rounded-md text-xs font-bold uppercase transition",
              isLight ? "bg-slate-200 text-slate-800 hover:bg-slate-300" : "bg-gray-800 text-gray-300"
            )}
          >
            KOT
          </button>
          <button onClick={() => setKotPopupEnabled(!kotPopupEnabled)}
            className={`py-2 px-3 rounded-md text-xs font-bold uppercase transition ${kotPopupEnabled ? 'bg-amber-400 text-black' : (isLight ? 'bg-slate-200 text-slate-800' : 'bg-gray-800 text-gray-300')}`}>
            <Bell className="w-4 h-4" />
          </button>
          <button onClick={() => setReturnModalOpen(true)}
            className="py-2 px-3 rounded-md text-xs font-bold uppercase transition bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-2">
            <RotateCw className="w-4 h-4" /> Return
          </button>
          <button onClick={logout} className={cn(
            "flex items-center gap-1.5 transition text-xs font-bold uppercase",
            isLight ? "text-slate-600 hover:text-slate-900" : "text-gray-400 hover:text-white"
          )}>
            <LogOut className="w-4 h-4" /> Exit POS
          </button>
        </div>
      </div>

      {/* Chrome-Style Multi-Tabs Bar */}
      <div className={cn(
        "flex items-center gap-1 px-3 pt-1 border-b flex-shrink-0 overflow-x-auto select-none custom-scrollbar transition-colors duration-200",
        isLight ? "bg-slate-200 border-slate-300" : "bg-[#14151a] border-gray-800"
      )}>
        {tabs.map((tab, idx) => {
          const isActive = tab.id === activeTabId;
          const itemsCount = isActive
            ? combinedCartItemsCount
            : ((tab.loadedToken?.items?.length || 0) + (tab.localCart?.length || 0));

          const displayName = isActive
            ? (customerName.trim() || `Bill #${idx + 1}`)
            : (tab.customerName.trim() || `Bill #${idx + 1}`);

          return (
            <div
              key={tab.id}
              onClick={() => handleSwitchTab(tab.id)}
              className={cn(
                "group relative flex items-center gap-2 px-3.5 py-1.5 rounded-t-lg border-t border-x cursor-pointer transition-all duration-150 max-w-[220px] min-w-[130px] shadow-sm",
                isActive
                  ? (isLight ? "bg-white border-slate-300 text-purple-900 font-bold shadow-md" : "bg-[#1a1c23] border-gray-700 text-purple-400 font-bold shadow-md")
                  : (isLight ? "bg-slate-100 border-transparent text-slate-600 hover:bg-white/60 hover:text-slate-900" : "bg-[#0f1014] border-transparent text-gray-400 hover:bg-[#16181e] hover:text-gray-200")
              )}
            >
              <User className={cn("w-3.5 h-3.5 flex-shrink-0", isActive ? "text-purple-600" : "text-gray-400")} />
              <span className="text-xs truncate flex-1 font-bold">{displayName}</span>
              {itemsCount > 0 && (
                <span className={cn("text-[9px] px-1.5 py-0.2 rounded-full font-black", isActive ? "bg-purple-600 text-white" : "bg-gray-700 text-gray-300")}>
                  {itemsCount}
                </span>
              )}
              <button
                onClick={(e) => handleCloseTab(tab.id, e)}
                className={cn(
                  "p-0.5 rounded-full hover:bg-red-500/20 hover:text-red-500 transition opacity-60 group-hover:opacity-100",
                  isLight ? "text-slate-500 hover:text-red-600" : "text-gray-400"
                )}
                title="Close tab"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}

        {/* + Add New Chrome Tab */}
        <button
          onClick={handleAddNewTab}
          className={cn(
            "p-1.5 rounded-lg border flex items-center justify-center transition-all duration-150 hover:scale-105 active:scale-95 ml-1 mb-0.5",
            isLight ? "bg-white border-slate-300 text-slate-700 hover:bg-purple-50 hover:text-purple-700" : "bg-[#1a1c23] border-gray-700 text-gray-300 hover:bg-purple-500/20 hover:text-purple-300"
          )}
          title="Open new bill tab (+)"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* ── Main Grid ── */}
      <div className="flex flex-1 overflow-hidden p-2 gap-2">

        <KotPopup />

        {/* KOT detail modal */}
        {kotsModalOpen && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className={cn(
              "p-5 rounded-2xl w-full max-w-2xl border shadow-2xl transition-colors",
              isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#1a1c23] border-gray-800 text-white"
            )}>
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <h3 className={cn("text-base font-black uppercase tracking-wider", isLight ? "text-slate-900" : "text-white")}>KOT Detail</h3>
                <div className="flex items-center gap-2">
                  {selectedKot && (
                    <button onClick={() => setSelectedKot(null)} className={cn("text-xs font-bold px-3 py-1.5 rounded-lg border transition", isLight ? "bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-300" : "bg-gray-800 hover:bg-gray-700 text-white border-gray-700")}>Back</button>
                  )}
                  <button onClick={() => { setKotsModalOpen(false); setSelectedKot(null); }} className={cn("text-xs font-bold px-3 py-1.5 rounded-lg border transition", isLight ? "bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-300" : "bg-gray-700 hover:bg-gray-600 text-white border-gray-600")}>Close</button>
                </div>
              </div>
              <div className="mt-4 max-h-[60vh] overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                {selectedKot ? (
                  <div className="space-y-3">
                    <div className={cn("flex items-center justify-between p-3 rounded-xl border", isLight ? "bg-slate-50 border-slate-200" : "bg-[#0f1014] border-gray-800")}>
                      <div>
                        <div className="text-[10px] text-amber-500 font-black uppercase tracking-wider">KOT</div>
                        <div className={cn("text-lg font-black", isLight ? "text-slate-900" : "text-white")}>#{selectedKot.kotNumber}</div>
                        <div className={cn("text-xs font-bold", isLight ? "text-slate-500" : "text-gray-400")}>Order #{selectedKot.order?.orderNumber || selectedKot.orderId}</div>
                      </div>
                      <div className="text-right">
                        <div className={cn("text-base font-black", isLight ? "text-slate-900" : "text-white")}>{formatCurrency((selectedKot.items || []).reduce((s: any, it: any) => s + Number(it.price) * Number(it.quantity), 0))}</div>
                        <div className={cn("text-xs font-medium", isLight ? "text-slate-500" : "text-gray-400")}>{(selectedKot.items || []).length} items</div>
                      </div>
                    </div>
                    <div className="mt-2 space-y-2">
                      {(selectedKot.items || []).map((it: any) => {
                        const itemName = it.menuItem?.name || it.menuItemName || 'Item';
                        const initial = String(itemName).charAt(0).toUpperCase();
                        return (
                          <div key={it.id} className={cn("flex items-center gap-3 p-2.5 rounded-xl border", isLight ? "bg-white border-slate-200" : "bg-[#0f1014] border-gray-800")}>
                            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold border", isLight ? "bg-slate-100 border-slate-300 text-slate-800" : "bg-gray-800 border-gray-700 text-gray-200")}>{initial}</div>
                            <div className="flex-1 min-w-0">
                              <div className={cn("font-bold text-xs uppercase truncate", isLight ? "text-slate-900" : "text-white")}>{itemName}</div>
                              <div className={cn("text-[11px] font-medium mt-0.5", isLight ? "text-slate-500" : "text-gray-400")}>Qty: {it.quantity} · ₹{Number(it.price).toFixed(2)} each</div>
                            </div>
                            <div className={cn("font-black text-sm", isLight ? "text-slate-900" : "text-white")}>₹{(Number(it.price) * Number(it.quantity)).toFixed(2)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className={cn("text-center py-8 text-sm font-bold", isLight ? "text-slate-500" : "text-gray-400")}>No KOT details</div>
                )}
              </div>
            </div>
          </div>
        )}

        {returnModalOpen && (
          <ReturnItemsModal
            isOpen={returnModalOpen}
            onClose={() => setReturnModalOpen(false)}
            restaurantId={Number(user?.restaurant?.id || 0)}
            onConfirm={async (returnItems, reason, originalTokenId, totalReturnAmount) => {
              try {
                setIsSubmitting(true);
                const payload = {
                  originalTokenId,
                  returnItems,
                  returnedBy: terminal?.name || 'SubPOS User',
                  returnReason: reason,
                  totalReturnAmount,
                  restaurantId: Number(user?.restaurant?.id || 0),
                } as any;

                const response = await restaurantApi.post('/bakery-tokens/returns', payload);

                const amountToShow =
                  totalReturnAmount ?? Number(response?.data?.totalRefunded ?? response?.data?.return?.totalReturnAmount ?? 0);

                toast.success(`Return processed: ${formatCurrency(amountToShow)}`);
                setReturnModalOpen(false);
              } catch (err: any) {
                console.error('Return error:', err);
                toast.error(err?.response?.data?.message || 'Failed to process return');
              } finally {
                setIsSubmitting(false);
              }
            }}
          />
        )}

        {/* ══════════════════════════════════════════
            LEFT: Menu Grid (Matching MainPOS design)
        ══════════════════════════════════════════ */}
        <div className={cn("flex-1 min-w-0 flex flex-col h-full rounded-xl p-2 transition-colors duration-200 overflow-hidden", isLight ? "bg-slate-100" : "bg-[#0f1014]")}>
          <div className="mb-2 space-y-2 flex-shrink-0">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search menu items or scan barcode..."
                  className={cn(
                    "w-full rounded-md py-2 pl-9 pr-4 text-sm outline-none transition-all",
                    isLight
                      ? "bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-purple-600 shadow-sm"
                      : "bg-[#1a1c23] border border-gray-800 text-white placeholder-gray-500 focus:border-purple-500/50"
                  )}
                  autoFocus
                />
              </div>
              <button
                onClick={() => { setSearchQuery(''); setSelectedCategoryId(null); }}
                className="bg-purple-600 hover:bg-purple-500 text-white px-4 rounded-md text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset
              </button>
            </div>

            {/* Horizontal category buttons */}
            <div className="flex w-full max-w-full min-w-0 items-center gap-1.5 overflow-x-auto pb-1 pt-1 snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {(() => {
                const denseCategories = categories.length > 20;
                const chipClass = denseCategories
                  ? 'shrink-0 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wider transition-all snap-start leading-none'
                  : 'shrink-0 whitespace-nowrap rounded-md border px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-all snap-start leading-none';
                return (
                  <>
                    <button
                      onClick={() => setSelectedCategoryId(null)}
                      className={cn(
                        chipClass,
                        selectedCategoryId === null
                          ? (isLight ? 'bg-purple-600 border-purple-600 text-white font-black shadow-md' : 'bg-purple-500/20 border-purple-500 text-purple-300 font-black shadow-lg shadow-purple-500/10')
                          : (isLight ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-200 hover:text-slate-900 shadow-sm' : 'bg-[#1a1c23] border-gray-800 text-gray-400 hover:bg-gray-800 hover:text-white')
                      )}
                    >
                      All Items
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedCategoryId(cat.id)}
                        className={cn(
                          chipClass,
                          selectedCategoryId === cat.id
                            ? (isLight ? 'bg-purple-600 border-purple-600 text-white font-black shadow-md' : 'bg-purple-500/20 border-purple-500 text-purple-300 font-black shadow-lg shadow-purple-500/10')
                            : (isLight ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-200 hover:text-slate-900 shadow-sm' : 'bg-[#1a1c23] border-gray-800 text-gray-400 hover:bg-gray-800 hover:text-white')
                        )}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </>
                );
              })()}
            </div>
          </div>

          {/* Items grid */}
          <div className="flex-1 overflow-y-auto custom-scrollbar pb-3 rounded-md pr-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 content-start">
              {filteredItems.map(item => (
                <TouchMenuItemCard
                  key={item.id}
                  item={item}
                  isLight={isLight}
                  onTap={(it) => handleAddToCart(it)}
                  onLongPress={(it) => setOptionsModalTarget({ item: it })}
                />
              ))}
              {filteredItems.length === 0 && (
                <div className="col-span-full text-center text-gray-500 py-10 flex flex-col items-center">
                  <Search className="w-12 h-12 text-gray-400 mb-4 opacity-50" />
                  <p className="text-lg font-medium">No items found</p>
                  <p className="text-sm">Try adjusting the search or category filter.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            RIGHT: Cart & Payment Column (Matching MainPOS sizing & full page visibility)
        ══════════════════════════════════════════════════════════ */}
        <div className={cn(
          "w-80 sm:w-96 lg:w-[380px] xl:w-[420px] flex-shrink-0 rounded-xl border flex flex-col h-full relative overflow-hidden transition-colors duration-200",
          isLight ? "bg-white border-slate-200 text-slate-900 shadow-xl" : "bg-[#1a1c23] border-gray-800 text-white shadow-2xl"
        )}>

          {/* Bill Navigation & Token Lookup */}
          <div className={cn("p-3 border-b space-y-2 transition-colors duration-200", isLight ? "bg-slate-50 border-slate-200" : "bg-[#16181e] border-gray-800")}>
            {/* Navigation Header */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button
                  onClick={handlePrevBill}
                  className={cn(
                    "p-1.5 rounded-lg border font-black transition flex items-center justify-center shadow-sm",
                    isLight ? "bg-white border-slate-300 text-slate-800 hover:bg-slate-100" : "bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700"
                  )}
                  title="Previous Bill (<)"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <div className={cn(
                  "px-3 py-1 rounded-lg border text-center font-black text-xs flex items-center gap-1.5 min-w-[130px] justify-center shadow-sm",
                  browsingOrderIndex !== null
                    ? (isLight ? "bg-amber-100 border-amber-300 text-amber-900" : "bg-amber-500/20 border-amber-500/40 text-amber-300")
                    : (isLight ? "bg-purple-100 border-purple-300 text-purple-900" : "bg-purple-500/20 border-purple-500/40 text-purple-300")
                )}>
                  {browsingOrderIndex !== null && todayTokens[browsingOrderIndex] ? (
                    <span className="truncate">
                      Bill #{todayTokens[browsingOrderIndex].tokenNumber || todayTokens[browsingOrderIndex].orderNumber || todayTokens[browsingOrderIndex].id}
                    </span>
                  ) : (
                    <span>Bill #${(todayTokens?.length || 0) + 1}</span>
                  )}
                </div>

                <button
                  onClick={handleNextBill}
                  disabled={browsingOrderIndex === null}
                  className={cn(
                    "p-1.5 rounded-lg border font-black transition flex items-center justify-center shadow-sm disabled:opacity-30",
                    isLight ? "bg-white border-slate-300 text-slate-800 hover:bg-slate-100" : "bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700"
                  )}
                  title="Next Bill / Current Draft (>)"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <span className={cn("px-2 py-1 text-[9px] font-black uppercase rounded-lg border tracking-wider", isLight ? "bg-slate-200 text-slate-800 border-slate-300" : "bg-gray-800 text-gray-300 border-gray-700")}>
                  {combinedCartItemsCount} ITEMS
                </span>
                {localCart.length > 0 && (
                  <button
                    onClick={() => {
                      playDeleteSound();
                      setLocalCart([]);
                      toast.success('Cart cleared');
                    }}
                    className={cn(
                      "py-1 px-2 rounded-lg text-[10px] font-bold uppercase transition flex items-center gap-1 border shadow-sm",
                      isLight
                        ? "bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
                        : "bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20"
                    )}
                    title="Clear local cart items"
                  >
                    <Trash2 className="w-3 h-3" /> Clear
                  </button>
                )}
                {loadedToken && (
                  <button onClick={clearToken} className="text-[9px] bg-red-500/10 text-red-400 hover:bg-red-500/20 px-2 py-1 rounded-lg transition font-bold">Clear Token</button>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={lookupInput}
                onChange={(e) => setLookupInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lookupToken(); } }}
                placeholder="Scan QR or Enter #"
                className={cn(
                  "flex-1 rounded-md py-2 pl-3 pr-4 text-sm font-black outline-none transition-all",
                  isLight ? "bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-purple-600" : "bg-[#0f1014] border border-gray-800 text-white placeholder-gray-600 focus:border-purple-500"
                )}
              />
              <button onClick={lookupToken} className="bg-purple-600 hover:bg-purple-500 text-white px-4 rounded-md font-bold text-xs transition">
                Find
              </button>
            </div>
            {loadedToken && (
              <div className={cn("p-2.5 border rounded-md flex flex-col gap-1 relative overflow-hidden", isLight ? "bg-slate-100 border-slate-300 text-slate-900" : "bg-[#0f1014] border-gray-800 text-white")}>
                <div className="absolute top-0 right-0 p-1.5 opacity-10"><Tag className="w-16 h-16" /></div>
                <div className="flex justify-between items-center relative z-10">
                  <span className={cn("text-sm font-black", isLight ? "text-slate-900" : "text-white")}>Token #{loadedToken.tokenNumber}</span>
                  <span className={cn('text-[9px] uppercase font-bold px-2 py-0.5 rounded',
                    loadedToken.status === 'paid' ? 'bg-green-500/20 text-green-700' :
                    loadedToken.status === 'partial_paid' ? 'bg-yellow-500/20 text-yellow-700' :
                    'bg-blue-500/20 text-blue-700')}>
                    {String(loadedToken.status ?? 'open').replace('_', ' ')}
                  </span>
                </div>
                {loadedToken.customerName && (
                  <div className={cn("text-xs font-medium relative z-10", isLight ? "text-slate-600" : "text-gray-400")}>
                    {loadedToken.customerName} {loadedToken.customerPhone ? `(${loadedToken.customerPhone})` : ''}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cart Items scroll area */}
          <div ref={cartScrollRef} className="flex-1 overflow-y-auto p-2.5 custom-scrollbar flex flex-col gap-1.5 relative">
            {browsingOrderIndex !== null && todayTokens[browsingOrderIndex] ? (
              <div className="space-y-2">
                <div className={cn("p-2.5 rounded-lg border flex items-center justify-between text-xs font-bold shadow-sm", isLight ? "bg-amber-100 border-amber-300 text-amber-900" : "bg-amber-500/20 border-amber-500/40 text-amber-300")}>
                  <span>Past Bill #{todayTokens[browsingOrderIndex].tokenNumber || todayTokens[browsingOrderIndex].id} Items ({todayTokens[browsingOrderIndex].items?.length || 0})</span>
                </div>
                {(!todayTokens[browsingOrderIndex].items || todayTokens[browsingOrderIndex].items.length === 0) ? (
                  <div className="text-center py-8 opacity-50 text-xs font-bold">No items found in this past bill</div>
                ) : (
                  <div className="space-y-1.5">
                    {todayTokens[browsingOrderIndex].items.map((item: any, idx: number) => {
                      const itemName = item.menuItemName || item.name || 'Item';
                      const mi = allItems.find(ai => ai.id === item.menuItemId || ai.name === itemName);
                      const imgSrc = resolveImageUrl(item.menuItem?.image || item.image || mi?.image) || `https://ui-avatars.com/api/?name=${encodeURIComponent(itemName)}&background=1a1c23&color=fff`;

                      return (
                        <div key={`sub-past-item-${idx}`} className={cn("flex gap-2.5 border p-2 rounded items-center", isLight ? "bg-slate-50 border-slate-200 hover:border-slate-300" : "bg-[#0f1014] border-gray-800 hover:border-gray-700")}>
                          <img
                            src={imgSrc}
                            alt={itemName}
                            className="w-10 h-10 rounded-md object-cover flex-shrink-0"
                            onError={(e) => {
                              e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(itemName)}&background=1a1c23&color=fff`;
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className={cn("text-[11px] font-bold uppercase truncate leading-tight", isLight ? "text-slate-900" : "text-white")}>
                              {itemName}
                            </h4>
                            <div className={cn("text-[10px] font-bold mt-0.5", isLight ? "text-slate-500" : "text-gray-400")}>
                              ₹{Number(item.price).toFixed(2)} × {formatQtyDisplay(Number(item.quantity || 0), item.salesUnit)}
                            </div>
                          </div>
                          <div className={cn("text-xs font-black", isLight ? "text-slate-900" : "text-white")}>
                            {formatCurrency(item.total || (Number(item.price) * Number(item.quantity)))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : isCartEmpty ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center opacity-40 pointer-events-none">
                <ShoppingCart className={cn("w-16 h-16 mb-4", isLight ? "text-slate-400" : "text-gray-400")} />
                <p className={cn("text-sm font-bold uppercase tracking-widest", isLight ? "text-slate-500" : "text-gray-400")}>Cart is empty</p>
              </div>
            ) : (
              <>
                {/* Existing (loaded) token items */}
                {existingTokenItems.length > 0 && (
                  <div className="mb-2">
                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 px-1 flex justify-between">
                      <span>Saved Items</span><span className="text-blue-500 font-black">(Sync'd)</span>
                    </div>
                    <div className="space-y-1">
                      {existingTokenItems.map((item) => {
                        const mi = allItems.find(ai => ai.id === item.menuItemId);
                        return (
                          <div key={item.id} className={cn("flex gap-3 border p-2 rounded transition items-center", isLight ? "bg-slate-50 border-slate-200 hover:border-slate-300" : "bg-[#0f1014] border-gray-800/60 hover:border-gray-700")}>
                            <img
                              src={resolveImageUrl(mi?.image ?? null) || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=1a1c23&color=fff`}
                              alt={item.name}
                              className="w-12 h-12 rounded-md object-cover flex-shrink-0"
                              onError={(e) => {
                                e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=1a1c23&color=fff`;
                              }}
                            />
                            <div className="flex-1 min-w-0">
                              <h4 className={cn("text-xs font-bold uppercase truncate leading-tight", isLight ? "text-slate-900" : "text-white")}>{item.displayName || item.name}</h4>
                              <div className={cn("text-[11px] font-bold mt-1", isLight ? "text-slate-500" : "text-gray-500")}>
                                ₹{Number(item.price).toFixed(2)} × {formatQtyDisplay(Number(item.quantity || 0), item.salesUnit)} = {formatCurrency(item.price * item.quantity)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* New (unsaved) local cart items */}
                {localCart.length > 0 && (
                  <div className="mb-2">
                    <div className={cn("text-[10px] font-bold uppercase tracking-widest mb-1.5 px-1 flex justify-between", isLight ? "text-slate-600" : "text-gray-500")}>
                      <span>New Items</span><span className="text-green-600 font-black">(Unsaved)</span>
                    </div>
                    <div className="space-y-1">
                      {localCart.map((item) => {
                        const mi = allItems.find(ai => ai.id === item.menuItemId);
                        const allMRPs = item.inventoryMRPs ?? mi?.inventoryItem?.inventoryMRPs ?? [];
                        const activeMRPs = getActiveMRPs(allMRPs);
                        const selectedMRP = activeMRPs.find(m => m.id === item.inventoryItemMRPId) ?? activeMRPs[0] ?? null;
                        const label = item.displayName || item.name;
                        const imgSrc = resolveImageUrl(mi?.image ?? null) || `https://ui-avatars.com/api/?name=${encodeURIComponent(label)}&background=1a1c23&color=fff`;

                        return (
                          <div id={`local-${item.id}`} key={item.id} className={cn(
                            "flex gap-3 p-2 rounded relative overflow-hidden group items-start border transition-all",
                            isLight ? "bg-purple-50/70 border-purple-200 text-slate-900 shadow-sm" : "bg-purple-500/5 border-purple-500/20 text-white"
                          )}>
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-purple-600" />
                            <img 
                              src={imgSrc} 
                              alt={label} 
                              className="w-12 h-12 rounded-md object-cover flex-shrink-0 ml-2 mt-0.5" 
                              onError={(e) => {
                                e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(label)}&background=1a1c23&color=fff`;
                              }}
                            />
                            <div className="flex-1 min-w-0 pl-1">
                              <h4 className={cn("text-xs font-bold uppercase truncate leading-tight mb-1", isLight ? "text-slate-900" : "text-white")}>{label}</h4>
                              {item.modifiers && item.modifiers.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-0.5 mb-1.5">
                                  {item.modifiers.map((m, i) => (
                                    <span key={i} className={cn("text-[8px] border rounded px-1 py-0.5 font-bold uppercase", isLight ? "bg-purple-100 border-purple-300 text-purple-800" : "bg-purple-500/15 border-purple-500/30 text-purple-300")}>
                                      +{m.name} (+₹{Number(m.price).toFixed(2)})
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* MRP selector */}
                              {activeMRPs.length > 1 ? (
                                <div className="space-y-1">
                                  <select
                                    value={String(item.inventoryItemMRPId ?? (selectedMRP?.id ?? ''))}
                                    onChange={(e) => {
                                      const mrp = activeMRPs.find(m => m.id === Number(e.target.value));
                                      if (mrp) changeLocalItemMRP(item.id, mrp);
                                    }}
                                    className={cn("w-full border text-xs rounded-lg px-2 py-1.5 focus:outline-none", isLight ? "bg-white border-slate-300 text-slate-900 focus:border-purple-600" : "bg-[#0f1014] border border-gray-700 text-white focus:border-purple-500")}
                                  >
                                    {activeMRPs.map(m => {
                                      const mrpValue = Number(m.mrp ?? getMRPSellingPrice(m));
                                      return (
                                        <option key={m.id} value={m.id}>
                                          MRP: ₹{mrpValue.toFixed(2)}
                                        </option>
                                      );
                                    })}
                                  </select>
                                  {selectedMRP && (
                                    <div className={cn("text-[10px] px-1", isLight ? "text-slate-600" : "text-gray-500")}>
                                      Selling: <span className="text-green-600 font-bold">₹{getMRPSellingPrice(selectedMRP).toFixed(2)}</span>
                                      {' · '}Cost: ₹{Number(selectedMRP.purchaseRate).toFixed(2)}
                                      {' · '}Profit: {Number(selectedMRP.profitPercent ?? 0).toFixed(1)}%
                                      {selectedMRP.createdAt ? ` · ${new Date(selectedMRP.createdAt).toLocaleDateString()}` : ''}
                                    </div>
                                  )}
                                </div>
                              ) : activeMRPs.length === 1 ? (
                                <div className={cn("text-[11px] space-y-0.5", isLight ? "text-slate-600" : "text-gray-400")}>
                                  <div>Selling: <span className="text-green-600 font-bold">₹{getMRPSellingPrice(activeMRPs[0]).toFixed(2)}</span></div>
                                  <div>Cost: ₹{Number(activeMRPs[0].purchaseRate).toFixed(2)} · Profit: {Number(activeMRPs[0].profitPercent ?? 0).toFixed(1)}%</div>
                                  {activeMRPs[0].createdAt && <div className={isLight ? "text-slate-500" : "text-gray-600"}>Added: {new Date(activeMRPs[0].createdAt).toLocaleDateString()}</div>}
                                </div>
                              ) : (
                                <div className={cn("text-[11px]", isLight ? "text-slate-600" : "text-gray-400")}>{formatCurrency(item.price)}</div>
                              )}
                            </div>

                            {/* Qty controls + total */}
                            <div className="flex flex-col items-end justify-between gap-2">
                              <div className={cn("flex items-center gap-1 rounded-lg p-1 border", isLight ? "bg-white border-slate-300" : "bg-[#0f1014] border-gray-800")}>
                                <button onClick={() => updateLocalQty(item.id, -1)} className={cn("w-7 h-7 rounded-md flex items-center justify-center transition active:scale-95 text-sm font-bold", isLight ? "bg-slate-200 hover:bg-slate-300 text-slate-800" : "bg-gray-800 hover:bg-gray-700 text-gray-300")}>-</button>
                                <button
                                  onClick={() => setQtyEditor({ id: item.id, value: String(item.quantity) })}
                                  className={cn("font-black text-[11px] w-[72px] text-center truncate transition", isLight ? "text-slate-900 hover:text-purple-700" : "text-white hover:text-purple-300")}
                                  title="Edit quantity"
                                >
                                  {formatQtyDisplay(item.quantity, item.salesUnit)}
                                </button>
                                <button onClick={() => updateLocalQty(item.id, 1)} className={cn("w-7 h-7 rounded-md flex items-center justify-center transition active:scale-95 text-sm font-bold", isLight ? "bg-slate-200 hover:bg-slate-300 text-slate-800" : "bg-gray-800 hover:bg-gray-700 text-gray-300")}>+</button>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className={cn("text-xs font-black", isLight ? "text-slate-900" : "text-white")}>{formatCurrency(item.price * item.quantity)}</div>
                                <button
                                  onClick={() => {
                                    setOptionsModalTarget({
                                      item: mi || { name: item.displayName || item.name, price: item.price },
                                      cartItemId: item.id,
                                      existingQty: item.quantity,
                                      existingIsParcel: (item as any).isParcel || item.displayName?.includes('[PARCEL]'),
                                      existingNotes: (item as any).notes || '',
                                      existingSelectedModifiers: item.modifiers || [],
                                    });
                                  }}
                                  className={cn("text-gray-400 hover:text-indigo-400 transition p-1 rounded", isLight ? "hover:bg-slate-200" : "hover:bg-gray-800")}
                                  title="Edit Item Options (Parcel, Modifiers, Notes)"
                                >
                                  <Edit size={13} />
                                </button>
                                <button onClick={() => removeLocalItem(item.id)} className="text-gray-400 hover:text-red-500 transition">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Summary & Generate Token */}
          <div className={cn("border-t transition-colors duration-200", isLight ? "bg-slate-50 border-slate-200 text-slate-900" : "bg-[#0f1014] border-gray-800 text-white")}>
            {browsingOrderIndex !== null && todayTokens[browsingOrderIndex] ? (
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Bill #{todayTokens[browsingOrderIndex].tokenNumber || todayTokens[browsingOrderIndex].id} Total</span>
                  <span className="text-xl font-black text-purple-600">{formatCurrency(todayTokens[browsingOrderIndex].total || 0)}</span>
                </div>
                <div className={cn("flex justify-between items-center text-xs font-semibold p-2.5 rounded-lg border", isLight ? "bg-white border-slate-200 text-slate-700" : "bg-[#16181e] border-gray-800 text-gray-300")}>
                  <span>Status: <strong className="uppercase text-green-600">{todayTokens[browsingOrderIndex].status || 'paid'}</strong></span>
                  {todayTokens[browsingOrderIndex].customerName && (
                    <span>Customer: <strong>{todayTokens[browsingOrderIndex].customerName}</strong></span>
                  )}
                </div>
                <button
                  onClick={() => setBrowsingOrderIndex(null)}
                  className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-xl font-black text-xs shadow-lg tracking-wide uppercase transition active:scale-[0.98] flex items-center justify-center gap-1.5"
                >
                  Return to Current Bill
                </button>
              </div>
            ) : (
              <>
                {/* Customer fields */}
                <div className={cn("p-2.5 border-b flex gap-2 relative", isLight ? "border-slate-200" : "border-gray-800/50")}>
                  <div className="relative flex-1">
                    <User className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 z-10", isLight ? "text-slate-300" : "text-slate-600")} />
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Cust Name * (Required)"
                      className={cn("w-full pl-8 pr-3 py-2 border-2 rounded-md text-[11px] font-bold focus:outline-none transition shadow-sm", isLight ? "bg-slate-900 border-purple-600 text-white placeholder-slate-400 focus:ring-2 focus:ring-purple-400" : "bg-slate-100 border-purple-500 text-slate-950 placeholder-slate-500 focus:ring-2 focus:ring-purple-400")}
                    />
                  </div>
                  <div className="relative flex-1">
                    <Phone className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 z-10", isLight ? "text-slate-300" : "text-slate-600")} />
                    <input
                      type="tel"
                      value={customerPhone}
                      onFocus={() => setShowCustomerDropdown(true)}
                      onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                      onChange={(e) => { setCustomerPhone(e.target.value); setShowCustomerDropdown(true); }}
                      placeholder="Phone (Opt)"
                      className={cn("w-full pl-8 pr-3 py-2 border-2 rounded-md text-[11px] font-bold focus:outline-none transition shadow-sm", isLight ? "bg-slate-900 border-purple-600 text-white placeholder-slate-400 focus:ring-2 focus:ring-purple-400" : "bg-slate-100 border-purple-500 text-slate-950 placeholder-slate-500 focus:ring-2 focus:ring-purple-400")}
                    />
                    {showCustomerDropdown && customerSuggestions.length > 0 && (
                      <div className={cn("absolute bottom-full mb-1 right-0 w-64 border rounded-xl z-50 shadow-2xl overflow-hidden", isLight ? "bg-white border-slate-300" : "bg-[#1a1c23] border-gray-800")}>
                        {customerSuggestions.map((c: any) => (
                          <button
                            key={c.id}
                            onMouseDown={(e) => { e.preventDefault(); setCustomerPhone(c.phone || ''); setCustomerName(c.name || ''); setShowCustomerDropdown(false); }}
                            className={cn("w-full text-left px-4 py-3 flex justify-between items-center transition-colors border-b last:border-0", isLight ? "hover:bg-slate-100 border-slate-200" : "hover:bg-gray-800 border-gray-800/50")}
                          >
                            <div>
                              <div className={cn("text-sm font-bold", isLight ? "text-slate-900" : "text-white")}>{c.name || 'Unknown'}</div>
                              <div className={cn("text-xs font-medium", isLight ? "text-slate-500" : "text-gray-400")}>{c.phone}</div>
                            </div>
                            {c.loyaltyPoints > 0 && (
                              <div className="text-[10px] font-bold bg-[#7c5cfc]/20 text-[#7c5cfc] px-2 py-1 rounded">{c.loyaltyPoints} pts</div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Totals */}
                <div className={cn("p-4 space-y-2 border-b text-[11px] font-bold", isLight ? "border-slate-200 text-slate-700" : "border-gray-800/50 text-gray-400")}>
                  {existingTokenItems.length > 0 && (
                    <div className="flex justify-between">
                      <span>Existing Subtotal</span>
                      <span>₹{existingSubtotal.toFixed(2)}</span>
                    </div>
                  )}
                  {localCartSubtotal > 0 && (
                    <div className={cn("flex justify-between", isLight ? "text-slate-800" : "text-gray-300")}>
                      <span>New Items Subtotal</span>
                      <span>{formatCurrency(localCartSubtotal)}</span>
                    </div>
                  )}
                  {localCartTax > 0 && (
                    <div className={cn("flex justify-between", isLight ? "text-slate-800" : "text-gray-300")}>
                      <span>New Items GST/TAX</span>
                      <span>{formatCurrency(localCartTax)}</span>
                    </div>
                  )}
                  <div className={cn("flex justify-between items-center text-base font-black pt-2 border-t mt-2", isLight ? "text-slate-900 border-slate-300" : "text-white border-gray-800")}>
                    <span>TOTAL DUE</span>
                    {isEditingTotal ? (
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-black text-green-600">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          autoFocus
                          value={totalInputVal}
                          onChange={(e) => setTotalInputVal(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const val = parseFloat(totalInputVal);
                              if (!isNaN(val) && val >= 0) {
                                setCustomTotalOverride(val);
                                toast.success(`Total updated to ₹${val.toFixed(2)}`);
                              } else {
                                setCustomTotalOverride(null);
                              }
                              setIsEditingTotal(false);
                            } else if (e.key === 'Escape') {
                              setIsEditingTotal(false);
                            }
                          }}
                          onBlur={() => {
                            const val = parseFloat(totalInputVal);
                            if (!isNaN(val) && val >= 0) {
                              setCustomTotalOverride(val);
                            } else {
                              setCustomTotalOverride(null);
                            }
                            setIsEditingTotal(false);
                          }}
                          className={cn(
                            "w-28 px-2 py-1 border-2 rounded-lg text-base font-black outline-none shadow-inner",
                            isLight ? "bg-white border-green-600 text-green-900" : "bg-[#0f1014] border-green-400 text-green-300"
                          )}
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setTotalInputVal(String(displayTotal));
                          setIsEditingTotal(true);
                        }}
                        className={cn(
                          "flex items-center gap-1.5 px-2 py-1 rounded-lg border transition group cursor-pointer hover:scale-105 active:scale-95",
                          customTotalOverride !== null
                            ? (isLight ? "bg-amber-100 border-amber-400 text-amber-900 font-black" : "bg-amber-500/20 border-amber-500/50 text-amber-300 font-black")
                            : (isLight ? "bg-green-50 border-green-300 text-green-700 hover:bg-green-100 font-black" : "bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20 font-black")
                        )}
                        title="Click to edit TOTAL DUE amount for this bill"
                      >
                        <span className="font-black text-base">{formatCurrency(displayTotal)}</span>
                        <Edit size={13} className="opacity-70 group-hover:opacity-100" />
                        {customTotalOverride !== null && (
                          <span className="text-[9px] font-bold uppercase bg-amber-500 text-black px-1.5 py-0.5 rounded">Edited</span>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Generate Token button */}
                <div className="p-3">
                  <button
                    id="btn-create-token"
                    onClick={() => { isAppendingRef.current = Boolean(loadedToken); createToken.mutate(); }}
                    disabled={localCart.length === 0 || createToken.isPending}
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
                        onClick={() => { if (lastToken) printTokenSlip(lastToken, localCart, customerName, customerPhone, terminal?.name || 'SMARTGONEXT Bakery', billSettings); }}
                        className="w-full py-2.5 border border-gray-800 text-gray-400 hover:text-white hover:border-gray-600 hover:bg-gray-800/50 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Reprint Last Token (#{lastToken.tokenNumber})
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Pack picker modal ── */}
      {packPickerItem && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[150]" onClick={() => setPackPickerItem(null)}>
          <div className="bg-[#1a1c23] rounded-xl border border-gray-800 p-4 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="text-white font-black text-sm uppercase tracking-wide mb-3">Select Pack</div>
            <div className="text-gray-400 text-xs mb-3">{packPickerItem.name}</div>
            <div className="space-y-2">
              {getPackOptions(packPickerItem).map((pack, idx) => (
                <button
                  key={`${pack.label}-${idx}`}
                  autoFocus={idx === 0}
                  onClick={() => {
                    const displayName = `${packPickerItem.name} - ${pack.label}`;
                    const newId = addCartEntry({
                      item: packPickerItem,
                      price: Number(pack.price),
                      purchaseRate: pack.purchaseRate,
                      profitPercent: pack.profitPercent,
                      displayName,
                      salesUnit: pack.unitLabel || packPickerItem.salesUnit || null,
                      quantity: 1,
                    });
                    void attachInventoryMRPsToCartItem(newId, displayName);
                    setPackPickerItem(null);
                  }}
                  className="w-full text-left px-3 py-2 rounded bg-[#0f1014] border border-gray-800 hover:border-purple-500/50 text-white text-sm flex items-center justify-between"
                >
                  <span>{pack.label}</span>
                  <span className="font-black text-purple-300">{formatCurrency(Number(pack.price))}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 text-right">
              <button className="px-3 py-1.5 text-xs bg-gray-800 rounded text-gray-300" onClick={() => setPackPickerItem(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Qty editor modal ── */}
      {qtyEditor && (() => {
        const cartItem = localCart.find((i) => i.id === qtyEditor.id);
        if (!cartItem) return null;
        const presets = getQtyPresets(cartItem.salesUnit);
        return (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[150]" onClick={() => setQtyEditor(null)}>
            <div className="bg-[#1a1c23] rounded-xl border border-gray-800 p-4 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
              <div className="text-white font-black text-sm uppercase tracking-wide mb-2">Edit Quantity</div>
              <div className="text-gray-400 text-xs mb-3">{cartItem.displayName || cartItem.name}</div>

              <select
                className="w-full bg-[#0f1014] border border-gray-700 text-white text-xs rounded-lg px-2 py-2 mb-2"
                value=""
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (Number.isFinite(val) && val > 0) setQtyEditor({ id: qtyEditor.id, value: String(val) });
                }}
              >
                <option value="">Preset quantity</option>
                {presets.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>

              <input
                autoFocus
                value={qtyEditor.value}
                onChange={(e) => setQtyEditor({ id: qtyEditor.id, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setQtyEditor(null);
                  if (e.key === 'Enter') {
                    const parsed = parseQtyInput(qtyEditor.value);
                    if (parsed == null) { toast.error('Enter a valid quantity'); return; }
                    setLocalQtyAbsolute(qtyEditor.id, parsed);
                    setQtyEditor(null);
                  }
                }}
                placeholder="Type quantity (e.g. 0.5)"
                className="w-full bg-[#0f1014] border border-gray-700 text-white text-sm rounded-lg px-3 py-2"
              />
              <div className="mt-2 text-xs text-gray-400">Preview: {formatQtyDisplay(Number(qtyEditor.value || 0), cartItem.salesUnit)}</div>

              <div className="mt-4 flex justify-end gap-2">
                <button className="px-3 py-1.5 text-xs bg-gray-800 rounded text-gray-300" onClick={() => setQtyEditor(null)}>Cancel</button>
                <button
                  className="px-3 py-1.5 text-xs bg-purple-600 rounded text-white font-bold"
                  onClick={() => {
                    const parsed = parseQtyInput(qtyEditor.value);
                    if (parsed == null) { toast.error('Enter a valid quantity'); return; }
                    setLocalQtyAbsolute(qtyEditor.id, parsed);
                    setQtyEditor(null);
                  }}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Print preview success modal ── */}
      {showPrintPreview && lastToken && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[100] no-print"
          onClick={() => setShowPrintPreview(false)}
        >
          <div className={cn(
            "rounded-3xl p-8 text-center max-w-sm w-full mx-4 shadow-2xl border transform animate-in zoom-in-95 duration-200 transition-colors",
            isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#1a1c23] border-gray-800 text-white"
          )}>
            <div className="w-16 h-16 bg-[#7c5cfc]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Printer className="w-8 h-8 text-[#7c5cfc]" />
            </div>
            <div className={cn("text-7xl font-black mb-1 tracking-tighter", isLight ? "text-slate-900" : "text-white")}>{lastToken.tokenNumber}</div>
            <p className="text-[#7c5cfc] text-sm font-bold uppercase tracking-widest mb-6">Token Printed</p>
            <button
              onClick={() => setShowPrintPreview(false)}
              className={cn(
                "w-full py-3.5 rounded-xl font-bold border transition active:scale-95",
                isLight ? "bg-slate-900 text-white hover:bg-slate-800 border-slate-800" : "bg-gray-800 text-white hover:bg-gray-700 border-gray-700"
              )}
            >
              Ready for Next Customer
            </button>
          </div>
        </div>
      )}

      {/* ── Modifiers Selection Modal ── */}
      {activeModifierItem && (
        <div className="fixed inset-0 bg-[#0f1014]/90 backdrop-blur-sm flex items-center justify-center z-[110] no-print">
          <div className="bg-[#1a1c23] rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl border border-gray-800 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-gray-800">
              <h3 className="text-sm font-black text-white uppercase tracking-wider">Customize {activeModifierItem.name}</h3>
              <button 
                onClick={() => { setActiveModifierItem(null); setSelectedModifiers({}); }}
                className="text-gray-500 hover:text-white transition-colors font-bold text-xs uppercase"
              >
                Close
              </button>
            </div>
            
            <p className="text-xs text-gray-400">Choose your desired add-ons and variations below.</p>
            
            <div className="space-y-4 max-h-[50vh] overflow-y-auto custom-scrollbar pr-1">
              {activeModifierItem.itemModifiers?.map((im: any) => {
                const group = im.modifierGroup;
                if (!group) return null;
                const options = Array.isArray(group.options) ? group.options : [];
                return (
                  <div key={group.id} className="bg-gray-900/50 border border-gray-800 p-3 rounded-xl space-y-2">
                    <div className="flex justify-between items-center">
                      <h4 className="text-[11px] font-black text-gray-300 uppercase tracking-widest">{group.name}</h4>
                      <span className="text-[9px] uppercase font-bold text-gray-500 bg-gray-950 px-1.5 py-0.5 rounded border border-gray-800">Options</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                      {options.map((opt: any, optIdx: number) => {
                        const groupSels = selectedModifiers[group.id] || [];
                        const isSelected = groupSels.some(s => s.name === opt.name);
                        return (
                          <button
                            key={optIdx}
                            type="button"
                            onClick={() => {
                              let newSels = [...groupSels];
                              if (isSelected) {
                                newSels = newSels.filter(s => s.name !== opt.name);
                              } else {
                                newSels.push(opt);
                              }
                              setSelectedModifiers({
                                ...selectedModifiers,
                                [group.id]: newSels
                              });
                            }}
                            className={cn(
                              "flex items-center justify-between text-left p-2 rounded-lg border text-xs transition-all",
                              isSelected 
                                ? "bg-purple-500/10 border-purple-500 text-purple-300 font-bold shadow-[0_0_8px_rgba(124,92,252,0.1)]" 
                                : "bg-[#1a1c23] border-gray-800 hover:bg-gray-800 text-gray-200"
                            )}
                          >
                            <span>{opt.name}</span>
                            <span className={cn("text-[10px]", isSelected ? "text-purple-300 font-extrabold" : "text-green-400 font-bold")}>
                              {opt.price === 0 ? 'Free' : `+₹${Number(opt.price).toFixed(2)}`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-gray-800">
              <div className="text-left">
                <span className="text-[9px] text-gray-500 uppercase font-black tracking-widest block">Extra Price</span>
                <span className="text-sm font-black text-purple-300">
                  +₹{Object.values(selectedModifiers).flat().reduce((sum, opt) => sum + Number(opt.price || 0), 0).toFixed(2)}
                </span>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => { setActiveModifierItem(null); setSelectedModifiers({}); }}
                  className="px-4 py-2 text-xs bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleAddWithModifiers} 
                  className="px-4 py-2 text-xs bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition"
                >
                  Add to Cart
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {optionsModalTarget && (
        <ItemOptionsModal
          isOpen={Boolean(optionsModalTarget)}
          itemName={optionsModalTarget.item.name || optionsModalTarget.item.displayName || 'Item'}
          itemPrice={Number(optionsModalTarget.item.price || 0)}
          salesUnit={optionsModalTarget.item.salesUnit}
          existingQty={optionsModalTarget.existingQty}
          existingIsParcel={optionsModalTarget.existingIsParcel}
          existingNotes={optionsModalTarget.existingNotes}
          existingSelectedModifiers={optionsModalTarget.existingSelectedModifiers}
          modifierGroups={optionsModalTarget.item.itemModifiers?.map((im: any) => im.modifierGroup).filter(Boolean)}
          isLight={isLight}
          onSave={handleSaveItemOptions}
          onCancel={() => setOptionsModalTarget(null)}
        />
      )}
    </div>
  );
}