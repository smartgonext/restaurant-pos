import { useState, useEffect, useRef, useCallback, useMemo, createElement, memo } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
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
  RotateCcw, Wallet, RotateCw, Sun, Moon, X, Zap, Barcode, Check, Edit3
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
import { filterAndRankMenuItems } from '@/lib/posItemSearch';
import {
  getCachedMenuItems,
  setCachedMenuItems,
  getCachedCategories,
  setCachedCategories,
  getCachedSettings,
  setCachedSettings,
} from '@/lib/posCache';
import { useTouchLongPress } from '@/hooks/useTouchLongPress';
import { ItemOptionsModal } from '@/components/modals/ItemOptionsModal';
import { ReorderableCategoryBar } from '@/components/pos/ReorderableCategoryBar';

// ── Axios instance ────────────────────────────────────────────────────────────
const subposApi = axios.create({ baseURL: `${API_BASE_URL}/subpos` });
subposApi.interceptors.request.use((c) => {
  const token = useSubposStore.getState().token || useAuthStore.getState().token;
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

interface Category { id: number; name: string; isKOTEnabled?: boolean; sortOrder?: number; }

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
function getMRPSellingPrice(m: InventoryMRP, fallbackPrice: number = 0): number {
  if (m.sellingPrice !== undefined && m.sellingPrice !== null && Number(m.sellingPrice) > 0) {
    return Number(m.sellingPrice);
  }
  const purchase = Number(m.purchaseRate ?? 0);
  const profit = Number(m.profitPercent ?? 0);
  if (profit > 0 && purchase > 0) {
    return Math.round(purchase * (1 + profit / 100) * 100) / 100;
  }
  if (m.mrp !== undefined && m.mrp !== null && Number(m.mrp) > 0) {
    return Number(m.mrp);
  }
  if (Number(fallbackPrice || 0) > 0) {
    return Number(fallbackPrice);
  }
  return purchase;
}

function getActiveMRPs(mrps: InventoryMRP[]): InventoryMRP[] {
  const active = (mrps ?? []).filter(m => m.isActive !== false);
  const seen = new Set<string>();
  const unique: InventoryMRP[] = [];
  for (const m of active) {
    const sp = Math.round(getMRPSellingPrice(m) * 100) / 100;
    const mrp = Math.round(Number(m.mrp ?? sp) * 100) / 100;
    const key = `${mrp}_${sp}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(m);
    }
  }
  return unique;
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

import { printHtmlOrFallback, printKOTTicket, getPrinterSettings } from '@/lib/electronPrint';

const fmtAmt = (val: number | string | null | undefined) => {
  const n = Number(val || 0);
  if (isNaN(n)) return '0';
  return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(2);
};

// ── Print token slip ──────────────────────────────────────────────────────────
function printTokenSlip(
  token: TokenResult | any,
  items?: LocalCartItem[] | any[],
  customerName?: string,
  customerPhone?: string,
  bakeryName = 'SMARTGONEXT Bakery',
  settings?: BillSettings,
  options?: { isAppend?: boolean; isReprint?: boolean; previousItems?: any[]; previousTotal?: number }
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
    const qrData = token.qrCode || String(token.tokenNumber || token.id || '');
    let qrSvgHtml = '';
    try {
      qrSvgHtml = renderToStaticMarkup(createElement(QRCodeSVG, { value: qrData, size: 160 }));
    } catch (_) {
      qrSvgHtml = `<img class="qr" src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrData)}" alt="QR"/>`;
    }
    const tokenItemsList = (items && items.length > 0) ? items : ((token as any)?.items || []);
    const totalItems = token.itemCount ?? tokenItemsList.length;
    const totalAmt = formatCurrency(Number(token.token?.total ?? (token as any)?.total ?? 0));
    const tokenNum = token.tokenNumber || token.id;
    const resolvedCustName = customerName || token.customerName || '';
    const resolvedCustPhone = customerPhone || token.customerPhone || '';
    const isAppend = Boolean(options?.isAppend);
    const isReprint = Boolean(options?.isReprint);
    const previousItemsList = Array.isArray(options?.previousItems) ? options.previousItems : [];
    const previousTotalAmt = options?.previousTotal !== undefined 
      ? Number(options.previousTotal) 
      : previousItemsList.reduce((sum: number, it: any) => sum + Number(it.total || (Number(it.price || 0) * Number(it.quantity || 1))), 0);

    // Subtotal of newly printed items on this slip
    const slipItemsSubtotal = tokenItemsList.reduce((sum: number, it: any) => {
      const p = Number(it.price || 0);
      const q = Number(it.quantity || 1);
      return sum + Number(it.total || (p * q));
    }, 0);

    const html = `
      <!doctype html><html><head><meta charset="utf-8"><title>Token ${tokenNum}</title>
      <style>body{font-family:Arial,Helvetica,sans-serif;padding:12px;text-align:center;color:#000;margin:0} img.logo{max-height:45px;max-width:120px;margin:0 auto 4px auto;display:block;} svg{display:block;margin:0 auto;}</style>
      </head><body>
        ${cfg.showLogo && cfg.logoUrl ? `<img class="logo" src="${cfg.logoUrl}" alt="Logo" />` : ''}
        ${cfg.showRestaurantInfo ? `<div style="font-size:12pt;font-weight:700;">${finalRestaurantName}</div>` : ''}
        ${cfg.showRestaurantInfo && cfg.restaurantAddress ? `<div style="font-size:8pt;color:#333;">${cfg.restaurantAddress}</div>` : ''}
        ${cfg.showPhoneNumber && cfg.restaurantPhone ? `<div style="font-size:8pt;color:#333;">Ph: ${cfg.restaurantPhone}</div>` : ''}
        ${cfg.showTokenNumber ? `<div style="font-size:15pt;font-weight:900;margin-top:4px;">Token #${tokenNum} ${isReprint ? '<span style="font-size:10pt;color:#555;">[REPRINT]</span>' : ''}</div>` : ''}
        ${isAppend ? `<div style="font-size:9.5pt;font-weight:800;color:#1e3a8a;background:#dbeafe;padding:3px 8px;border-radius:4px;display:inline-block;margin:4px 0;letter-spacing:0.5px;">*** UPDATED TOKEN / ADDED ITEMS ***</div>` : ''}
        ${resolvedCustName ? `<div style="font-size:10pt;margin-top:4px;">${resolvedCustName}${cfg.showPhoneNumber && resolvedCustPhone ? ` · ${resolvedCustPhone}` : ''}</div>` : ''}
        
        ${isAppend && previousItemsList.length > 0 ? `
          <div style="margin: 8px 0 4px 0; border-top: 1px dashed #aaa; padding: 6px 0 2px 0; font-size: 9pt; text-align: left;">
            <div style="font-size:8pt;font-weight:700;color:#555;margin-bottom:4px;text-transform:uppercase;">1. Previous Items</div>
            ${previousItemsList.map((it: any) => `
              <div style="display:flex; justify-content:space-between; margin-bottom: 3px;">
                <span>${it.displayName || it.menuItemName || it.name || 'Item'} x ${it.quantity}</span>
                <span>₹${Number(it.total || (Number(it.price || 0) * Number(it.quantity || 1))).toFixed(2)}</span>
              </div>
            `).join('')}
            <div style="display:flex; justify-content:space-between; font-size:8.5pt; font-weight:700; color:#555; border-top: 1px dotted #ccc; margin-top:3px; padding-top:2px;">
              <span>Old Items Total:</span><span>₹${Number(previousTotalAmt).toFixed(2)}</span>
            </div>
          </div>
        ` : ''}

        ${tokenItemsList.length > 0 ? `
          <div style="margin: ${isAppend ? '4px 0 8px 0' : '8px 0'}; border-top: 1px dashed #aaa; border-bottom: 1px dashed #aaa; padding: 6px 0; font-size: 9pt; text-align: left;">
            <div style="font-size:8pt;font-weight:700;color:${isAppend ? '#b91c1c' : '#666'};margin-bottom:4px;text-transform:uppercase;">${isAppend ? '2. Newly Added Items' : 'Order Items'}</div>
            ${tokenItemsList.map((it: any) => `
              <div style="display:flex; justify-content:space-between; margin-bottom: 3px; font-weight: ${isAppend ? '700' : 'normal'};">
                <span>${it.displayName || it.menuItemName || it.name || 'Item'} x ${it.quantity}</span>
                <span>₹${Number(it.total || (Number(it.price || 0) * Number(it.quantity || 1))).toFixed(2)}</span>
              </div>
            `).join('')}
            ${isAppend ? `
              <div style="display:flex; justify-content:space-between; font-size:8.5pt; font-weight:700; color:#b91c1c; border-top: 1px dotted #ccc; margin-top:3px; padding-top:2px;">
                <span>Added Items Total:</span><span>₹${Number(slipItemsSubtotal).toFixed(2)}</span>
              </div>
            ` : ''}
          </div>
        ` : ''}

        ${isAppend ? `
          <div style="display:flex; justify-content:space-between; font-size:9.5pt; color:#444; margin-top:4px;">
            <span>Old Total:</span><strong>₹${Number(previousTotalAmt).toFixed(2)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:9.5pt; color:#b91c1c; margin-top:2px; font-weight:700;">
            <span>Added Amount:</span><strong>+₹${Number(slipItemsSubtotal).toFixed(2)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:12.5pt; font-weight:900; margin-top:6px; border-top:2px solid #000; padding-top:4px;">
            <span>FINAL TOKEN TOTAL:</span><strong>${totalAmt}</strong>
          </div>
        ` : `
          <div style="font-size:10pt;margin-top:4px;">Total Items: <strong>${totalItems}</strong></div>
          <div style="font-size:12pt;font-weight:700;margin-top:6px;">Total: <strong>${totalAmt}</strong></div>
        `}
        <div style="margin:10px 0;display:flex;justify-content:center;">${qrSvgHtml}</div>
        <div style="font-size:10pt;color:#555">Scan to retrieve order</div>
        <div style="font-size:8pt;color:#777;margin-top:8px;font-weight:600;">Powered by SmartGoNext</div>
      </body></html>
    `;
    const pSettings = getPrinterSettings(settings as any);
    await printHtmlOrFallback(html, { deviceName: pSettings.billPrinterName || undefined });
  };
  return invokePrint().catch(err => console.error('Print token failed', err));
}

// ── Touch Menu Item Card Component (Memoized for Butter-Smooth 60fps POS Touch) ──
const TouchMenuItemCard = memo(function TouchMenuItemCard({
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
  const rawPrice = activeMRPs.length > 0
    ? getMRPSellingPrice(activeMRPs[0], Number(item.price || 0))
    : Number(item.price || 0);
  const displayPrice = rawPrice > 0 ? rawPrice : Number(item.price || 0);

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
        "flex flex-col rounded-lg overflow-hidden border transition-all group scale-100 active:scale-95 select-none cursor-pointer touch-pan-y",
        isDisabled ? "opacity-50 pointer-events-none" : "",
        isLight
          ? "bg-white border-slate-200 hover:border-purple-500 hover:shadow-md text-slate-900"
          : "bg-[#1a1c23] border-gray-800 hover:border-gray-600 text-white"
      )}
    >
      <div className={cn("relative w-full h-32 overflow-hidden flex items-center justify-center p-1.5", isLight ? "bg-slate-50" : "bg-[#14151a]")}>
        <img
          loading="lazy"
          decoding="async"
          src={resolveImageUrl(item.image) || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name.charAt(0))}&background=1a1c23&color=fff`}
          className="w-full h-full object-contain transition-all group-hover:scale-105"
          alt={item.name}
          onError={(e) => {
            e.currentTarget.onerror = null;
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
});

// ─────────────────────────────────────────────────────────────────────────────
// QUANTITY EDITOR MODAL (Auto-selects on open, permits multi-digit input 10, 15, etc.)
// ─────────────────────────────────────────────────────────────────────────────
interface QtyEditorModalProps {
  cartItem: LocalCartItem;
  initialValue: string;
  onApply: (qty: number) => void;
  onClose: () => void;
}

function QtyEditorModal({ cartItem, initialValue, onApply, onClose }: QtyEditorModalProps) {
  const [val, setVal] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Select all on initial mount ONLY, so typing immediately replaces initial number
    // and typing double digits (10, 15) works smoothly without re-selecting on every stroke
    const timer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  const presets = getQtyPresets(cartItem.salesUnit);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseQtyInput(val);
    if (parsed == null || parsed <= 0) {
      toast.error('Enter a valid quantity');
      return;
    }
    onApply(parsed);
  };

  const { theme } = useThemeStore();
  const isLight = theme === 'light';

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[150]" onClick={onClose}>
      <form
        data-enter-ignore="true"
        className={cn("rounded-xl border p-4 w-full max-w-sm shadow-2xl transition-colors", isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#1a1c23] border-gray-800 text-white")}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className={cn("font-black text-sm uppercase tracking-wide mb-2", isLight ? "text-slate-900" : "text-white")}>Edit Quantity</div>
        <div className={cn("text-xs mb-3", isLight ? "text-slate-500" : "text-gray-400")}>{cartItem.displayName || cartItem.name}</div>

        <select
          className={cn("w-full text-xs rounded-lg px-2 py-2 mb-2 border outline-none", isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0f1014] border-gray-700 text-white")}
          value=""
          onChange={(e) => {
            const num = Number(e.target.value);
            if (Number.isFinite(num) && num > 0) setVal(String(num));
          }}
        >
          <option value="">Preset quantity</option>
          {presets.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>

        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              handleSubmit(e);
            }
          }}
          placeholder="Type quantity (e.g. 10, 15, 0.5)"
          className={cn("w-full text-lg font-bold rounded-lg px-3 py-2 border outline-none", isLight ? "bg-white border-slate-300 text-slate-900 focus:border-purple-600 focus:ring-1 focus:ring-purple-600" : "bg-[#0f1014] border-gray-700 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500")}
        />
        <div className={cn("mt-2 text-xs", isLight ? "text-slate-500" : "text-gray-400")}>Preview: {formatQtyDisplay(Number(val || 0), cartItem.salesUnit)}</div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={cn("px-3 py-1.5 text-xs rounded transition", isLight ? "bg-slate-100 text-slate-700 hover:bg-slate-200" : "bg-gray-800 text-gray-300 hover:bg-gray-700")} onClick={onClose}>Cancel</button>
          <button
            type="submit"
            data-submit-btn="true"
            className="px-4 py-2 text-xs bg-purple-600 hover:bg-purple-500 rounded text-white font-bold transition active:scale-95"
          >
            Apply (Enter)
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
import { useEnterKeyNavigation } from '@/hooks/useEnterKeyNavigation';

const POS_SALES_UNITS = [
  'Piece (pc)',
  'Kilogram (kg)',
  'Gram (g)',
  'Liter (L)',
  'Milliliter (ml)',
  'Packet (pkt)',
  'Box (box)',
  'Dozen (dz)',
  'Plate',
  'Portion',
];

interface QuickEditState {
  item: any;
  name: string;
  categoryId: number | string;
  productQR: string;
  salesUnit: string;
  mrp: string;
  purchaseRate: string;
  sellingPrice: string;
  profitPercent: string;
  isSaving: boolean;
  isGeneratingBarcode: boolean;
}

interface InstantAddState {
  isOpen: boolean;
  name: string;
  categoryId: number | string;
  productQR: string;
  salesUnit: string;
  mrp: string;
  purchaseRate: string;
  sellingPrice: string;
  profitPercent: string;
  isSaving: boolean;
  isGeneratingBarcode: boolean;
}

export default function SubPOSTerminal() {
  useEnterKeyNavigation();
  const { isAuthenticated, terminal, token: subposToken, logout } = useSubposStore();
  const { theme, toggleTheme } = useThemeStore();
  const isLight = theme === 'light';
  const { user, token: authUserToken } = useAuthStore();
  const authToken = subposToken || authUserToken;
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
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | string | null>(null);

  const processScannedBarcodeRef = useRef<(rawBarcode: string, skipTokenLookup?: boolean) => boolean>(() => false);

  useWeightedBarcodeScanner((scanResult) => {
    const processed = processScannedBarcodeRef.current(scanResult.rawBarcode);
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

  const [quickEditState, setQuickEditState] = useState<QuickEditState | null>(null);
  const [instantAddState, setInstantAddState] = useState<InstantAddState>({
    isOpen: false,
    name: '',
    categoryId: '',
    productQR: '',
    salesUnit: 'Piece (pc)',
    mrp: '',
    purchaseRate: '',
    sellingPrice: '',
    profitPercent: '',
    isSaving: false,
    isGeneratingBarcode: false,
  });

  const instantNameInputRef = useRef<HTMLInputElement>(null);
  const instantCategorySelectRef = useRef<HTMLSelectElement>(null);
  const instantUnitSelectRef = useRef<HTMLSelectElement>(null);
  const instantMrpInputRef = useRef<HTMLInputElement>(null);
  const instantSellingInputRef = useRef<HTMLInputElement>(null);
  const instantPurchaseInputRef = useRef<HTMLInputElement>(null);
  const isSavingInstantRef = useRef(false);
  const handleOpenInstantAddRef = useRef<(searchVal?: string, explicitBarcode?: string) => Promise<void>>(() => Promise.resolve());

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
      const mrpPrice = getMRPSellingPrice(activeMRPs[0], basePrice);
      if (mrpPrice > 0) basePrice = mrpPrice;
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
  const customerNameInputRef = useRef<HTMLInputElement | null>(null);
  const customerPhoneInputRef = useRef<HTMLInputElement | null>(null);
  const createTokenBtnRef = useRef<HTMLButtonElement | null>(null);
  const focusCustomerName = useCallback(() => {
    if (customerNameInputRef.current) {
      customerNameInputRef.current.focus();
      customerNameInputRef.current.select();
      customerNameInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, []);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [lastToken, setLastToken] = useState<TokenResult | null>(null);
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
  const previousTokenSnapshotRef = useRef<{ items: any[]; total: number } | null>(null);
  const headers = useMemo(() => ({ Authorization: `Bearer ${authToken}` }), [authToken]);

  // ── Post-Print / Cancel-Print Workflow State ──
  const [postPrintPending, setPostPrintPending] = useState<{
    tokenNumber: number | string;
    loadedTokenData: any;
    savedItems: LocalCartItem[];
  } | null>(null);
  const postPrintTimerRef = useRef<any>(null);

  const finalizeSubposOrder = useCallback(() => {
    if (postPrintTimerRef.current) {
      clearTimeout(postPrintTimerRef.current);
      postPrintTimerRef.current = null;
    }
    setPostPrintPending(null);
    setLocalCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setSearchQuery('');
    setLoadedToken(null);
    setExistingTokenItems([]);
    isAppendingRef.current = false;
    toast.success('Bill closed! Ready for next order', { duration: 1200, icon: '✓' });
  }, []);

  const cancelPostPrintAndKeepCart = useCallback(() => {
    if (postPrintTimerRef.current) {
      clearTimeout(postPrintTimerRef.current);
      postPrintTimerRef.current = null;
    }
    setPostPrintPending(prev => {
      if (prev) {
        const qr = prev.loadedTokenData?.qrCode;
        if (qr) {
          subposApi.post(`/token/${qr}/cancel`, {}, { headers }).catch(() => {});
        }
        // Restore all items back into localCart so cashier can edit, add, or generate again!
        setLocalCart(prev.savedItems);
        setLoadedToken(null);
        setExistingTokenItems([]);
        isAppendingRef.current = false;
      }
      return null;
    });
    toast.success('Print cancelled — continue adding items!', { duration: 1500, icon: '🛒' });
  }, [headers]);
  const displayWindowRef = useRef<Window | null>(null);
  const isPresentingRef = useRef(sessionStorage.getItem('subpos_is_presenting') === 'true');
  const [isCustomerDisplayActive, setIsCustomerDisplayActive] = useState(sessionStorage.getItem('subpos_is_presenting') === 'true');

  if (!isAuthenticated) return <Navigate to="/subpos" replace />;

  const debouncedCustomerPhone = useDebounce(customerPhone, 500);

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
  const { data: categories = [], refetch: refetchCategories } = useQuery<Category[]>({
    queryKey: ['subpos-categories', authToken],
    queryFn: async () => {
      const { data } = await subposApi.get('/categories', { headers: { Authorization: `Bearer ${authToken}` } });
      const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      const sorted = [...list].sort((a: any, b: any) => {
        const aKot = Boolean(a.isKOTEnabled);
        const bKot = Boolean(b.isKOTEnabled);
        if (aKot !== bKot) return aKot ? -1 : 1;
        return (Number(a.sortOrder || 0)) - (Number(b.sortOrder || 0));
      });
      setCachedCategories('subpos', sorted);
      return sorted;
    },
    initialData: () => getCachedCategories('subpos'),
    enabled: !!authToken,
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });

  const { data: allItems = [], refetch: refetchItems, isLoading: isItemsLoading, isFetching: isItemsFetching } = useQuery<MenuItem[]>({
    queryKey: ['subpos-items', authToken],
    queryFn: async () => {
      const { data } = await subposApi.get('/items', { headers: { Authorization: `Bearer ${authToken}` } });
      if (Array.isArray(data?.data)) setCachedMenuItems('subpos', data.data);
      return data.data;
    },
    initialData: () => getCachedMenuItems('subpos'),
    enabled: !!authToken,
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });

  const { data: billSettings } = useQuery<BillSettings>({
    queryKey: ['subpos-bill-settings', authToken],
    queryFn: async () => {
      const { data } = await subposApi.get('/bill-settings', { headers: { Authorization: `Bearer ${authToken}` } });
      if (data?.data) setCachedSettings('subpos', data.data);
      return data.data;
    },
    initialData: () => getCachedSettings('subpos') || undefined,
    enabled: !!authToken,
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
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
  const lookupToken = async (overrideCode?: string | any) => {
    const raw = (typeof overrideCode === 'string' ? overrideCode : lookupInput).trim();
    if (!raw) return;

    // Fast-path: If user scanned a typical product barcode (6+ digits) into the token search box, check item catalog first!
    if (raw.length >= 6) {
      const itemAdded = processScannedBarcodeRef.current(raw, true);
      if (itemAdded) {
        setLookupInput('');
        return;
      }
      const isUuidOrToken = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw) || /^(?:TOK(?:EN)?[-_ ]?|#)\d+$/i.test(raw);
      if (!isUuidOrToken) {
        setLookupInput('');
        handleOpenInstantAddRef.current('', raw);
        toast(`⚡ Barcode "${raw}" not in catalog — enter name & MRP to add!`, { icon: '⚡', duration: 2500 });
        return;
      }
    }

    try {
      const isNum = /^\d+$/.test(raw);
      const body = isNum ? { tokenNumber: Number(raw) } : { qrCode: raw };
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
      // Fallback: If token not found, check if staff scanned an item barcode/QR into the token box!
      const itemAdded = processScannedBarcodeRef.current(raw, true);
      if (itemAdded) {
        setLookupInput('');
        return;
      }
      toast.error(err?.response?.data?.error || 'Token not found');
    }
  };

  const clearToken = () => {
    setLoadedToken(null);
    setExistingTokenItems([]);
    setCustomerName('');
    setCustomerPhone('');
  };

  const handleRemoveExistingTokenItem = async (item: LocalCartItem) => {
    if (!loadedToken) return;
    const dbItemId = item.id.startsWith('existing-') ? item.id.replace('existing-', '') : item.id;
    try {
      const { data } = await subposApi.delete(`/token/${loadedToken.qrCode}/items/${dbItemId}`);
      if (data.success && data.data) {
        const updatedToken = data.data;
        setLoadedToken(updatedToken);
        const mapped: LocalCartItem[] = (updatedToken.items || [])
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
        playDeleteSound();
        toast.success(`Removed ${item.displayName || item.name} from token`);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to remove item');
    }
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

  // ── Filtered items with Intelligent Relevance Ranking ──
  const filteredItems = useMemo(() => {
    const weightResult = parseWeightFromBarcode(searchQuery);
    return filterAndRankMenuItems(
      allItems,
      searchQuery,
      searchQuery.trim() ? null : selectedCategoryId,
      weightResult?.productQR
    );
  }, [allItems, searchQuery, selectedCategoryId]);

  const [displayCount, setDisplayCount] = useState(48);

  useEffect(() => {
    setDisplayCount(48);
  }, [searchQuery, selectedCategoryId]);

  const displayedItems = useMemo(() => {
    return filteredItems.slice(0, displayCount);
  }, [filteredItems, displayCount]);

  const handleItemsScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollTop + target.clientHeight >= target.scrollHeight - 250) {
      setDisplayCount(prev => (prev < filteredItems.length ? prev + 48 : prev));
    }
  }, [filteredItems.length]);

  const filteredItemsRef = useRef<MenuItem[]>(filteredItems);
  filteredItemsRef.current = filteredItems;

  const processScannedBarcode = (rawBarcode: string, skipTokenLookup: boolean = false): boolean => {
    const code = String(rawBarcode || '').trim();
    if (!code) return false;

    // Clean URL if full URL is scanned (e.g. 2D scanner reading full URL or path)
    let scannedTokenCode = code;
    const urlMatch = code.match(/\/token\/([a-zA-Z0-9\-]+)/);
    if (urlMatch) {
      scannedTokenCode = urlMatch[1];
    }

    // 1. Token QR code / Token Number detection (UUID, TOK-xxx, TOKEN-xxx, or #xxx)
    if (!skipTokenLookup) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(scannedTokenCode);
      const isTokPrefix = /^(?:TOK(?:EN)?[-_ ]?|#)\d+$/i.test(scannedTokenCode);
      if (isUuid || isTokPrefix) {
        setSearchQuery('');
        lookupToken(scannedTokenCode);
        return true;
      }
    }

    // 2. Weight-based barcode parsing
    const weightResult = parseWeightFromBarcode(code);
    if (weightResult && weightResult.isWeightBased) {
      const item = allItems.find(i => {
        const qr = String(i.productQR || '').trim().toLowerCase();
        const invSku = String(i.inventoryItem?.sku || '').trim().toLowerCase();
        const invBc = String(i.inventoryItem?.barcode || '').trim().toLowerCase();
        
        const targets = new Set<string>();
        if (weightResult.productQR) targets.add(weightResult.productQR.trim().toLowerCase());
        if (weightResult.skuRaw) {
          const raw = weightResult.skuRaw.trim().toLowerCase();
          targets.add(raw);
          const stripped = raw.replace(/^0+/, '');
          if (stripped) {
            targets.add(stripped);
            targets.add(stripped.padStart(2, '0'));
            targets.add(stripped.padStart(3, '0'));
            targets.add(stripped.padStart(4, '0'));
            targets.add(stripped.padStart(5, '0'));
          }
        }
        if (weightResult.prefix && weightResult.skuRaw) {
          targets.add(`${weightResult.prefix}${weightResult.skuRaw}`.trim().toLowerCase());
        }

        if (qr && targets.has(qr)) return true;
        if (invSku && targets.has(invSku)) return true;
        if (invBc && targets.has(invBc)) return true;
        if (Array.isArray(i.inventoryItem?.inventoryMRPs)) {
          if (i.inventoryItem.inventoryMRPs.some((m: any) => m.barcode && targets.has(String(m.barcode).trim().toLowerCase()))) {
            return true;
          }
        }
        return false;
      });
      if (item) {
        const isKg = isKgMeasuredItem(item.salesUnit);
        const qtyToAdd = (isKg || weightResult.isWeightBased) ? weightResult.quantity : 1;
        const allMRPs = item.inventoryItem?.inventoryMRPs ?? [];
        const activeMRPs = getActiveMRPs(allMRPs);
        if (activeMRPs.length > 0) {
          const active = activeMRPs[0];
          const price = getMRPSellingPrice(active, Number(item.price || 0)) || Number(item.price || 0);
          addCartEntry({
            item,
            price,
            mrpId: active.id,
            purchaseRate: active.purchaseRate,
            profitPercent: active.profitPercent,
            displayName: item.name,
            salesUnit: item.salesUnit ?? (isKg ? 'kg' : null),
            quantity: qtyToAdd,
          });
        } else {
          addCartEntry({
            item,
            price: Number(item.price),
            displayName: item.name,
            salesUnit: item.salesUnit ?? (isKg ? 'kg' : null),
            quantity: qtyToAdd,
          });
        }
        setSearchQuery('');
        toast.success(`✓ Added ${item.name}: ${qtyToAdd.toFixed(3).replace(/\.?0+$/, '')}kg`, { duration: 1000, icon: '📦' });
        return true;
      }
    }

    // 3. Pack variant matching
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
      toast.success(`Scanned: ${displayName}`, { duration: 500, icon: '🏷️' });
      return true;
    }

    // 4. Product Barcode / SKU / QR match -> automatically add to cart
    const cleanCode = code.toLowerCase();
    const exactMatch = allItems.find(i => {
      const qr = String(i.productQR || '').trim().toLowerCase();
      const bc = String(i.inventoryItem?.barcode || '').trim().toLowerCase();
      const sku = String(i.inventoryItem?.sku || '').trim().toLowerCase();
      if (qr && qr === cleanCode) return true;
      if (bc && bc === cleanCode) return true;
      if (sku && sku === cleanCode) return true;
      if (Array.isArray(i.inventoryItem?.inventoryMRPs)) {
        if (i.inventoryItem.inventoryMRPs.some((m: any) => String(m.barcode || '').trim().toLowerCase() === cleanCode)) {
          return true;
        }
      }
      return false;
    });
    let finalMatch = exactMatch;
    // 4b. Smart Fallback for 12/13 digit EAN barcodes (e.g. 906010367725 <-> 8906010367725)
    // ONLY executed if exact match was not found AND code is 12 or 13 digits!
    // Never affects short barcodes like 0001, 0002, 101, etc.
    if (!finalMatch && /^\d{12,13}$/.test(code)) {
      const altCode = (code.length === 12 && code.startsWith('90'))
        ? `8${code}`
        : (code.length === 13 && code.startsWith('890'))
          ? code.slice(1)
          : null;
      if (altCode) {
        const altClean = altCode.toLowerCase();
        finalMatch = allItems.find(i => {
          const qr = String(i.productQR || '').trim().toLowerCase();
          const bc = String(i.inventoryItem?.barcode || '').trim().toLowerCase();
          const sku = String(i.inventoryItem?.sku || '').trim().toLowerCase();
          if (qr && qr === altClean) return true;
          if (bc && bc === altClean) return true;
          if (sku && sku === altClean) return true;
          if (Array.isArray(i.inventoryItem?.inventoryMRPs)) {
            if (i.inventoryItem.inventoryMRPs.some((m: any) => String(m.barcode || '').trim().toLowerCase() === altClean)) {
              return true;
            }
          }
          return false;
        });
      }
    }

    if (finalMatch) {
      handleAddToCart(finalMatch);
      setSearchQuery('');
      toast.success(`Scanned: ${finalMatch.name}`, { duration: 500, icon: '🏷️' });
      return true;
    }

    // Check if user entered an exact item name (case-insensitive)
    const exactNameMatch = allItems.find(i => String(i.name || '').trim().toLowerCase() === cleanCode);
    if (exactNameMatch) {
      handleAddToCart(exactNameMatch);
      setSearchQuery('');
      toast.success(`Added ${exactNameMatch.name}`, { duration: 500, icon: '🛒' });
      return true;
    }

    if (skipTokenLookup) {
      return false;
    }

    // Explicit token number / prefix format (#10 or TOK-10)
    const isExplicitToken = /^(?:TOK(?:EN)?[-_ ]?|#)\d+$/i.test(code);
    if (isExplicitToken) {
      setSearchQuery('');
      lookupToken(code);
      return true;
    }

    // ── Item NOT found in catalog -> Automatically open Instant Add with scanned barcode pre-filled! ──
    setSearchQuery('');
    handleOpenInstantAddRef.current('', code);
    toast(`⚡ Barcode "${code}" not found — enter product name & MRP to add!`, { icon: '⚡', duration: 2500 });
    return true;
  };
  processScannedBarcodeRef.current = processScannedBarcode;

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
    toast.success(`Added ${displayName || item.name}`, { duration: 500 });
    return returnedId;
  };

  const lastAddRef = useRef<{ id: number; time: number }>({ id: 0, time: 0 });
  const handleAddToCart = (item: MenuItem) => {
    const now = Date.now();
    if (lastAddRef.current.id === item.id && now - lastAddRef.current.time < 350) {
      return; // Prevent touch double-fire
    }
    lastAddRef.current = { id: item.id, time: now };
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
      const price = getMRPSellingPrice(active, Number(item.price || 0)) || Number(item.price || 0);
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
      const mrpPrice = getMRPSellingPrice(active, basePrice);
      if (mrpPrice > 0) basePrice = mrpPrice;
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

  // ── On-the-spot Quick Edit ──
  const handleOpenQuickEdit = (item: any) => {
    if (!item) return;
    const invMrp = item.inventoryItem?.inventoryMRPs?.[0] || item.inventoryMRPs?.[0];
    const cost = Number(item.inventoryItem?.costPerUnit ?? invMrp?.purchaseRate ?? 0);
    const mrp = Number(invMrp?.mrp ?? item.price ?? 0);
    const price = Number(item.price ?? mrp);
    const profit = (invMrp?.profitPercent != null && invMrp.profitPercent !== '')
      ? String(invMrp.profitPercent)
      : (cost > 0 && price > cost ? String(Number((((price - cost) / cost) * 100).toFixed(2))) : '');

    setQuickEditState({
      item,
      name: item.name || (item as any).displayName || '',
      categoryId: item.categoryId || (categories[0]?.id ?? ''),
      productQR: item.productQR || '',
      salesUnit: item.salesUnit || 'Piece (pc)',
      mrp: mrp > 0 ? String(mrp) : (price > 0 ? String(price) : ''),
      purchaseRate: cost > 0 ? String(cost) : '',
      sellingPrice: price > 0 ? String(price) : '',
      profitPercent: profit,
      isSaving: false,
      isGeneratingBarcode: false,
    });
  };

  const handleSaveQuickEdit = async (overrides?: Partial<QuickEditState>) => {
    if (!quickEditState) return;
    const cur = { ...quickEditState, ...(overrides || {}) };
    if (cur.isSaving) return;
    if (!cur.name.trim()) {
      toast.error('Product name is required');
      return;
    }
    const numPrice = Number(cur.sellingPrice) > 0 
      ? Number(cur.sellingPrice) 
      : Number(cur.mrp || 0);
    if (numPrice <= 0) {
      toast.error('Valid Selling Price or MRP is required');
      return;
    }
    const targetId = cur.item?.id || cur.item?.menuItemId;
    if (!targetId) {
      toast.error('Cannot update item: Missing product ID');
      setQuickEditState(prev => prev ? ({ ...prev, isSaving: false }) : null);
      return;
    }
    setQuickEditState(prev => prev ? ({ ...prev, ...cur, isSaving: true }) : null);
    try {
      const res = await restaurantApi.post(`/restaurant/menu-items/${targetId}/quick-edit`, {
        name: cur.name.trim(),
        categoryId: cur.categoryId ? Number(cur.categoryId) : undefined,
        productQR: cur.productQR.trim() !== '' ? cur.productQR.trim() : '',
        salesUnit: cur.salesUnit || undefined,
        mrp: Number(cur.mrp || 0),
        purchaseRate: Number(cur.purchaseRate || 0),
        price: numPrice,
      });
      if (res.data?.success) {
        toast.success(`⚡ "${cur.name}" updated on the spot!`, { icon: '✅' });
        qc.invalidateQueries({ queryKey: ['subpos-items'] });
        qc.invalidateQueries({ queryKey: ['subpos-categories'] });
        qc.invalidateQueries({ queryKey: ['mainpos-items'] });
        qc.invalidateQueries({ queryKey: ['menu-items'] });
        refetchItems?.();
        refetchCategories?.();
        
        // Update item in localCart if present
        setLocalCart(prev => prev.map(cartIt => {
          if (cartIt.menuItemId === targetId) {
            return {
              ...cartIt,
              displayName: cur.name.trim(),
              price: numPrice,
            };
          }
          return cartIt;
        }));
        setQuickEditState(null);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update item');
      setQuickEditState(prev => prev ? ({ ...prev, isSaving: false }) : null);
    }
  };

  const handleGenerateBarcodeForQuickEdit = async () => {
    if (!quickEditState) return;
    setQuickEditState(prev => prev ? ({ ...prev, isGeneratingBarcode: true }) : null);
    try {
      const res = await restaurantApi.get('/restaurant/menu-items/next-barcode');
      if (res.data?.success && res.data?.barcode) {
        setQuickEditState(prev => prev ? ({ ...prev, productQR: res.data.barcode, isGeneratingBarcode: false }) : null);
      } else {
        setQuickEditState(prev => prev ? ({ ...prev, isGeneratingBarcode: false }) : null);
      }
    } catch {
      setQuickEditState(prev => prev ? ({ ...prev, isGeneratingBarcode: false }) : null);
    }
  };

  // ── Instant Item Add ──
  const handleOpenInstantAdd = async (searchVal?: string, explicitBarcode?: string) => {
    let initialBarcode = '';
    let initialName = '';

    if (explicitBarcode !== undefined && explicitBarcode.trim()) {
      initialBarcode = explicitBarcode.trim();
      initialName = (searchVal || '').trim();
    } else {
      const rawVal = (searchVal || searchQuery || '').trim();
      const isBarcodeLike = /^[A-Za-z0-9\-_]{4,}$/.test(rawVal) && /\d/.test(rawVal);
      initialBarcode = isBarcodeLike ? rawVal : '';
      initialName = !isBarcodeLike ? rawVal : '';
    }

    const firstNonKotCat = categories.find((c: any) => !c.isKOTEnabled) || categories[0];

    setInstantAddState({
      isOpen: true,
      name: initialName,
      categoryId: firstNonKotCat?.id ?? '',
      productQR: initialBarcode,
      salesUnit: 'Piece (pc)',
      mrp: '',
      purchaseRate: '',
      sellingPrice: '',
      profitPercent: '',
      isSaving: false,
      isGeneratingBarcode: !initialBarcode,
    });

    if (!initialBarcode) {
      try {
        const res = await restaurantApi.get('/restaurant/menu-items/next-barcode');
        if (res.data?.success && res.data?.barcode) {
          setInstantAddState(prev => ({
            ...prev,
            productQR: res.data.barcode,
            isGeneratingBarcode: false,
          }));
        } else {
          setInstantAddState(prev => ({ ...prev, isGeneratingBarcode: false }));
        }
      } catch {
        setInstantAddState(prev => ({ ...prev, isGeneratingBarcode: false }));
      }
    }

    setTimeout(() => {
      instantNameInputRef.current?.focus();
      instantNameInputRef.current?.select();
    }, 120);
  };
  handleOpenInstantAddRef.current = handleOpenInstantAdd;

  const handleGenerateBarcodeForInstant = async () => {
    setInstantAddState(prev => ({ ...prev, isGeneratingBarcode: true }));
    try {
      const res = await restaurantApi.get('/restaurant/menu-items/next-barcode');
      if (res.data?.success && res.data?.barcode) {
        setInstantAddState(prev => ({ ...prev, productQR: res.data.barcode, isGeneratingBarcode: false }));
      } else {
        setInstantAddState(prev => ({ ...prev, isGeneratingBarcode: false }));
      }
    } catch {
      setInstantAddState(prev => ({ ...prev, isGeneratingBarcode: false }));
    }
  };

  const handleSaveInstantAdd = async (overrides?: Partial<InstantAddState>) => {
    const cur = { ...instantAddState, ...(overrides || {}) };
    if (isSavingInstantRef.current || cur.isSaving) return;
    if (!cur.name.trim()) {
      toast.error('Product name is required');
      instantNameInputRef.current?.focus();
      return;
    }
    const numPrice = Number(cur.sellingPrice) > 0 
      ? Number(cur.sellingPrice) 
      : Number(cur.mrp || 0);
    if (numPrice <= 0) {
      toast.error('Valid Selling Price or MRP is required');
      instantSellingInputRef.current?.focus();
      return;
    }
    isSavingInstantRef.current = true;
    setInstantAddState(prev => ({ ...prev, ...cur, isSaving: true }));
    try {
      const res = await restaurantApi.post('/restaurant/menu-items/instant-add', {
        name: cur.name.trim(),
        categoryId: cur.categoryId ? Number(cur.categoryId) : undefined,
        productQR: cur.productQR.trim() || undefined,
        salesUnit: cur.salesUnit || 'Piece (pc)',
        mrp: Number(cur.mrp || 0),
        purchaseRate: Number(cur.purchaseRate || 0),
        price: numPrice,
      });
      if (res.data?.success && res.data?.data) {
        const newItem = res.data.data;
        toast.success(`⚡ "${newItem.name}" added & placed in cart!`, { icon: '⚡' });
        qc.invalidateQueries({ queryKey: ['subpos-items'] });
        qc.invalidateQueries({ queryKey: ['subpos-categories'] });
        qc.invalidateQueries({ queryKey: ['mainpos-items'] });
        qc.invalidateQueries({ queryKey: ['menu-items'] });
        refetchItems?.();
        refetchCategories?.();
        
        // Immediately add to cart!
        handleAddToCart(newItem);

        // Reset and close
        setSearchQuery('');
        setInstantAddState(prev => ({ ...prev, isOpen: false, isSaving: false }));
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to instant add item');
      setInstantAddState(prev => ({ ...prev, isSaving: false }));
    } finally {
      setTimeout(() => {
        isSavingInstantRef.current = false;
      }, 500);
    }
  };

  // ── Barcode scan on Enter ──
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const rawBarcode = searchQuery.trim();
      if (!rawBarcode) return;
      processScannedBarcodeRef.current(rawBarcode);
    }
  };

  // ── Cart item actions ──
  const changeLocalItemMRP = (cartItemId: string, selectedMRP: InventoryMRP) => {
    const existingCartItem = localCart.find(p => p.id === cartItemId);
    const fallbackPrice = existingCartItem ? Number(existingCartItem.price || 0) : 0;
    const newPrice = getMRPSellingPrice(selectedMRP, fallbackPrice) || fallbackPrice;
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
  const isTaxInclusiveMode = 
    billSettings?.showGST === false || 
    String((billSettings as any)?.taxMode || '').toLowerCase() === 'inclusive' ||
    (Number((billSettings as any)?.sgstRate ?? 0) === 0 && 
     Number((billSettings as any)?.cgstRate ?? 0) === 0 &&
     Number((billSettings as any)?.igstRate ?? 0) === 0);

  const storeTaxRate = (billSettings?.showGST === false || isTaxInclusiveMode)
    ? 0
    : (billSettings ? (Number(billSettings.sgstRate || 0) + Number(billSettings.cgstRate || 0) + Number(billSettings.igstRate || 0)) : null);

  const localCartTax = isTaxInclusiveMode ? 0 : localCart.reduce((sum, item) => {
    const menu = allItems.find((m) => m.id === item.menuItemId);
    const itemTaxType = String(menu?.taxType || 'internal').toLowerCase();
    if (itemTaxType === 'internal') {
      return sum;
    }
    const taxRate = (storeTaxRate !== null && storeTaxRate !== undefined) ? storeTaxRate : Number(menu?.taxPercent ?? 0);
    const line = getLineTaxBreakdown(Number(item.price) * Number(item.quantity), itemTaxType, taxRate);
    return sum + Number(line.tax || 0);
  }, 0);
  const localCartFinal = isTaxInclusiveMode ? localCartSubtotal : localCart.reduce((sum, item) => {
    const menu = allItems.find((m) => m.id === item.menuItemId);
    const itemTaxType = String(menu?.taxType || 'internal').toLowerCase();
    if (itemTaxType === 'internal') {
      return sum + (Number(item.price) * Number(item.quantity));
    }
    const taxRate = (storeTaxRate !== null && storeTaxRate !== undefined) ? storeTaxRate : Number(menu?.taxPercent ?? 0);
    const line = getLineTaxBreakdown(Number(item.price) * Number(item.quantity), itemTaxType, taxRate);
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
      const resolvedCustName = customerName?.trim() || 'Walk-in Customer';
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
        isAppendingRef.current = false;
        previousTokenSnapshotRef.current = null;
        const { data } = await subposApi.post('/token/create', {
          items: itemsPayload,
          customerName: resolvedCustName,
          customerPhone: customerPhone || undefined,
          staffId: user?.id,
        }, { headers });
        return { ...(data.data as TokenResult), itemCount: localCart.length };
      } else {
        isAppendingRef.current = true;
        const prevItems = (existingTokenItems && existingTokenItems.length > 0)
          ? [...existingTokenItems]
          : ((loadedToken.items || []).filter((i: any) => !i.isRemoved).map((i: any) => ({
              id: i.id,
              name: i.menuItem?.name || i.menuItemName || 'Item',
              displayName: i.menuItemName || i.menuItem?.name || 'Item',
              price: Number(i.price ?? 0),
              quantity: Number(i.quantity ?? 1),
              total: Number(i.total || (Number(i.price ?? 0) * Number(i.quantity ?? 1))),
            })));
        previousTokenSnapshotRef.current = {
          items: prevItems,
          total: existingSubtotal || Number(loadedToken.subtotal || loadedToken.total || 0),
        };
        const { data } = await subposApi.post(`/token/${loadedToken.qrCode}/items/bulk`, {
          items: itemsPayload,
          staffId: user?.id,
        }, { headers });
        const t = data.data;
        return {
          tokenId: t.id, tokenNumber: t.tokenNumber, qrCode: t.qrCode, qrUrl: `/token/${t.qrCode}`,
          itemCount: localCart.length,
          token: { subtotal: Number(t.subtotal ?? 0), sgst: Number(t.sgst ?? 0), cgst: Number(t.cgst ?? 0), igst: Number(t.igst ?? 0), total: Number(t.total ?? 0) },
        } as TokenResult;
      }
    },
    onSuccess: async (result) => {
      playTokenSound();
      setLastToken(result);
      
      const resolvedCustName = customerName?.trim() || 'Walk-in Customer';
      const pSettings = getPrinterSettings(billSettings as any);

      // Check if cart contains any KOT items and print to dedicated KOT printer
      const isKotCartItem = (i: LocalCartItem) =>
        Boolean((i as any).category?.isKOTEnabled) || (!i.inventoryItemMRPId && !i.salesUnit);
      const kotItems = localCart.filter(isKotCartItem);

      const hasDedicatedKotPrinter = Boolean(pSettings.kotPrinterName && (!pSettings.billPrinterName || pSettings.kotPrinterName.trim().toLowerCase() !== pSettings.billPrinterName.trim().toLowerCase()));
      if (kotItems.length > 0 && pSettings.autoPrintKot && hasDedicatedKotPrinter) {
        printKOTTicket({
          tokenNumber: result.tokenNumber,
          customerName: resolvedCustName,
          customerPhone,
          time: new Date(),
          orderType: 'Sub POS Token',
          waiterName: terminal?.name,
          items: kotItems.map(ki => ({
            name: ki.name,
            quantity: ki.quantity,
            unit: ki.salesUnit || undefined,
          }))
        }, terminal?.name || 'SMARTGONEXT Bakery', billSettings).catch(err => {
          console.error('[KOT] SubPOS print KOT error:', err);
        });
      }

      if (!isAppendingRef.current) setTodayCount((c) => c + 1);

      // Snapshot saved token state before print dialog opens
      const savedSnapshot: LocalCartItem[] = [
        ...existingTokenItems,
        ...localCart.map((i, idx) => ({ ...i, id: i.id || `saved-${Date.now()}-${idx}` }))
      ];
      const tokenObj = {
        ...result,
        id: result.tokenId || (result as any).id,
        tokenNumber: result.tokenNumber,
        qrCode: result.qrCode,
        customerName: resolvedCustName,
        customerPhone,
        items: savedSnapshot,
      };

      if (pSettings.autoPrintBill) {
        const prevSnap = previousTokenSnapshotRef.current;
        await printTokenSlip(
          result,
          localCart,
          resolvedCustName,
          customerPhone,
          terminal?.name || 'SMARTGONEXT Bakery',
          billSettings,
          {
            isAppend: isAppendingRef.current,
            previousItems: prevSnap?.items,
            previousTotal: prevSnap?.total,
          }
        );
      }

      toast.success(`Token #${result.tokenNumber} generated!`, { duration: 1500 });

      // Once bill is printed, automatically close bill and reset for next customer
      finalizeSubposOrder();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to create token');
    },
  });

  const presentToCustomer = async () => {
    const activeRid = user?.restaurant?.id || (terminal as any)?.restaurantId || (billSettings as any)?.restaurantId || '';
    const ridParam = activeRid ? `rid=${encodeURIComponent(String(activeRid))}` : '';
    const displayUrl = `/admin/customer-display${ridParam ? `?${ridParam}` : ''}`;

    // Electron: use IPC to open dedicated customer display window
    const electron = (window as any).electron || (window as any).electronAPI;
    if (electron && electron.openCustomerDisplay) {
      electron.openCustomerDisplay(displayUrl);
      isPresentingRef.current = true;
      setIsCustomerDisplayActive(true);
      sessionStorage.setItem('subpos_is_presenting', 'true');
      toast.success('Customer screen opened on secondary monitor', { duration: 2500 });
      return;
    }

    if (localCart.length > 0) {
      const mappedItems = localCart.map(i => {
        const mi = allItems.find(ai => ai.id === i.menuItemId);
        const resolvedName = i.displayName || i.name;
        const resolved = resolveImageUrl(mi?.image ?? null) ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(resolvedName.charAt(0) || 'A')}&background=1a1c23&color=fff`;
        return { menuItemId: i.menuItemId, name: resolvedName, price: i.price, quantity: i.quantity, image: resolved };
      });
      const subtotal = mappedItems.reduce((s, it) => s + it.price * it.quantity, 0);
      const tax = mappedItems.reduce((sum, item) => {
        const menu = allItems.find(m => m.id === item.menuItemId);
        const line = getLineTaxBreakdown(Number(item.price) * Number(item.quantity), menu?.taxType, Number(menu?.taxPercent ?? 0));
        return sum + Number(line.tax || 0);
      }, 0);
      const payload = { restaurantId: activeRid, items: mappedItems, subtotal, tax, total: subtotal + tax };
      try {
        if (socket) socket.emit('customer_display_update', payload);
      } catch { /* silent */ }
    }

    const isFile = window.location.protocol === 'file:';
    const baseUrl = isFile
      ? `${window.location.origin}${window.location.pathname}`
      : window.location.origin;
    const finalUrl = isFile ? `${baseUrl}#${displayUrl}` : `${baseUrl}${displayUrl}`;

    if (displayWindowRef.current && !displayWindowRef.current.closed) {
      displayWindowRef.current.location.href = finalUrl;
      displayWindowRef.current.focus();
    } else {
      const newTab = window.open(finalUrl, '_blank');
      if (newTab) {
        displayWindowRef.current = newTab;
      } else {
        window.location.href = finalUrl;
      }
    }

    isPresentingRef.current = true;
    setIsCustomerDisplayActive(true);
    sessionStorage.setItem('subpos_is_presenting', 'true');
    toast.success('Customer display opened', { duration: 2000 });
  };

  // Auto Broadcast Live Cart to Customer Display
  useEffect(() => {
    if (!socket || !isPresentingRef.current) return;
    const activeRid = user?.restaurant?.id || (terminal as any)?.restaurantId || (billSettings as any)?.restaurantId;
    if (!activeRid) return;
    const mappedItems = localCart.map(i => {
      const mi = allItems.find(ai => ai.id === i.menuItemId);
      const resolvedName = i.displayName || i.name;
      const resolved = resolveImageUrl(mi?.image ?? null) ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(resolvedName.charAt(0) || 'A')}&background=1a1c23&color=fff`;
      return { menuItemId: i.menuItemId, name: resolvedName, price: i.price, quantity: i.quantity, image: resolved };
    });
    const subtotal = mappedItems.reduce((s, it) => s + it.price * it.quantity, 0);
    const tax = mappedItems.reduce((sum, item) => {
      const menu = allItems.find(m => m.id === item.menuItemId);
      const line = getLineTaxBreakdown(Number(item.price) * Number(item.quantity), menu?.taxType, Number(menu?.taxPercent ?? 0));
      return sum + Number(line.tax || 0);
    }, 0);
    const payload = { restaurantId: activeRid, items: mappedItems, subtotal, tax, total: subtotal + tax };
    socket.emit('customer_display_update', payload);
  }, [localCart, socket, user?.restaurant?.id, terminal, billSettings, allItems]);

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
          <div className="flex items-center gap-1.5">
            <span className={cn("font-black tracking-wider text-sm uppercase", isLight ? "text-slate-900" : "text-white")}>AMORA</span>
            <span className={cn("text-xs font-semibold tracking-wide", isLight ? "text-slate-500" : "text-slate-400")}>·</span>
            <span className={cn("font-bold uppercase tracking-wide text-sm", isLight ? "text-slate-800" : "text-gray-200")}>{terminal?.name ?? 'SUB POS'}</span>
          </div>
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
          {/* Customer Screen Button */}
          <button
            onClick={() => presentToCustomer()}
            className={cn(
              "py-1.5 px-2.5 rounded-md text-[11px] font-bold uppercase transition flex items-center gap-1.5 border",
              isCustomerDisplayActive
                ? (isLight ? "bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200" : "bg-emerald-950/60 text-emerald-300 border-emerald-700/80 hover:bg-emerald-900/60")
                : (isLight ? "bg-slate-200 text-slate-800 border-slate-300 hover:bg-slate-300" : "bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700")
            )}
            title="Open or refresh Customer Display on secondary monitor"
          >
            <span>🖥️ Customer Screen</span>
            <span className={cn("w-2 h-2 rounded-full", isCustomerDisplayActive ? "bg-emerald-400 animate-pulse" : "bg-gray-400")} />
          </button>
          <span className={cn(
            "px-2.5 py-1 text-[10px] font-bold uppercase rounded-md border tracking-wider",
            isLight ? "bg-slate-100 text-slate-700 border-slate-300" : "bg-gray-800 text-gray-300 border-gray-700"
          )}>
            {combinedCartItemsCount} ITEMS
          </span>
          <button
            type="button"
            onClick={() => handleOpenInstantAdd()}
            className={cn(
              "py-1.5 px-3 rounded-md text-[11px] font-black uppercase transition flex items-center gap-1.5 border shadow-sm cursor-pointer",
              isLight 
                ? "bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200" 
                : "bg-amber-950/60 text-amber-300 border-amber-700/80 hover:bg-amber-900/60"
            )}
            title="Instant Add new product to store and add straight to cart"
          >
            <Zap size={13} className="text-amber-400 fill-amber-400" />
            <span>⚡ Instant Item</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (selectedCategoryId === 'kot') {
                setSelectedCategoryId(null);
              } else {
                setSelectedCategoryId('kot');
                setSearchQuery('');
              }
            }}
            title="KOT Products - Filter all kitchen & prepared items"
            className={cn(
              "py-2 px-3 rounded-md text-xs font-black uppercase transition flex items-center gap-1.5 shadow-sm cursor-pointer",
              selectedCategoryId === 'kot'
                ? "bg-amber-500 hover:bg-amber-400 text-black shadow-[0_0_12px_rgba(245,158,11,0.4)]"
                : (isLight ? "bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300" : "bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border border-amber-800/60")
            )}
          >
            <span>🍳 KOT P</span>
            <span className={cn(
              "text-[10px] px-1.5 py-0.2 rounded-full font-black",
              selectedCategoryId === 'kot' ? "bg-black/20 text-black" : "bg-amber-500/20 text-amber-300"
            )}>
              {allItems.filter(i => Boolean(i.category?.isKOTEnabled)).length}
            </span>
          </button>
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
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  onFocus={(e) => (e.target as HTMLInputElement).select()}
                  data-enter-ignore="true"
                  data-enter-action="search"
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
            <ReorderableCategoryBar
              categories={categories}
              activeCategoryId={selectedCategoryId}
              onSelectCategory={(id) => setSelectedCategoryId(id === 'all' || id === null ? null : (id === 'kot' ? 'kot' : Number(id)))}
              isLight={isLight}
              storageKey="pos_category_order_v2"
              className="w-full max-w-full min-w-0"
            />

            {/* Instant Add banner when search yields no results */}
            {filteredItems.length === 0 && searchQuery.trim() && (
              <div className={cn(
                "p-2.5 rounded-xl border flex items-center justify-between gap-3 animate-in fade-in duration-200",
                isLight ? "bg-amber-50 border-amber-200 text-amber-950" : "bg-amber-950/30 border-amber-800/60 text-amber-200"
              )}>
                <div className="text-xs">
                  <span className="font-bold">No item found for "{searchQuery.trim()}"</span>
                  <p className="text-[10px] opacity-75">Click to add this item immediately to store and cart</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenInstantAdd(searchQuery.trim())}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-black text-xs flex items-center gap-1.5 shadow-md transition-all shrink-0 cursor-pointer"
                >
                  <Zap size={13} className="fill-black" />
                  <span>+ Instant Add</span>
                </button>
              </div>
            )}
          </div>

          {/* Items grid */}
          <div
            onScroll={handleItemsScroll}
            className="flex-1 overflow-y-auto custom-scrollbar pb-3 rounded-md pr-1"
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 content-start">
              {allItems.length === 0 && (isItemsLoading || isItemsFetching) ? (
                Array.from({ length: 24 }).map((_, idx) => (
                  <div
                    key={`sub-skeleton-${idx}`}
                    className={cn(
                      "rounded-xl p-3 border flex flex-col justify-between h-[115px] animate-pulse",
                      isLight ? "bg-slate-100 border-slate-200" : "bg-[#1c1e27] border-gray-800/80"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className={cn("h-4 rounded w-3/4", isLight ? "bg-slate-200" : "bg-gray-700/60")} />
                      <div className={cn("h-4 w-6 rounded", isLight ? "bg-slate-200" : "bg-gray-700/60")} />
                    </div>
                    <div className="space-y-1.5">
                      <div className={cn("h-3 rounded w-1/2", isLight ? "bg-slate-200" : "bg-gray-700/60")} />
                      <div className={cn("h-5 rounded w-1/3", isLight ? "bg-slate-300" : "bg-gray-600/60")} />
                    </div>
                  </div>
                ))
              ) : filteredItems.length === 0 ? (
                <div className="col-span-full text-center text-gray-500 py-10 flex flex-col items-center">
                  <Search className="w-12 h-12 text-gray-400 mb-4 opacity-50" />
                  <p className="text-lg font-medium">No items found</p>
                  <p className="text-sm mb-3">Try adjusting the search or category filter.</p>
                  {searchQuery.trim() && (
                    <button
                      type="button"
                      onClick={() => handleOpenInstantAdd(searchQuery.trim())}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs flex items-center gap-1.5 shadow-lg transition-all cursor-pointer"
                    >
                      <Zap size={14} className="fill-black" />
                      <span>Instant Add "{searchQuery.trim()}"</span>
                    </button>
                  )}
                </div>
              ) : (
                displayedItems.map(item => (
                  <TouchMenuItemCard
                    key={item.id}
                    item={item}
                    isLight={isLight}
                    onTap={(it) => handleAddToCart(it)}
                    onLongPress={(it) => setOptionsModalTarget({ item: it })}
                  />
                ))
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
                onClick={(e) => (e.target as HTMLInputElement).select()}
                onFocus={(e) => (e.target as HTMLInputElement).select()}
                data-enter-ignore="true"
                data-enter-action="lookup"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    lookupToken();
                  }
                }}
                placeholder="Scan QR or Enter #"
                className={cn(
                  "flex-1 rounded-md py-2 pl-3 pr-4 text-sm font-black outline-none transition-all",
                  isLight ? "bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-purple-600" : "bg-[#0f1014] border border-gray-800 text-white placeholder-gray-600 focus:border-purple-500"
                )}
              />
              <button onClick={() => lookupToken()} className="bg-purple-600 hover:bg-purple-500 text-white px-4 rounded-md font-bold text-xs transition">
                Find
              </button>
            </div>
            {loadedToken && (
              <div className={cn("p-2.5 border rounded-md flex flex-col gap-1.5 relative overflow-hidden", isLight ? "bg-slate-100 border-slate-300 text-slate-900" : "bg-[#0f1014] border-gray-800 text-white")}>
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
                <div className="flex gap-2 mt-1 relative z-10">
                  <button
                    type="button"
                    onClick={() => {
                      printTokenSlip(loadedToken, loadedToken.items || [], loadedToken.customerName, loadedToken.customerPhone, terminal?.name || 'SMARTGONEXT Bakery', billSettings, { isReprint: true });
                      toast.success(`Reprinting Token #${loadedToken.tokenNumber}`);
                    }}
                    className="flex-1 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-[10px] font-black uppercase flex items-center justify-center gap-1 shadow-sm transition active:scale-95"
                    title="Print full updated token slip for customer"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print Token
                  </button>
                  <button
                    type="button"
                    onClick={clearToken}
                    className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded text-[10px] font-black uppercase transition active:scale-95"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Cart Items scroll area */}
          <div ref={cartScrollRef} className="flex-1 overflow-y-auto p-2.5 custom-scrollbar flex flex-col gap-1.5 relative">
            {browsingOrderIndex !== null && todayTokens[browsingOrderIndex] ? (
              <div className="space-y-2">
                <div className={cn("p-2.5 rounded-lg border flex items-center justify-between text-xs font-bold shadow-sm", isLight ? "bg-amber-100 border-amber-300 text-amber-900" : "bg-amber-500/20 border-amber-500/40 text-amber-300")}>
                  <span>Past Bill #{todayTokens[browsingOrderIndex].tokenNumber || todayTokens[browsingOrderIndex].id} Items ({todayTokens[browsingOrderIndex].items?.length || 0})</span>
                  <button
                    onClick={() => {
                      const cur = todayTokens[browsingOrderIndex];
                      printTokenSlip(cur, cur.items || [], cur.customerName, cur.customerPhone, terminal?.name || 'SMARTGONEXT Bakery', billSettings);
                      toast.success(`Reprinting Token #${cur.tokenNumber || cur.id}`);
                    }}
                    className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-[10px] font-black uppercase flex items-center gap-1 shadow-sm transition active:scale-95"
                    title="Reprint this old token"
                  >
                    <Printer className="w-3.5 h-3.5" /> Reprint
                  </button>
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
                              e.currentTarget.onerror = null;
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
                          <div key={item.id} className={cn("flex gap-3 border p-2 rounded transition items-center justify-between", isLight ? "bg-slate-50 border-slate-200 hover:border-slate-300" : "bg-[#0f1014] border-gray-800/60 hover:border-gray-700")}>
                            <div className="flex gap-2.5 items-center min-w-0 flex-1">
                              <img
                                src={resolveImageUrl(mi?.image ?? null) || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=1a1c23&color=fff`}
                                alt={item.name}
                                className="w-10 h-10 rounded-md object-cover flex-shrink-0"
                                onError={(e) => {
                                  e.currentTarget.onerror = null;
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
                            <button
                              type="button"
                              onClick={() => handleRemoveExistingTokenItem(item)}
                              className="p-2 text-red-500 hover:text-red-700 hover:bg-red-500/10 rounded-lg transition active:scale-95 flex-shrink-0 ml-1"
                              title="Remove item from this token"
                            >
                              <Trash2 size={16} />
                            </button>
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
                              "flex gap-2 p-2 rounded relative overflow-hidden group items-center border transition-all",
                              isLight ? "bg-purple-50/70 border-purple-200 text-slate-900 shadow-sm" : "bg-purple-500/5 border-purple-500/20 text-white"
                            )}>
                              <div className="absolute left-0 top-0 bottom-0 w-1 bg-purple-600" />

                              {/* 🛠️ LEFT: Edit Options Button 🛠️ */}
                              <button
                                onClick={() => {
                                  setOptionsModalTarget({
                                    item: mi || { id: item.menuItemId, name: item.displayName || item.name, price: item.price },
                                    cartItemId: item.id,
                                    existingQty: item.quantity,
                                    existingIsParcel: (item as any).isParcel || item.displayName?.includes('[PARCEL]'),
                                    existingNotes: (item as any).notes || '',
                                    existingSelectedModifiers: item.modifiers || [],
                                  });
                                }}
                                className={cn("p-1.5 rounded-lg border transition flex-shrink-0 ml-1 active:scale-95", isLight ? "bg-white hover:bg-indigo-50 text-indigo-600 border-indigo-200 shadow-xs" : "bg-[#161824] hover:bg-indigo-500/10 text-indigo-400 border-indigo-500/30")}
                                title="Edit Item Options (Parcel, Modifiers, Notes)"
                              >
                                <Edit size={14} />
                              </button>

                              {/* ⚡ Quick Edit Product Button */}
                              <button
                                onClick={() => handleOpenQuickEdit(mi || { id: item.menuItemId, name: item.displayName || item.name, price: item.price })}
                                className={cn("p-1.5 rounded-lg border transition flex-shrink-0 active:scale-95", isLight ? "bg-white hover:bg-purple-50 text-purple-600 border-purple-200 shadow-xs" : "bg-[#161824] hover:bg-purple-500/10 text-purple-400 border-purple-500/30")}
                                title="Quick Edit Product Details (Price, MRP, Barcode, Unit)"
                              >
                                <Edit3 size={13} />
                              </button>

                              <img 
                                src={imgSrc} 
                                alt={label} 
                                className="w-12 h-12 rounded-md object-cover flex-shrink-0 ml-1 mt-0.5" 
                                onError={(e) => {
                                  e.currentTarget.onerror = null;
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
                                            MRP: ₹{fmtAmt(mrpValue)}
                                          </option>
                                        );
                                      })}
                                    </select>
                                    {selectedMRP && (
                                      <div className={cn("text-[10px] px-1 font-semibold flex items-center gap-2", isLight ? "text-slate-700" : "text-gray-300")}>
                                        <span>MRP: <strong className={isLight ? "text-slate-900" : "text-white"}>₹{fmtAmt(selectedMRP.mrp ?? getMRPSellingPrice(selectedMRP))}</strong></span>
                                        <span>·</span>
                                        <span>Rate: <strong className="text-green-500 font-bold">₹{fmtAmt(getMRPSellingPrice(selectedMRP))}</strong></span>
                                      </div>
                                    )}
                                  </div>
                                ) : activeMRPs.length === 1 ? (
                                  <div className={cn("text-[10px] space-y-0.5", isLight ? "text-slate-700" : "text-gray-300")}>
                                    <div className="flex items-center gap-2">
                                      <span>MRP: <strong className={isLight ? "text-slate-900" : "text-white"}>₹{fmtAmt(activeMRPs[0].mrp ?? getMRPSellingPrice(activeMRPs[0]))}</strong></span>
                                      <span>·</span>
                                      <span>Rate: <strong className="text-green-500 font-bold">₹{fmtAmt(getMRPSellingPrice(activeMRPs[0]))}</strong></span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className={cn("text-[11px]", isLight ? "text-slate-600" : "text-gray-400")}>{formatCurrency(item.price)}</div>
                                )}
                              </div>

                              {/* Qty controls + total */}
                              <div className="flex flex-col items-end justify-between gap-2">
                                <div className={cn("flex items-center gap-1 rounded-lg p-1 border", isLight ? "bg-white border-slate-300" : "bg-[#0f1014] border-gray-800")}>
                                  <button
                                    onClick={() => updateLocalQty(item.id, -1)}
                                    className={cn("w-8 h-8 rounded-md flex items-center justify-center transition active:scale-90 text-base font-black select-none", isLight ? "bg-slate-200 hover:bg-slate-300 text-slate-800" : "bg-gray-800 hover:bg-gray-700 text-gray-200")}
                                    title="Decrease quantity"
                                  >
                                    -
                                  </button>
                                  <button
                                    onClick={() => setQtyEditor({ id: item.id, value: String(item.quantity) })}
                                    className={cn("font-black text-[11px] min-w-[56px] text-center truncate px-1 transition", isLight ? "text-slate-900 hover:text-purple-700" : "text-white hover:text-purple-300")}
                                    title="Edit quantity"
                                  >
                                    {formatQtyDisplay(item.quantity, item.salesUnit)}
                                  </button>
                                  <button
                                    onClick={() => updateLocalQty(item.id, 1)}
                                    className={cn("w-8 h-8 rounded-md flex items-center justify-center transition active:scale-90 text-base font-black select-none", isLight ? "bg-slate-200 hover:bg-slate-300 text-slate-800" : "bg-gray-800 hover:bg-gray-700 text-gray-200")}
                                    title="Increase quantity"
                                  >
                                    +
                                  </button>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className={cn("text-xs font-black", isLight ? "text-slate-900" : "text-white")}>{formatCurrency(item.price * item.quantity)}</div>
                                  {/* 🗑️ RIGHT: Normal Delete button 🗑️ */}
                                  <button onClick={() => removeLocalItem(item.id)} className="text-gray-400 hover:text-red-500 transition p-1 rounded hover:bg-red-500/10 active:scale-95" title="Remove item">
                                    <Trash2 size={14} />
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
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => {
                      const cur = todayTokens[browsingOrderIndex];
                      printTokenSlip(cur, cur.items || [], cur.customerName, cur.customerPhone, terminal?.name || 'SMARTGONEXT Bakery', billSettings);
                      toast.success(`Reprinting Token #${cur.tokenNumber || cur.id}...`);
                    }}
                    className={cn(
                      "flex-1 py-3 border rounded-xl font-black text-xs flex items-center justify-center gap-2 transition uppercase shadow-sm active:scale-[0.98]",
                      isLight
                        ? "bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100"
                        : "bg-purple-950/40 border-purple-500/50 text-purple-300 hover:bg-purple-900/50"
                    )}
                  >
                    <Printer className="w-4 h-4 text-purple-400" /> Reprint Token
                  </button>
                  <button
                    onClick={() => setBrowsingOrderIndex(null)}
                    className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-xl font-black text-xs shadow-md tracking-wide uppercase transition active:scale-[0.98] flex items-center justify-center gap-1.5"
                  >
                    Return
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Customer fields */}
                <div className={cn("p-2.5 border-b flex gap-2 relative", isLight ? "border-slate-200" : "border-gray-800/50")}>
                  <div className="relative flex-1">
                    <User className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 z-10", isLight ? "text-slate-300" : "text-slate-600")} />
                    <input
                      ref={customerNameInputRef}
                      type="text"
                      data-enter-ignore="true"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.stopPropagation();
                          customerPhoneInputRef.current?.focus();
                          customerPhoneInputRef.current?.select();
                        }
                      }}
                      placeholder="Cust Name (Optional - Walk-in)"
                      className={cn("w-full pl-8 pr-16 py-2 border-2 rounded-md text-[11px] font-bold focus:outline-none transition shadow-sm", isLight ? "bg-white border-purple-600 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-purple-400" : "bg-slate-900 border-purple-500 text-white placeholder-slate-500 focus:ring-2 focus:ring-purple-400")}
                    />
                    <button
                      type="button"
                      onClick={() => setCustomerName(customerName === 'Walk-in Customer' ? '' : 'Walk-in Customer')}
                      title="Set as Walk-in Customer"
                      className="absolute right-1 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[9px] font-black rounded uppercase transition bg-purple-600/30 text-purple-300 hover:bg-purple-600 hover:text-white"
                    >
                      Walk-in
                    </button>
                  </div>
                  <div className="relative flex-1">
                    <Phone className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 z-10", isLight ? "text-slate-300" : "text-slate-600")} />
                    <input
                      ref={customerPhoneInputRef}
                      type="tel"
                      data-enter-ignore="true"
                      value={customerPhone}
                      onFocus={() => setShowCustomerDropdown(true)}
                      onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                      onChange={(e) => { setCustomerPhone(e.target.value); setShowCustomerDropdown(true); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowCustomerDropdown(false);
                          (e.target as HTMLElement).blur();
                          createTokenBtnRef.current?.click();
                        }
                      }}
                      placeholder="Phone (Opt)"
                      className={cn("w-full pl-8 pr-3 py-2 border-2 rounded-md text-[11px] font-bold focus:outline-none transition shadow-sm", isLight ? "bg-white border-purple-600 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-purple-400" : "bg-slate-900 border-purple-500 text-white placeholder-slate-500 focus:ring-2 focus:ring-purple-400")}
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
                  {loadedToken?.status === 'paid' && (
                    <div className="flex justify-between text-emerald-600 font-bold">
                      <span>Status</span>
                      <span className="uppercase font-black">PAID (₹{Number(loadedToken.total).toFixed(2)})</span>
                    </div>
                  )}
                  <div className={cn("flex justify-between items-center text-base font-black pt-2 border-t mt-2", isLight ? "text-slate-900 border-slate-300" : "text-white border-gray-800")}>
                    <span>{loadedToken?.status === 'paid' && localCart.length === 0 ? 'TOTAL PAID' : 'TOTAL DUE'}</span>
                    <span className={cn("font-black text-xl", isLight ? "text-green-700" : "text-green-400")}>
                      {formatCurrency(
                        loadedToken && loadedToken.status === 'paid' && localCart.length === 0
                          ? Number(loadedToken.total)
                          : calculatedTotal
                      )}
                    </span>
                  </div>
                </div>

                {/* Generate Token button */}
                <div className="p-3">
                  <button
                    ref={createTokenBtnRef}
                    id="btn-create-token"
                    onClick={() => {
                      isAppendingRef.current = Boolean(loadedToken);
                      createToken.mutate();
                    }}
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
        return (
          <QtyEditorModal
            cartItem={cartItem}
            initialValue={qtyEditor.value}
            onApply={(parsed) => {
              setLocalQtyAbsolute(qtyEditor.id, parsed);
              setQtyEditor(null);
            }}
            onClose={() => setQtyEditor(null)}
          />
        );
      })()}


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
          onEditProduct={() => {
            const targetItem = optionsModalTarget.item;
            setOptionsModalTarget(null);
            handleOpenQuickEdit(targetItem);
          }}
        />
      )}

      {/* ── ON-THE-SPOT QUICK PRODUCT EDIT MODAL ── */}
      {quickEditState && (
        <div data-enter-ignore="true" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <form
            onSubmit={(e) => { e.preventDefault(); handleSaveQuickEdit(); }}
            className={cn(
              "w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]",
              isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#14161f] border-gray-800 text-white"
            )}
          >
            {/* Header */}
            <div className={cn(
              "px-5 py-4 border-b flex items-center justify-between",
              isLight ? "bg-slate-50 border-slate-200" : "bg-[#181a24] border-gray-800"
            )}>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <Edit3 size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black uppercase tracking-tight">On-The-Spot Edit Product</h3>
                  <p className="text-[11px] opacity-60">Instantly update price, MRP, barcode, or category</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuickEditState(null)}
                className="p-1.5 rounded-lg opacity-60 hover:opacity-100 hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1 text-xs">
              {/* Product Name */}
              <div>
                <label className="font-bold text-[11px] opacity-70 block mb-1">Product Name *</label>
                <input
                  type="text"
                  value={quickEditState.name}
                  onChange={(e) => setQuickEditState(prev => prev ? ({ ...prev, name: e.target.value }) : null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveQuickEdit();
                    }
                  }}
                  className={cn(
                    "w-full px-3 py-2 rounded-xl border text-sm font-bold outline-none transition-all",
                    isLight ? "bg-white border-slate-300 focus:border-purple-600 text-slate-900" : "bg-black/30 border-gray-700 focus:border-purple-500 text-white"
                  )}
                  placeholder="e.g. Dry Pista 500g"
                />
              </div>

              {/* Category & Barcode */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[11px] opacity-70 block mb-1">Category</label>
                  <select
                    value={quickEditState.categoryId}
                    onChange={(e) => setQuickEditState(prev => prev ? ({ ...prev, categoryId: e.target.value }) : null)}
                    className={cn(
                      "w-full px-3 py-2 rounded-xl border text-xs font-bold outline-none",
                      isLight ? "bg-white border-slate-300 text-slate-900" : "bg-black/30 border-gray-700 text-white"
                    )}
                  >
                    {categories.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {!c.isKOTEnabled ? '(Non-KOT)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-[11px] opacity-70">Barcode / QR</label>
                    <button
                      type="button"
                      onClick={handleGenerateBarcodeForQuickEdit}
                      disabled={quickEditState.isGeneratingBarcode}
                      className="text-[10px] text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw size={10} className={quickEditState.isGeneratingBarcode ? "animate-spin" : ""} />
                      <span>{quickEditState.isGeneratingBarcode ? 'Generating...' : 'Auto'}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={quickEditState.productQR}
                    onChange={(e) => setQuickEditState(prev => prev ? ({ ...prev, productQR: e.target.value }) : null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveQuickEdit();
                      }
                    }}
                    className={cn(
                      "w-full px-3 py-2 rounded-xl border text-xs font-mono font-bold outline-none",
                      isLight ? "bg-white border-slate-300 focus:border-purple-600 text-slate-900" : "bg-black/30 border-gray-700 focus:border-purple-500 text-white"
                    )}
                    placeholder="Barcode number"
                  />
                </div>
              </div>

              {/* Unit & Selling Price */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[11px] opacity-70 block mb-1">Sales Unit</label>
                  <select
                    value={quickEditState.salesUnit}
                    onChange={(e) => setQuickEditState(prev => prev ? ({ ...prev, salesUnit: e.target.value }) : null)}
                    className={cn(
                      "w-full px-3 py-2 rounded-xl border text-xs font-bold outline-none",
                      isLight ? "bg-white border-slate-300 text-slate-900" : "bg-black/30 border-gray-700 text-white"
                    )}
                  >
                    {POS_SALES_UNITS.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-[11px] text-emerald-400 block mb-1">Selling Price (₹) *</label>
                  <input
                    type="number"
                    step="any"
                    value={quickEditState.sellingPrice}
                    onChange={(e) => {
                      const sp = e.target.value;
                      const cost = Number(quickEditState.purchaseRate || 0);
                      const spNum = Number(sp);
                      const profit = cost > 0 && spNum > cost ? String(Number((((spNum - cost) / cost) * 100).toFixed(2))) : quickEditState.profitPercent;
                      setQuickEditState(prev => prev ? ({ ...prev, sellingPrice: sp, profitPercent: profit }) : null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveQuickEdit({ sellingPrice: (e.target as HTMLInputElement).value });
                      }
                    }}
                    className={cn(
                      "w-full px-3 py-2 rounded-xl border text-sm font-black outline-none",
                      isLight ? "bg-white border-slate-300 focus:border-emerald-600 text-emerald-700" : "bg-black/30 border-gray-700 focus:border-emerald-500 text-emerald-400"
                    )}
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* MRP & Purchase Rate */}
              <div className="grid grid-cols-3 gap-3 p-3 rounded-xl border border-dashed border-gray-700/60 bg-black/20">
                <div>
                  <label className="font-bold text-[10px] opacity-70 block mb-1">MRP (₹)</label>
                  <input
                    type="number"
                    step="any"
                    value={quickEditState.mrp}
                    onChange={(e) => {
                      const newMrp = e.target.value;
                      setQuickEditState(prev => {
                        if (!prev) return null;
                        const shouldUpdateSelling = !prev.sellingPrice || prev.sellingPrice === prev.mrp;
                        const nextSelling = shouldUpdateSelling ? newMrp : prev.sellingPrice;
                        const cost = Number(prev.purchaseRate || 0);
                        const spNum = Number(nextSelling || 0);
                        const profit = cost > 0 && spNum > cost ? String(Number((((spNum - cost) / cost) * 100).toFixed(2))) : prev.profitPercent;
                        return {
                          ...prev,
                          mrp: newMrp,
                          sellingPrice: nextSelling,
                          profitPercent: profit
                        };
                      });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = (e.target as HTMLInputElement).value;
                        handleSaveQuickEdit({ mrp: val, sellingPrice: quickEditState.sellingPrice || val });
                      }
                    }}
                    className={cn(
                      "w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold outline-none",
                      isLight ? "bg-white border-slate-300 text-slate-900" : "bg-black/40 border-gray-700 text-white"
                    )}
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="font-bold text-[10px] opacity-70 block mb-1">Purchase Rate (₹)</label>
                  <input
                    type="number"
                    step="any"
                    value={quickEditState.purchaseRate}
                    onChange={(e) => {
                      const pr = e.target.value;
                      setQuickEditState(prev => {
                        if (!prev) return null;
                        const cost = Number(pr || 0);
                        const spNum = Number(prev.sellingPrice || prev.mrp || 0);
                        const profit = cost > 0 && spNum > cost ? String(Number((((spNum - cost) / cost) * 100).toFixed(2))) : '';
                        return {
                          ...prev,
                          purchaseRate: pr,
                          profitPercent: profit
                        };
                      });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveQuickEdit({ purchaseRate: (e.target as HTMLInputElement).value });
                      }
                    }}
                    className={cn(
                      "w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold outline-none",
                      isLight ? "bg-white border-slate-300 text-slate-900" : "bg-black/40 border-gray-700 text-white"
                    )}
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="font-bold text-[10px] opacity-70 block mb-1">Profit %</label>
                  <div className={cn(
                    "w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono font-bold flex items-center justify-center",
                    isLight ? "bg-slate-100 border-slate-300 text-slate-700" : "bg-black/30 border-gray-800 text-purple-300"
                  )}>
                    {quickEditState.profitPercent ? `${quickEditState.profitPercent}%` : '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className={cn(
              "px-5 py-3 border-t flex items-center justify-end gap-2.5",
              isLight ? "bg-slate-50 border-slate-200" : "bg-[#181a24] border-gray-800"
            )}>
              <button
                type="button"
                onClick={() => setQuickEditState(null)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold transition",
                  isLight ? "bg-slate-200 hover:bg-slate-300 text-slate-800" : "bg-gray-800 hover:bg-gray-700 text-gray-200"
                )}
              >
                Cancel
              </button>
              <button
                type="submit"
                data-submit-btn="true"
                disabled={quickEditState.isSaving}
                className="px-5 py-2 rounded-xl text-xs font-black bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1.5 shadow-md transition disabled:opacity-50 cursor-pointer"
              >
                {quickEditState.isSaving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                <span>{quickEditState.isSaving ? 'Updating...' : 'Save Changes (Enter)'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── ⚡ INSTANT ITEM ADD MODAL (KEYBOARD OPTIMIZED) ── */}
      {instantAddState.isOpen && (
        <div data-enter-ignore="true" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <form
            onSubmit={(e) => { e.preventDefault(); handleSaveInstantAdd(); }}
            className={cn(
              "w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]",
              isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#14161f] border-gray-800 text-white"
            )}
          >
            {/* Header */}
            <div className={cn(
              "px-5 py-4 border-b flex items-center justify-between",
              isLight ? "bg-amber-50/70 border-amber-200" : "bg-amber-950/20 border-amber-900/40"
            )}>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Zap size={18} className="fill-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-black uppercase tracking-tight flex items-center gap-1.5">
                    <span>⚡ Instant Product Add</span>
                  </h3>
                  <p className="text-[11px] opacity-60">Saves item & immediately places in cart</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInstantAddState(prev => ({ ...prev, isOpen: false }))}
                className="p-1.5 rounded-lg opacity-60 hover:opacity-100 hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-3.5 overflow-y-auto custom-scrollbar flex-1 text-xs">
              {/* Barcode / QR */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-[11px] opacity-70 flex items-center gap-1">
                    <Barcode size={13} className="text-amber-400" />
                    <span>Barcode / QR</span>
                  </label>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={handleGenerateBarcodeForInstant}
                    disabled={instantAddState.isGeneratingBarcode}
                    className="text-[10px] text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw size={10} className={instantAddState.isGeneratingBarcode ? "animate-spin" : ""} />
                    <span>{instantAddState.isGeneratingBarcode ? 'Generating...' : 'Auto Barcode'}</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={instantAddState.productQR}
                  onChange={(e) => setInstantAddState(prev => ({ ...prev, productQR: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      instantNameInputRef.current?.focus();
                    }
                  }}
                  className={cn(
                    "w-full px-3 py-2 rounded-xl border text-xs font-mono font-bold outline-none",
                    isLight ? "bg-white border-slate-300 focus:border-amber-500 text-slate-900" : "bg-black/30 border-gray-700 focus:border-amber-500 text-white"
                  )}
                  placeholder="Auto-generated barcode or scanned code"
                />
              </div>

              {/* Product Name (Autofocused) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-[11px] text-amber-400">Product Name *</label>
                  <span className="text-[10px] opacity-50 font-mono">Press [Enter] ↵</span>
                </div>
                <input
                  ref={instantNameInputRef}
                  type="text"
                  value={instantAddState.name}
                  onChange={(e) => setInstantAddState(prev => ({ ...prev, name: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const nameVal = (e.target as HTMLInputElement).value;
                      const effectiveSp = instantAddState.sellingPrice || instantAddState.mrp;
                      if (nameVal.trim() && Number(effectiveSp) > 0) {
                        handleSaveInstantAdd({ name: nameVal });
                      } else {
                        instantMrpInputRef.current?.focus();
                        instantMrpInputRef.current?.select();
                      }
                    }
                  }}
                  className={cn(
                    "w-full px-3.5 py-2.5 rounded-xl border text-sm font-bold outline-none ring-2 ring-amber-500/20 transition-all",
                    isLight ? "bg-white border-amber-300 focus:border-amber-500 text-slate-900" : "bg-black/30 border-amber-500/40 focus:border-amber-400 text-white"
                  )}
                  placeholder="e.g. Cashew Premium 250g"
                />
              </div>

              {/* Category & Unit */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-[11px] opacity-70">Category</label>
                    <span className="text-[10px] opacity-50 font-mono">↵</span>
                  </div>
                  <select
                    ref={instantCategorySelectRef}
                    value={instantAddState.categoryId}
                    onChange={(e) => setInstantAddState(prev => ({ ...prev, categoryId: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        instantUnitSelectRef.current?.focus();
                      }
                    }}
                    className={cn(
                      "w-full px-3 py-2 rounded-xl border text-xs font-bold outline-none",
                      isLight ? "bg-white border-slate-300 text-slate-900" : "bg-black/30 border-gray-700 text-white"
                    )}
                  >
                    {categories.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {!c.isKOTEnabled ? '(Non-KOT)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-[11px] opacity-70">Unit</label>
                    <span className="text-[10px] opacity-50 font-mono">↵</span>
                  </div>
                  <select
                    ref={instantUnitSelectRef}
                    value={instantAddState.salesUnit}
                    onChange={(e) => setInstantAddState(prev => ({ ...prev, salesUnit: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        instantMrpInputRef.current?.focus();
                      }
                    }}
                    className={cn(
                      "w-full px-3 py-2 rounded-xl border text-xs font-bold outline-none",
                      isLight ? "bg-white border-slate-300 text-slate-900" : "bg-black/30 border-gray-700 text-white"
                    )}
                  >
                    {POS_SALES_UNITS.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Rates: MRP, Selling Price, Purchase Rate */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-[11px] opacity-70">MRP (₹)</label>
                    <span className="text-[10px] opacity-50 font-mono">↵</span>
                  </div>
                  <input
                    ref={instantMrpInputRef}
                    type="number"
                    step="any"
                    value={instantAddState.mrp}
                    onChange={(e) => {
                      const val = e.target.value;
                      setInstantAddState(prev => {
                        const shouldSetSelling = !prev.sellingPrice || prev.sellingPrice === prev.mrp;
                        const nextSelling = shouldSetSelling ? val : prev.sellingPrice;
                        const cost = Number(prev.purchaseRate || 0);
                        const spNum = Number(nextSelling || 0);
                        const profit = cost > 0 && spNum > cost ? String(Number((((spNum - cost) / cost) * 100).toFixed(2))) : prev.profitPercent;
                        return {
                          ...prev,
                          mrp: val,
                          sellingPrice: nextSelling,
                          profitPercent: profit,
                        };
                      });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = (e.target as HTMLInputElement).value;
                        const effectiveSp = instantAddState.sellingPrice || val;
                        if (instantAddState.name.trim() && Number(val || effectiveSp) > 0) {
                          handleSaveInstantAdd({ mrp: val, sellingPrice: val || effectiveSp });
                        } else if (!instantAddState.name.trim()) {
                          toast.error('Product name is required');
                          instantNameInputRef.current?.focus();
                        } else {
                          instantSellingInputRef.current?.focus();
                          instantSellingInputRef.current?.select();
                        }
                      }
                    }}
                    className={cn(
                      "w-full px-3 py-2 rounded-xl border text-sm font-bold outline-none",
                      isLight ? "bg-white border-slate-300 text-slate-900" : "bg-black/30 border-gray-700 text-white"
                    )}
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-[11px] text-emerald-400">Selling Price (₹) *</label>
                    <span className="text-[10px] opacity-50 font-mono font-bold text-emerald-400">↵ Save</span>
                  </div>
                  <input
                    ref={instantSellingInputRef}
                    type="number"
                    step="any"
                    value={instantAddState.sellingPrice}
                    onChange={(e) => {
                      const sp = e.target.value;
                      const cost = Number(instantAddState.purchaseRate || 0);
                      const spNum = Number(sp);
                      const profit = cost > 0 && spNum > cost ? String(Number((((spNum - cost) / cost) * 100).toFixed(2))) : instantAddState.profitPercent;
                      setInstantAddState(prev => ({ ...prev, sellingPrice: sp, profitPercent: profit }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveInstantAdd({ sellingPrice: (e.target as HTMLInputElement).value });
                      }
                    }}
                    className={cn(
                      "w-full px-3 py-2 rounded-xl border text-sm font-black outline-none ring-2 ring-emerald-500/20",
                      isLight ? "bg-white border-emerald-300 focus:border-emerald-600 text-emerald-700" : "bg-black/30 border-emerald-500/40 focus:border-emerald-400 text-emerald-400"
                    )}
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Purchase Rate (Optional) & Profit % */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="font-bold text-[10px] opacity-60 block mb-1">Purchase Rate (Optional)</label>
                  <input
                    ref={instantPurchaseInputRef}
                    type="number"
                    step="any"
                    value={instantAddState.purchaseRate}
                    onChange={(e) => {
                      const pr = e.target.value;
                      const cost = Number(pr || 0);
                      const spNum = Number(instantAddState.sellingPrice || instantAddState.mrp || 0);
                      const profit = cost > 0 && spNum > cost ? String(Number((((spNum - cost) / cost) * 100).toFixed(2))) : '';
                      setInstantAddState(prev => ({ ...prev, purchaseRate: pr, profitPercent: profit }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveInstantAdd({ purchaseRate: (e.target as HTMLInputElement).value });
                      }
                    }}
                    className={cn(
                      "w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold outline-none",
                      isLight ? "bg-white border-slate-300 text-slate-900" : "bg-black/30 border-gray-700 text-white"
                    )}
                    placeholder="Cost price"
                  />
                </div>

                <div>
                  <label className="font-bold text-[10px] opacity-60 block mb-1">Profit % Margin</label>
                  <div className={cn(
                    "w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono font-bold flex items-center justify-center",
                    isLight ? "bg-slate-100 border-slate-300 text-slate-700" : "bg-black/30 border-gray-800 text-emerald-400"
                  )}>
                    {instantAddState.profitPercent ? `+${instantAddState.profitPercent}%` : '—'}
                  </div>
                </div>
              </div>

              {/* Quick Enter Flow Helper Tip */}
              <div className={cn(
                "p-2 rounded-xl text-[10px] border flex items-center gap-2",
                isLight ? "bg-amber-50/50 border-amber-200 text-amber-900" : "bg-amber-950/20 border-amber-900/30 text-amber-300"
              )}>
                <span className="text-xs">⚡</span>
                <span>Type <strong>Name</strong> ↵, <strong>Price</strong> ↵ to immediately save & bill!</span>
              </div>
            </div>

            {/* Footer */}
            <div className={cn(
              "px-5 py-3 border-t flex items-center justify-end gap-2.5",
              isLight ? "bg-slate-50 border-slate-200" : "bg-[#181a24] border-gray-800"
            )}>
              <button
                type="button"
                onClick={() => setInstantAddState(prev => ({ ...prev, isOpen: false }))}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold transition",
                  isLight ? "bg-slate-200 hover:bg-slate-300 text-slate-800" : "bg-gray-800 hover:bg-gray-700 text-gray-200"
                )}
              >
                Cancel
              </button>
              <button
                type="submit"
                data-submit-btn="true"
                disabled={instantAddState.isSaving}
                className="px-5 py-2.5 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 text-black flex items-center gap-1.5 shadow-lg transition disabled:opacity-50 cursor-pointer"
              >
                {instantAddState.isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} className="fill-black" />}
                <span>{instantAddState.isSaving ? 'Adding Item...' : 'Save & Add to Cart (Enter)'}</span>
              </button>
            </div>
          </form>
        </div>
      )}


    </div>
  );
}