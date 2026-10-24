import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMainposStore } from '@/stores/mainposStore';
import { useAuthStore } from '@/stores/authStore';
import { useSocket } from '@/hooks/useSocket';
import { useClickSound } from '@/hooks/useClickSound';
import axios from 'axios';
import restaurantApi from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Search, CreditCard, Banknote, Smartphone, LogOut,
  Trash2, Edit, CheckCircle, ChevronLeft, ChevronRight,
  History as HistoryIcon, Tag, RefreshCw, Wallet, Printer, Split,
  AlignLeft, LayoutGrid, RotateCcw, ChevronDown, ShoppingCart, RotateCw,
  Sun, Moon, User, Plus, X, Landmark
} from 'lucide-react';
import { Bell } from 'lucide-react';
import { useThemeStore } from '@/stores/themeStore';
import KotPopup from '@/components/KotPopup';
import { ReturnItemsModal } from '@/components/ReturnItemsModal';
import { CashRegisterModal } from '@/components/layout/CashRegisterModal';
import { cn, formatCurrency, resolveImageUrl } from '@/lib/utils';
import { formatQtyDisplay, getQtyPresets, hasSmallUnitConversion, parseQtyInput } from '@/lib/posUnits';
import { useDebounce } from '@/hooks/useDebounce';
import { useRealtimeOrders } from '@/hooks/useRealtimeOrders';
import { printHtmlOrFallback, openCashDrawer } from '@/lib/electronPrint';
import { useWeightedBarcodeScanner } from '@/hooks/useWeightedBarcodeScanner';
import { isKgMeasuredItem, parseWeightFromBarcode } from '@/lib/weightedBarcodeParser';
import { API_BASE_URL, SERVER_BASE_URL } from '@/lib/config';
import { useTouchLongPress } from '@/hooks/useTouchLongPress';
import { ItemOptionsModal } from '@/components/modals/ItemOptionsModal';

const SERVER_URL = SERVER_BASE_URL;

const posApi = (token: string | null) => axios.create({
  baseURL: `${API_BASE_URL}/mainpos`,
  headers: token ? { Authorization: `Bearer ${token}` } : {},
});

interface InventoryMRP {
  id: number;
  mrp: number;
  purchaseRate: number;
  profitPercent: number;
  sellingPrice: number; // computed by backend: purchaseRate * (1 + profitPercent/100)
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
  isVeg: boolean | null;
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
    sku?: string | null;
    barcode?: string | null;
    inventoryMRPs?: InventoryMRP[];
  };
}

interface Category { id: number; name: string; }

interface TokenItem {
  id: number; menuItemId: number; menuItemName: string; price: number; linePrice?: number; quantity: number; total: number;
  addedBy: string; isRemoved: boolean; removedBy?: string; removeReason?: string;
  inventoryItemMRPId?: number | null;
  menuItem?: {
    name?: string;
    image: string | null;
    salesUnit?: string | null;
    taxType?: string | null;
    taxPercent?: number | null;
    category?: { id: number; name: string; isKOTEnabled: boolean } | null;
  };
}

interface BillSettings {
  showGST?: boolean;
  showUnitForKOT?: boolean;
  showUnitForNonKOT?: boolean;
  loyaltyDiscountFormat?: string;
  billHeaderText?: string | null;
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

interface TokenData {
  id: number; tokenNumber: number; qrCode: string; status: string;
  customerName?: string; customerPhone?: string;
  subtotal: number; sgst: number; cgst: number; igst: number; tax?: number; total: number;
  discountApplied: number; loyaltyPointsEarned: number; loyaltyPointsClaimed: number;
  items: TokenItem[]; payments: { id: number; method: string; amount: number; paidAt: string }[];
  edits: { id: number; action: string; menuItemName: string; oldValue?: string; newValue?: string; reason: string; staffUsername: string; createdAt: string }[];
  customer?: { id: number; name: string; phone?: string; loyaltyPoints: number };
}

interface TodayCollectionSummary {
  ordersCount: number;
  collectionAmount: number;
}

interface ExpenseCategoryOption {
  id: number;
  name: string;
}

interface SessionExpenseEntry {
  id: string;
  title: string;
  amount: number;
  categoryName?: string;
  createdAt: string;
}

interface LocalCartItem {
  id: string;
  menuItemId: number;
  name: string;
  displayName?: string;
  price: number; // always sellingPrice
  quantity: number;
  salesUnit?: string | null;
  inventoryItemMRPId?: number;
  purchaseRate?: number;
  profitPercent?: number;
  inventoryItemName?: string;
  inventoryMRPs?: InventoryMRP[];
  modifiers?: { name: string; price: number }[];
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Returns the selling price for an MRP entry.
 *  Backend computes: sellingPrice = purchaseRate × (1 + profitPercent/100)
 *  We never use raw mrp as the cart price. */
function getMRPSellingPrice(m: InventoryMRP): number {
  if (m.sellingPrice !== undefined && m.sellingPrice !== null) return Number(m.sellingPrice);
  // fallback: compute locally if backend didn't supply it
  return Number(m.purchaseRate) * (1 + Number(m.profitPercent ?? 0) / 100);
}

function getActiveMRPs(mrps: InventoryMRP[]): InventoryMRP[] {
  return (mrps ?? []).filter(m => m.isActive !== false);
}

function normalizePhone(value?: string | null): string {
  return String(value ?? '').replace(/\D/g, '').trim();
}

function phonesLikelySame(a?: string | null, b?: string | null): boolean {
  const pa = normalizePhone(a);
  const pb = normalizePhone(b);
  if (!pa || !pb) return false;
  return pa === pb || pa.endsWith(pb) || pb.endsWith(pa);
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

// ── Print final bill ──────────────────────────────────────────────────────────
function printFinalBill(token: TokenData, bakeryName = 'SMARTGONEXT Bakery', settings?: BillSettings) {
  const invokePrint = async () => {
    const userRest = useAuthStore.getState().user?.restaurant as any;
    const finalRestaurantName = (settings as any)?.restaurantName || userRest?.name || (bakeryName !== 'SMARTGONEXT Bakery' ? bakeryName : '') || 'SMARTGONEXT Bakery';
    const cfg = {
      showGST: settings?.showGST ?? false,
      showUnitForKOT: settings?.showUnitForKOT ?? false,
      showUnitForNonKOT: settings?.showUnitForNonKOT ?? true,
      loyaltyDiscountFormat: settings?.loyaltyDiscountFormat ?? 'small_line',
      billHeaderText: settings?.billHeaderText ?? '',
      thankYouMessage: settings?.thankYouMessage ?? 'Thank you! Visit again.',
      showTokenNumber: settings?.showTokenNumber ?? true,
      showRestaurantInfo: settings?.showRestaurantInfo ?? true,
      showPhoneNumber: settings?.showPhoneNumber ?? true,
      showLogo: (settings as any)?.showLogo ?? true,
      logoUrl: resolveImageUrl((settings as any)?.logoUrl || userRest?.logo || ''),
      restaurantAddress: (settings as any)?.restaurantAddress || userRest?.address || '',
      restaurantPhone: (settings as any)?.restaurantPhone || userRest?.phone || '',
      itemTaxDisplay: (settings as any)?.itemTaxDisplay ?? 'none',
    };

    // ── Live data from DB (token comes from /payment API response) ──
    const activeItems = token.items.filter(i => !i.isRemoved);
    const isKotItem = (i: TokenItem) =>
      Boolean(i.menuItem?.category?.isKOTEnabled) || (!i.inventoryItemMRPId && !i.menuItem?.salesUnit);
    const kotItems = activeItems.filter(isKotItem);
    const nonKotItems = activeItems.filter(i => !isKotItem(i));
    const totalTax = Number(token.sgst || 0) + Number(token.cgst || 0) + Number(token.igst || 0);
    const totalPaid = token.payments.reduce((s, p) => s + Number(p.amount), 0);
    const changeAmount = Math.max(0, totalPaid - Number(token.total));

    // Payment method breakdown (from DB payments array)
    const paymentRows = token.payments.map(p =>
      `<tr>
        <td style="text-transform:uppercase">${p.method}</td>
        <td style="text-align:right">₹${Number(p.amount).toFixed(2)}</td>
      </tr>`
    ).join('') + (changeAmount > 0 ? `<tr>
        <td style="font-weight:700">CHANGE RETURN</td>
        <td style="text-align:right;font-weight:700">₹${changeAmount.toFixed(2)}</td>
      </tr>` : '');

    const kotRows = kotItems.map(i =>
      `<tr>
        <td>${i.menuItemName}</td>
        <td style="text-align:center">${formatQtyDisplay(Number(i.quantity || 0), cfg.showUnitForKOT ? i.menuItem?.salesUnit : null)}</td>
        <td style="text-align:right">₹${Number(i.price || 0).toFixed(2)}</td>
        <td style="text-align:right">₹${Number(i.total).toFixed(2)}</td>
      </tr>`
    ).join('');

    const nonKotRows = nonKotItems.map(i =>
      `<tr>
        <td>${i.menuItemName}</td>
        <td style="text-align:center">${cfg.showUnitForNonKOT ? (i.menuItem?.salesUnit || '-') : '-'}</td>
        <td style="text-align:right">₹${Number(i.price || 0).toFixed(2)}</td>
        <td style="text-align:right">₹${Number(i.price || 0).toFixed(2)}</td>
        <td style="text-align:center">${formatQtyDisplay(Number(i.quantity || 0), cfg.showUnitForNonKOT ? i.menuItem?.salesUnit : null)}</td>
        <td style="text-align:right">₹${Number(i.total).toFixed(2)}</td>
      </tr>`
    ).join('');

    const html = `
      <!DOCTYPE html><html><head><title>Receipt ${token.tokenNumber}</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: 'Courier New', monospace; background:#fff; color:#000; padding:12px; width:80mm; }
        .center { text-align:center; }
        table { width:100%; border-collapse:collapse; margin:6px 0; font-size:9pt; }
        td { padding:2px 0; }
        .divider { border-top:1px dashed #000; margin:6px 0; }
        .total { font-weight:700; font-size:13pt; }
        .paid-stamp { font-size:11pt; font-weight:900; color:#000; border:2px solid #000; padding:2px 8px; display:inline-block; margin-top:4px; letter-spacing:2px; }
        @media print { body { width:80mm; } }
      </style></head><body>
      <div class="center">
        ${cfg.showLogo && cfg.logoUrl ? `<img src="${cfg.logoUrl}" style="max-height:45px;max-width:120px;margin:0 auto 4px auto;display:block;" alt="Logo" />` : ''}
        ${cfg.showRestaurantInfo ? `<div style="font-size:14pt;font-weight:700;">${finalRestaurantName}</div>` : ''}
        ${cfg.showRestaurantInfo && cfg.restaurantAddress ? `<div style="font-size:8pt;color:#333;margin-top:2px;">${cfg.restaurantAddress}</div>` : ''}
        ${cfg.showPhoneNumber && cfg.restaurantPhone ? `<div style="font-size:8pt;color:#333;margin-top:1px;">Ph: ${cfg.restaurantPhone}</div>` : ''}
        <div style="font-size:8pt;color:#555;margin-top:3px;">${new Date().toLocaleString('en-IN')}</div>
        <table style="width:100%;margin-top:6px;font-size:10pt;font-weight:700;">
          <tr>
            <td style="text-align:left;">Order BILL</td>
            ${cfg.showTokenNumber ? `<td style="text-align:right;">Token #${token.tokenNumber}</td>` : ''}
          </tr>
        </table>
        ${cfg.billHeaderText ? `<div style="font-size:8pt;margin-top:3px;">${cfg.billHeaderText}</div>` : ''}
      </div>
      <div class="divider"></div>
      ${token.customerName
        ? `<div style="font-size:9pt;">Bill To: ${token.customerName}${cfg.showPhoneNumber && token.customerPhone ? ' (' + token.customerPhone + ')' : ''}</div><div class="divider"></div>`
        : ''}
      ${kotItems.length > 0 ? `
        <div style="font-size:9pt;font-weight:700;">FOOD / KOT ITEMS</div>
        <table>
          <tr style="border-bottom:1px solid #000;font-weight:600;">
            <td>Item</td><td style="text-align:center">Qty</td><td style="text-align:right">Rate</td><td style="text-align:right">Amt</td>
          </tr>
          ${kotRows}
        </table>` : ''}
      ${nonKotItems.length > 0 ? `
        <div style="font-size:9pt;font-weight:700;margin-top:4px;">NON-KOT / RETAIL</div>
        <table>
          <tr style="border-bottom:1px solid #000;font-weight:600;">
            <td>Item</td><td style="text-align:center">Unit</td><td style="text-align:right">MRP</td><td style="text-align:right">Rate</td><td style="text-align:center">Qty</td><td style="text-align:right">Amt</td>
          </tr>
          ${nonKotRows}
        </table>` : ''}
      <div class="divider"></div>
      <table style="font-size:9pt;">
        <tr><td>Subtotal</td><td style="text-align:right">₹${Number(token.subtotal).toFixed(2)}</td></tr>
        ${cfg.showGST && totalTax > 0 ? `
          ${Number(token.sgst) > 0 ? `<tr><td>SGST</td><td style="text-align:right">₹${Number(token.sgst).toFixed(2)}</td></tr>` : ''}
          ${Number(token.cgst) > 0 ? `<tr><td>CGST</td><td style="text-align:right">₹${Number(token.cgst).toFixed(2)}</td></tr>` : ''}
          ${Number(token.igst) > 0 ? `<tr><td>IGST</td><td style="text-align:right">₹${Number(token.igst).toFixed(2)}</td></tr>` : ''}
        ` : totalTax > 0 ? `<tr><td>Tax</td><td style="text-align:right">₹${totalTax.toFixed(2)}</td></tr>` : ''}
        ${Number(token.discountApplied) > 0 && cfg.loyaltyDiscountFormat !== 'hidden'
          ? `<tr><td>Loyalty Discount</td><td style="text-align:right;color:green;">-₹${Number(token.discountApplied).toFixed(2)}</td></tr>`
          : ''}
      </table>
      <div class="divider"></div>
      <div class="total center">TOTAL: ₹${Number(token.total).toFixed(2)}</div>
      <div class="divider"></div>
      <div style="font-size:9pt;font-weight:700;">PAYMENT</div>
      <table style="font-size:9pt;">${paymentRows}</table>
      <div class="divider"></div>
      <div class="center">
        <div class="paid-stamp">✓ PAID</div>
        <div style="font-size:8pt;color:#555;margin-top:6px;">${cfg.thankYouMessage}</div>
        ${token.loyaltyPointsEarned > 0
          ? `<div style="font-size:8pt;font-weight:700;margin-top:4px;">🏆 You earned ${token.loyaltyPointsEarned} loyalty points!</div>`
          : ''}
        ${token.loyaltyPointsClaimed > 0
          ? `<div style="font-size:8pt;color:green;">Redeemed: ${token.loyaltyPointsClaimed} pts</div>`
          : ''}
      </div>
      </body></html>
    `;

    await printHtmlOrFallback(html);
  };

  invokePrint().catch((err) => {
    toast.error(err?.message || 'Print failed');
  });
}

function printTokenSlip(token: TokenData, bakeryName = 'SMARTGONEXT Bakery', settings?: BillSettings) {
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
    const html = `
      <!doctype html><html><head><meta charset="utf-8"><title>Token ${token.tokenNumber}</title>
      <style>body{font-family:Arial,Helvetica,sans-serif;padding:12px;text-align:center;color:#000} img.logo{max-height:45px;max-width:120px;margin:0 auto 4px auto;display:block;} img.qr{width:180px;height:180px;object-fit:contain}</style>
      </head><body>
        ${cfg.showLogo && cfg.logoUrl ? `<img class="logo" src="${cfg.logoUrl}" alt="Logo" />` : ''}
        ${cfg.showRestaurantInfo ? `<div style="font-size:12pt;font-weight:700;">${finalRestaurantName}</div>` : ''}
        ${cfg.showRestaurantInfo && cfg.restaurantAddress ? `<div style="font-size:8pt;color:#333;">${cfg.restaurantAddress}</div>` : ''}
        ${cfg.showPhoneNumber && cfg.restaurantPhone ? `<div style="font-size:8pt;color:#333;">Ph: ${cfg.restaurantPhone}</div>` : ''}
        ${cfg.showTokenNumber ? `<div style="font-size:14pt;font-weight:700;margin-top:4px;">Token #${token.tokenNumber}</div>` : ''}
        ${token.customerName ? `<div style="font-size:10pt;margin-top:4px;">${token.customerName}${cfg.showPhoneNumber && token.customerPhone ? ` · ${token.customerPhone}` : ''}</div>` : ''}
        <div style="margin:10px 0"><img class="qr" src="${qrUrl}" alt="QR"/></div>
        <div style="font-size:10pt;color:#555">Scan to retrieve order</div>
      </body></html>
    `;
    await printHtmlOrFallback(html);
  };

  invokePrint().catch((err) => {
    console.error('Print token failed', err);
    toast.error(err?.message || 'Print failed');
  });
}

// ── Password modal ────────────────────────────────────────────────────────────
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
        <input type="password" autoFocus value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Admin Password"
          className="w-full px-4 py-2.5 bg-[#0f1014] border border-gray-800 rounded-xl text-white placeholder-gray-500 mb-3 focus:outline-none focus:border-purple-500 transition-colors" />
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" rows={2}
          className="w-full px-4 py-2.5 bg-[#0f1014] border border-gray-800 rounded-xl text-white placeholder-gray-500 mb-4 resize-none focus:outline-none focus:border-purple-500 text-sm transition-colors" />
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 border border-gray-700 text-gray-400 rounded-xl hover:bg-gray-800 transition">Cancel</button>
          <button onClick={() => { if (!pwd || !reason) { toast.error('Password and reason required'); return; } onConfirm(pwd, reason); }}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition">Confirm</button>
        </div>
      </div>
    </div>
  );
}

// ── Loyalty modal ─────────────────────────────────────────────────────────────
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
          <input type="number" min={0} max={available} value={points}
            onChange={(e) => setPoints(Math.min(available, Math.max(0, +e.target.value)))}
            className="w-full px-4 py-2.5 bg-[#0f1014] border border-gray-800 rounded-xl text-white focus:outline-none focus:border-purple-500 transition-colors" />
        </div>
        <div className="bg-green-900/30 border border-green-700/50 rounded-xl p-3 mb-4 text-center">
          <span className="text-green-400 text-lg font-bold">₹{discount} discount</span>
          <span className="text-gray-400 text-sm block">will be applied to this bill</span>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 border border-gray-700 text-gray-400 rounded-xl hover:bg-gray-800 transition">Cancel</button>
          <button onClick={() => onApply(points)} disabled={points <= 0}
            className="flex-1 py-2.5 bg-green-600/80 hover:bg-green-600 text-white font-bold rounded-xl transition disabled:opacity-50">Apply</button>
        </div>
      </div>
    </div>
  );
}

// ── MRP Dropdown component ────────────────────────────────────────────────────
function MRPDropdown({ mrps, selectedMRPId, onSelect }: {
  mrps: InventoryMRP[];
  selectedMRPId?: number;
  onSelect: (mrp: InventoryMRP) => void;
}) {
  if (mrps.length === 0) return null;
  if (mrps.length === 1) {
    const m = mrps[0];
    const sp = getMRPSellingPrice(m);
    return (
      <div className="text-[11px] text-gray-400 mt-1 space-y-0.5">
        <div className="font-bold text-white">{formatCurrency(sp)}</div>
        <div>Cost: ₹{Number(m.purchaseRate).toFixed(2)} · Profit: {Number(m.profitPercent ?? 0).toFixed(1)}%</div>
        {m.createdAt && <div className="text-gray-600">Added: {new Date(m.createdAt).toLocaleDateString()}</div>}
      </div>
    );
  }
  return (
    <div className="mt-1 space-y-1">
      <select
        value={selectedMRPId ?? ''}
        onChange={(e) => {
          const selected = mrps.find(m => m.id === Number(e.target.value));
          if (selected) onSelect(selected);
        }}
        className="w-full bg-[#0f1014] border border-gray-700 text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-purple-500"
      >
        {mrps.map(m => {
          const mrpValue = Number(m.mrp ?? getMRPSellingPrice(m));
          return (
            <option key={m.id} value={m.id}>
              MRP: ₹{mrpValue.toFixed(2)}
            </option>
          );
        })}
      </select>
      {(() => {
        const sel = mrps.find(m => m.id === selectedMRPId) ?? mrps[0];
        const sp = getMRPSellingPrice(sel);
        return (
          <div className="text-[10px] text-gray-500 px-1">
            Selling: <span className="text-green-400 font-bold">₹{sp.toFixed(2)}</span>
            {' · '}Cost: ₹{Number(sel.purchaseRate).toFixed(2)}
            {' · '}Profit: {Number(sel.profitPercent ?? 0).toFixed(1)}%
            {sel.createdAt ? ` · ${new Date(sel.createdAt).toLocaleDateString()}` : ''}
          </div>
        );
      })()}
    </div>
  );
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

export default function MainPOSTerminal() {
  useEnterKeyNavigation();
  const { isAuthenticated, terminal, token: authToken, logout } = useMainposStore();
  const { theme, toggleTheme } = useThemeStore();
  const isLight = theme === 'light';
  const kotPopupEnabled = useMainposStore(s => s.kotPopupEnabled ?? true);
  const setKotPopupEnabled = useMainposStore(s => s.setKotPopupEnabled ?? (() => {}));
  const { socket } = useSocket();
  const qc = useQueryClient();

  // Cash Register session state
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const { data: registerSession } = useQuery({
    queryKey: ['cash-register-session'],
    queryFn: () => restaurantApi.get('/restaurant/cash-register/session').then(r => r.data?.data),
    refetchInterval: 30000,
  });
  const isRegisterOpen = Boolean(registerSession && registerSession.status === 'open');

  // Listen for realtime orders, waiter requests, KOT updates
  useRealtimeOrders();

  useEffect(() => {
    if (!socket) return;
    const invalidate = () => qc.invalidateQueries({ queryKey: ['mainpos-items'] } as any);
    const invalidateAll = () => {
      qc.invalidateQueries({ queryKey: ['mainpos-items'] } as any);
      qc.invalidateQueries({ queryKey: ['mainpos-categories'] } as any);
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

  // Keep a local list of held KOTs for this terminal (so MAINPOS KOT button can show them)
  useEffect(() => {
    if (!socket) return;
    const onNewKot = (data: any) => {
      const kot = data?.kot ?? (Array.isArray(data?.kots) ? data.kots[0] : null);
      if (!kot) return;
      const createdByTerminalId = data?.createdByTerminalId ?? null;
      const belongsToThisTerminal = terminal?.id && createdByTerminalId && terminal.id === createdByTerminalId;
      const isCustomerOrUnassignedKot = createdByTerminalId == null;
      if ((belongsToThisTerminal || isCustomerOrUnassignedKot) && kot.status === 'pending') {
        setHeldKots((prev) => prev.find((p) => p.id === kot.id) ? prev : [kot, ...prev]);
      }
    };

    const onKotUpdated = (data: any) => {
      const kot = data?.kot ?? null;
      const kotId = kot?.id ?? data?.kotId ?? data?.id;
      if (!kotId) return;
      setHeldKots((prev) => prev.map((k) => (k.id === kotId ? { ...k, ...(kot || data) } : k)).filter((k) => k.status === 'pending'));
    };

    socket.on('new_kot', onNewKot);
    socket.on('kot_updated', onKotUpdated);
    return () => {
      socket.off('new_kot', onNewKot);
      socket.off('kot_updated', onKotUpdated);
    };
  }, [socket, terminal]);

  // Listen for in-app show_kot_detail events (dispatched by KotPopup View)
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

  const { user } = useAuthStore();

  const parsedToken = useMemo(() => {
    if (!authToken) return null;
    try {
      const parts = authToken.split('.');
      if (parts.length < 2) return null;
      let b = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const pad = b.length % 4;
      if (pad) b += '='.repeat(4 - pad);
      return JSON.parse(atob(b));
    } catch {
      return null;
    }
  }, [authToken]);

  const activeRestaurantId = user?.restaurant?.id ?? terminal?.restaurantId ?? parsedToken?.restaurantId ?? null;

  const [lookupInput, setLookupInput] = useState('');
  const [currentToken, setCurrentToken] = useState<TokenData | null>(null);
  const [localCart, setLocalCart] = useState<LocalCartItem[]>([]);
  const [packPickerItem, setPackPickerItem] = useState<MenuItem | null>(null);
  const [qtyEditor, setQtyEditor] = useState<{ id: string; value: string } | null>(null);
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
  const displayWindowRef = useRef<Window | null>(null);
  const isPresentingRef = useRef(sessionStorage.getItem('pos_is_presenting') === 'true');
  const presentDebounceTimer = useRef<number | null>(null);

  const updateLocalCartItem = useCallback((id: string, updates: Partial<LocalCartItem>) => {
    setLocalCart(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  }, []);

  const findInventoryMRPsByName = useCallback(async (inventoryName: string): Promise<InventoryMRP[] | undefined> => {
    if (!inventoryName.trim()) return undefined;
    try {
      const response = await restaurantApi.get('/restaurant/inventory/items');
      const items = response.data?.data as Array<{ name?: string; inventoryMRPs?: InventoryMRP[] }>;
      const match = (items || []).find(it => String(it.name || '').trim().toLowerCase() === inventoryName.trim().toLowerCase());
      return match?.inventoryMRPs?.filter(m => m.isActive !== false) ?? undefined;
    } catch (err) {
      return undefined;
    }
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

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const debouncedCustomerPhone = useDebounce(customerPhone, 500);

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Weight-based barcode scanner for Kg-measured items
  useWeightedBarcodeScanner((scanResult) => {
    setSearch(scanResult.rawBarcode);
  });

  const [deleteModal, setDeleteModal] = useState<{ itemId: number; name: string } | null>(null);
  const [editModal, setEditModal] = useState<{ itemId: number; name: string; qty: number } | null>(null);
  const [loyaltyModal, setLoyaltyModal] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paidSuccess, setPaidSuccess] = useState(false);
  const [awaitingUPIPayment, setAwaitingUPIPayment] = useState(false);
  const [pendingUpiPayment, setPendingUpiPayment] = useState<{ tokenQr: string; amount: number; method: string } | null>(null);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [heldKots, setHeldKots] = useState<any[]>([]);
  const [kotsModalOpen, setKotsModalOpen] = useState(false);
  const [selectedKot, setSelectedKot] = useState<any | null>(null);
  const [kotDateFilter, setKotDateFilter] = useState<'today' | 'yesterday'>('today');
  const [waiterBillsModalOpen, setWaiterBillsModalOpen] = useState(false);
  const [selectedWaiterBill, setSelectedWaiterBill] = useState<any | null>(null);
  const [loadedWaiterBill, setLoadedWaiterBill] = useState<any | null>(null);

  const { data: pendingWaiterBills = [], refetch: refetchPendingWaiterBills } = useQuery<any[]>({
    queryKey: ['pending-waiter-bills', authToken],
    queryFn: async () => {
      const { data } = await api.get('/restaurant/tables/pending-bills');
      return Array.isArray(data.data) ? data.data : [];
    },
    enabled: !!authToken,
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (!socket) return;
    const onWaiterBillRequested = (data: any) => {
      playTokenSound();
      toast.success(`🧾 Bill requested for ${data.tableName || 'Table'} (${data.staffName || 'Waiter'}) - ₹${data.total}`, { duration: 6000, icon: '🔔' });
      refetchPendingWaiterBills();
    };
    const onRefetch = () => refetchPendingWaiterBills();

    socket.on('waiter_bill_requested', onWaiterBillRequested);
    socket.on('table_updated', onRefetch);
    socket.on('table_closed', onRefetch);
    socket.on('token_paid', onRefetch);
    socket.on('waiter_bill_cleared', onRefetch);
    socket.on('new_order', onRefetch);
    socket.on('order_updated', onRefetch);
    return () => {
      socket.off('waiter_bill_requested', onWaiterBillRequested);
      socket.off('table_updated', onRefetch);
      socket.off('table_closed', onRefetch);
      socket.off('token_paid', onRefetch);
      socket.off('waiter_bill_cleared', onRefetch);
      socket.off('new_order', onRefetch);
      socket.off('order_updated', onRefetch);
    };
  }, [socket, refetchPendingWaiterBills]);

  const [ordersModalOpen, setOrdersModalOpen] = useState(false);
  const [ordFilterTab, setOrdFilterTab] = useState<'all' | 'active' | 'closed'>('all');
  const [selectedTodayOrder, setSelectedTodayOrder] = useState<any | null>(null);
  const [totalAModalOpen, setTotalAModalOpen] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategoryId, setExpenseCategoryId] = useState<number | null>(null);
  const [sessionExpenses, setSessionExpenses] = useState<SessionExpenseEntry[]>([]);
  const [browsingOrderIndex, setBrowsingOrderIndex] = useState<number | null>(null);
  const [priceEditor, setPriceEditor] = useState<{ id: string; value: string } | null>(null);
  const [customTotalOverride, setCustomTotalOverride] = useState<number | null>(null);
  const [isEditingTotal, setIsEditingTotal] = useState<boolean>(false);
  const [totalInputVal, setTotalInputVal] = useState<string>('');

  // ── Chrome-Style Multi-Tab Bill State ──
  const [tabs, setTabs] = useState<Array<{
    id: string;
    customerName: string;
    customerPhone: string;
    localCart: LocalCartItem[];
    customTotalOverride: number | null;
    currentToken: TokenData | null;
    browsingOrderIndex: number | null;
    loadedWaiterBill?: any | null;
  }>>([
    {
      id: 'tab-1',
      customerName: '',
      customerPhone: '',
      localCart: [],
      customTotalOverride: null,
      currentToken: null,
      browsingOrderIndex: null,
      loadedWaiterBill: null,
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
      currentToken,
      browsingOrderIndex,
      loadedWaiterBill,
    } : t));
  }, [activeTabId, customerName, customerPhone, localCart, customTotalOverride, currentToken, browsingOrderIndex, loadedWaiterBill]);

  const handleSwitchTab = (targetTabId: string) => {
    if (targetTabId === activeTabId) return;
    const target = tabs.find(t => t.id === targetTabId);
    if (!target) return;

    setActiveTabId(targetTabId);
    setCustomerName(target.customerName || '');
    setCustomerPhone(target.customerPhone || '');
    setLocalCart(target.localCart || []);
    setCustomTotalOverride(target.customTotalOverride ?? null);
    setCurrentToken(target.currentToken ?? null);
    setBrowsingOrderIndex(target.browsingOrderIndex ?? null);
    setLoadedWaiterBill(target.loadedWaiterBill ?? null);
  };

  const handleAddNewTab = () => {
    const newId = `tab-${Date.now()}`;
    const newTab = {
      id: newId,
      customerName: '',
      customerPhone: '',
      localCart: [],
      customTotalOverride: null,
      currentToken: null,
      browsingOrderIndex: null,
      loadedWaiterBill: null,
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newId);
    setCustomerName('');
    setCustomerPhone('');
    setLocalCart([]);
    setCustomTotalOverride(null);
    setCurrentToken(null);
    setBrowsingOrderIndex(null);
    setLoadedWaiterBill(null);
    toast.success('Opened new bill tab');
  };

  const handleCloseTab = (tabIdToClose: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) {
      setCustomerName('');
      setCustomerPhone('');
      setLocalCart([]);
      setCustomTotalOverride(null);
      setCurrentToken(null);
      setBrowsingOrderIndex(null);
      setLoadedWaiterBill(null);
      setTabs([{
        id: 'tab-1',
        customerName: '',
        customerPhone: '',
        localCart: [],
        customTotalOverride: null,
        currentToken: null,
        browsingOrderIndex: null,
        loadedWaiterBill: null,
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
      setCurrentToken(fallbackTab.currentToken ?? null);
      setBrowsingOrderIndex(fallbackTab.browsingOrderIndex ?? null);
    }
  };

  const handlePrevBill = () => {
    if (!todayOrders || todayOrders.length === 0) {
      toast.error('No previous bills found for today');
      return;
    }
    if (browsingOrderIndex === null) {
      setBrowsingOrderIndex(0);
    } else if (browsingOrderIndex < todayOrders.length - 1) {
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
  const { data: terminalKots = [], refetch: refetchTerminalKots, error: kotsError, isLoading: kotsLoading } = useQuery({
    queryKey: ['terminal-kots', terminal?.id, authToken, kotDateFilter],
    queryFn: async () => {
      if (!terminal?.id || !authToken) return [];
      try {
        const apiClient = posApi(authToken);
        const { data } = await apiClient.get(`/kots?status=pending&limit=50&includeUnassigned=true&dateFilter=${kotDateFilter}`);
        return Array.isArray(data.data) ? data.data : [];
      } catch (err: any) {
        console.error('Failed to load KOT history:', err);
        toast.error('Failed to load KOT history');
        return [];
      }
    },
    enabled: !!terminal?.id && !!authToken,
    staleTime: 1000 * 30, // 30 seconds
    gcTime: 1000 * 60 * 5, // 5 minutes
  });

  // Refetch KOTs when modal opens
  useEffect(() => {
    if (kotsModalOpen && terminal?.id) {
      refetchTerminalKots();
    }
  }, [kotsModalOpen, terminal?.id, refetchTerminalKots, kotDateFilter]);

  const api = posApi(authToken);

  const {
    data: todayCollection,
    refetch: refetchTodayCollection,
  } = useQuery<TodayCollectionSummary>({
    queryKey: ['mainpos-today-collection', terminal?.id, authToken],
    queryFn: async () => {
      const { data } = await api.get('/today-collection');
      return data.data;
    },
    enabled: !!authToken && !!terminal?.id,
    staleTime: 1000 * 30,
  });

  const {
    data: todayOrders = [],
    refetch: refetchTodayOrders,
    isLoading: todayOrdersLoading,
  } = useQuery<any[]>({
    queryKey: ['mainpos-today-orders', terminal?.id, authToken],
    queryFn: async () => {
      const { data } = await api.get('/today-orders');
      return Array.isArray(data.data) ? data.data : [];
    },
    enabled: !!authToken && !!terminal?.id,
    staleTime: 1000 * 15,
    refetchInterval: 10000,
  });

  const {
    data: expenseCategories = [],
    refetch: refetchExpenseCategories,
  } = useQuery<ExpenseCategoryOption[]>({
    queryKey: ['mainpos-expense-categories', authToken],
    queryFn: async () => {
      const { data } = await api.get('/expense-categories');
      return Array.isArray(data.data) ? data.data : [];
    },
    enabled: !!authToken && totalAModalOpen,
    staleTime: 1000 * 60,
  });

  const addExpenseMut = useMutation({
    mutationFn: async () => {
      const title = expenseTitle.trim();
      const amount = Number(expenseAmount);
      if (!title) throw new Error('Expense name is required');
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid expense amount');
      if (!expenseCategoryId) throw new Error('Please select expense category');

      const { data } = await api.post('/expenses', {
        title,
        amount,
        categoryId: expenseCategoryId,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
      });
      return data.data;
    },
    onSuccess: (created: any) => {
      const categoryName = expenseCategories.find((c) => c.id === Number(created?.categoryId))?.name;
      setSessionExpenses((prev) => [
        {
          id: `exp-${Date.now()}`,
          title: String(created?.title || expenseTitle),
          amount: Number(created?.amount || expenseAmount || 0),
          categoryName,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      setExpenseTitle('');
      setExpenseAmount('');
      toast.success('Expense added');
    },
    onError: (err: any) => {
      toast.error(err?.message || err?.response?.data?.error || 'Failed to add expense');
    },
  });

  useEffect(() => {
    if (ordersModalOpen) {
      refetchTodayOrders();
      refetchTodayCollection();
    }
  }, [ordersModalOpen, refetchTodayOrders, refetchTodayCollection]);

  useEffect(() => {
    if (totalAModalOpen) {
      refetchExpenseCategories();
      refetchTodayCollection();
    }
  }, [totalAModalOpen, refetchExpenseCategories, refetchTodayCollection]);

  const { data: billSettings } = useQuery<BillSettings>({
    queryKey: ['mainpos-bill-settings', authToken],
    queryFn: async () => {
      const { data } = await api.get('/bill-settings');
      return data.data;
    },
    enabled: !!authToken,
  });

  // Keep currentToken in sync when external token events arrive & auto-trigger bill on payment
  useEffect(() => {
    const handler = async (e: any) => {
      try {
        const detail = e?.detail;
        const payload = detail?.token ?? detail;
        const eventId = payload?.id ?? payload?.token?.id ?? detail?.tokenId ?? null;
        const eventNumber = payload?.tokenNumber ?? payload?.token?.tokenNumber ?? detail?.tokenNumber ?? null;
        if (!currentToken) return;
        const matchesId = eventId && currentToken.id === eventId;
        const matchesNumber = eventNumber && currentToken.tokenNumber === eventNumber;
        if (!matchesId && !matchesNumber) return;

        let latestToken: TokenData | null = null;
        if (payload && Array.isArray(payload.items) && payload.status) {
          latestToken = payload as TokenData;
        } else {
          try {
            const { data } = await api.get(`/token/${currentToken.qrCode}`);
            latestToken = data.data;
          } catch (err) {
            // ignore fetch error
          }
        }

        if (latestToken) {
          setCurrentToken(latestToken);

          // If payment was completed automatically (via QR scan / Webhook / Socket), trigger bill & reset
          if (latestToken.status === 'paid') {
            playTokenSound();
            setPaidSuccess(true);
            setAwaitingUPIPayment(false);
            setPendingUpiPayment(null);
            if (socket) socket.emit('customer_display_reset', { restaurantId: activeRestaurantId });
            toast.success('🎉 Payment Received! Printing Bill automatically...');
            printFinalBill(latestToken, user?.restaurant?.name || 'SMARTGONEXT Bakery', billSettings);
            setTimeout(() => {
              setPaidSuccess(false);
              setCurrentToken(null);
              setLocalCart([]);
              setCustomerName('');
              setCustomerPhone('');
            }, 3000);
          }
        }
      } catch (err) {}
    };
    window.addEventListener('token_updated', handler as EventListener);
    window.addEventListener('token_paid', handler as EventListener);
    return () => {
      window.removeEventListener('token_updated', handler as EventListener);
      window.removeEventListener('token_paid', handler as EventListener);
    };
  }, [currentToken, api, socket, activeRestaurantId, billSettings, user?.restaurant?.name]);

  const { data: allItems = [] } = useQuery<MenuItem[]>({
    queryKey: ['mainpos-items', authToken],
    queryFn: async () => { const { data } = await api.get('/items'); return data.data; },
    enabled: !!authToken,
  });
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['mainpos-categories', authToken],
    queryFn: async () => { const { data } = await api.get('/categories'); return data.data; },
    enabled: !!authToken,
  });
  const { data: loyaltyConfig } = useQuery({
    queryKey: ['mainpos-loyalty-config', authToken],
    queryFn: async () => { const { data } = await api.get('/loyalty-config'); return data.data; },
    enabled: !!authToken,
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

  const matchedCustomer = useMemo(() => {
    const current = normalizePhone(customerPhone);
    if (!current) return null;
    return customerSuggestions.find((c: any) => {
      const cPhone = normalizePhone(c?.phone);
      if (!cPhone) return false;
      return cPhone === current || cPhone.endsWith(current) || current.endsWith(cPhone);
    }) || null;
  }, [customerPhone, customerSuggestions]);

  useEffect(() => {
    if (customerName || !customerPhone) return;
    if (matchedCustomer) {
      setCustomerName(matchedCustomer.name || '');
    }
  }, [customerPhone, customerName, matchedCustomer]);

  if (!isAuthenticated) return <Navigate to="/mainpos" replace />;
  const { data: restaurantSettings } = useQuery({
    queryKey: ['restaurant-settings'],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/restaurant/settings`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        withCredentials: true,
      });
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
  });

  const filteredItems = useMemo(() => {
    const weightSearch = parseWeightFromBarcode(search);
    return allItems.filter(item => {
      const matchCat = activeCategory === 'all' || item.categoryId === parseInt(activeCategory);
      const matchSearch = item.name.toLowerCase().includes(search.toLowerCase()) ||
        (item.productQR && item.productQR === search) ||
        (weightSearch?.productQR && (item.productQR === weightSearch.productQR || String(item.id) === weightSearch.productQR));
      return matchCat && matchSearch;
    });
  }, [allItems, activeCategory, search]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const rawBarcode = search.trim();
      
      if (!rawBarcode) return;

      // Try weight-based barcode parsing first
      const weightResult = parseWeightFromBarcode(rawBarcode);

      if (weightResult && weightResult.isWeightBased) {
        // Weight-based scanning: extract product QR and quantity
        const productQR = weightResult.productQR;
        const quantity = weightResult.quantity; // in kg
        
        const item = allItems.find(i => {
          const qr = String(i.productQR || '').trim().toLowerCase();
          const invSku = String(i.inventoryItem?.sku || '').trim().toLowerCase();
          const invBc = String(i.inventoryItem?.barcode || '').trim().toLowerCase();
          
          const targets = new Set<string>();
          if (productQR) targets.add(productQR.trim().toLowerCase());
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
          // Add with extracted quantity
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
              quantity, // Use extracted weight as quantity
            });
          } else {
            addCartEntry({
              item,
              price: Number(item.price),
              displayName: item.name,
              salesUnit: item.salesUnit ?? null,
              quantity, // Use extracted weight as quantity
            });
          }
          setSearch('');
          toast.success(`✓ Added ${item.name}: ${quantity.toFixed(2)}kg`, { duration: 1000, icon: '📦' });
          return;
        } else if (item) {
          // Item exists but not kg-measured, add with quantity 1
          handleAddToCart(item);
          setSearch('');
          return;
        }
      }

      // Standard barcode/pack matching (existing logic)
      const packMatch = findPackByBarcode(rawBarcode);
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
        setSearch('');
        toast.success(`Scanned: ${displayName}`, { duration: 800, icon: '🏷️' });
        return;
      }

      // Exact product QR match
      const exactMatch = allItems.find(i => i.productQR === rawBarcode || String(i.id) === rawBarcode);
      if (exactMatch) {
        handleAddToCart(exactMatch);
        setSearch('');
        toast.success(`Scanned: ${exactMatch.name}`, { duration: 800, icon: '🏷️' });
      } else if (filteredItems.length === 1) {
        handleAddToCart(filteredItems[0]);
        setSearch('');
      } else if (rawBarcode.length > 0) {
        toast.error('Item not found for scanning');
        setSearch('');
      }
    }
  };

  const saveToken = async () => {
    if (localCart.length === 0) { toast.error('No items to save'); return; }
    if (currentToken?.status === 'paid') { toast.error('Cannot add items to a paid token'); return; }
    setIsSubmitting(true);
    try {
      const itemsPayload = localCart.map(i => ({
        menuItemId: i.menuItemId,
        quantity: i.quantity,
        inventoryItemMRPId: i.inventoryItemMRPId,
        purchaseRate: i.purchaseRate,
        linePrice: i.price,
        menuItemName: i.displayName || i.name,
      }));
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

  const presentToCustomer = async (tokenOverride?: TokenData) => {
    const token = tokenOverride ?? currentToken;
    if (!token && localCart.length === 0) { toast.error('No bill to present'); return; }
    const tokenNum = token?.tokenNumber;
    const ridParam = activeRestaurantId ? `rid=${encodeURIComponent(String(activeRestaurantId))}` : '';
    const displayUrl = tokenNum
      ? `/admin/customer-display?token=${tokenNum}${ridParam ? `&${ridParam}` : ''}`
      : `/admin/customer-display${ridParam ? `?${ridParam}` : ''}`;

    // ─── Electron: use IPC to open dedicated customer display window ───
    const electron = (window as any).electron || (window as any).electronAPI;
    if (electron && electron.openCustomerDisplay) {
      electron.openCustomerDisplay(displayUrl);
      isPresentingRef.current = true;
      sessionStorage.setItem('pos_is_presenting', 'true');
      return;
    }

    // ─── Notify backend/socket FIRST so the display page loads fresh data ───
    if (token) {
      try { await api.post(`/token/${token.qrCode}/present`); } catch { /* silent */ }
    } else {
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
      const payload = { restaurantId: activeRestaurantId, items: mappedItems, subtotal, tax, total: subtotal + tax };
      try {
        if (socket) socket.emit('customer_display_update', payload);
        else await api.post('/token/present', payload);
      } catch { /* silent */ }
    }

    // ─── Open customer display in a new browser tab (bypasses popup blockers) ───
    const isFile = window.location.protocol === 'file:';
    const baseUrl = isFile
      ? `${window.location.origin}${window.location.pathname}`
      : window.location.origin;
    const finalUrl = isFile ? `${baseUrl}#${displayUrl}` : `${baseUrl}${displayUrl}`;

    const newTab = window.open(finalUrl, '_blank');
    if (newTab) {
      displayWindowRef.current = newTab;
    } else {
      // Last resort if browser blocked even _blank tabs
      window.location.href = finalUrl;
    }

    isPresentingRef.current = true;
    sessionStorage.setItem('pos_is_presenting', 'true');
    toast.success(
      tokenNum ? `Bill #${tokenNum} presented on customer display` : 'Presented live cart to customer display',
      { duration: 2000 }
    );
  };

  // ── Auto Broadcast Live Cart to Customer Display ──
  useEffect(() => {
    if (!socket || !activeRestaurantId) return;
    const mappedItems = localCart.length > 0
      ? localCart.map(i => {
          const mi = allItems.find(ai => ai.id === i.menuItemId);
          const resolvedName = i.displayName || i.name;
          const resolved = resolveImageUrl(mi?.image ?? null) ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(resolvedName.charAt(0) || 'A')}&background=1a1c23&color=fff`;
          return { menuItemId: i.menuItemId, name: resolvedName, price: i.price, quantity: i.quantity, image: resolved };
        })
      : (currentToken?.items || []).filter(i => !i.isRemoved).map(i => ({
          menuItemId: i.menuItemId,
          name: i.menuItemName || i.menuItem?.name || 'Item',
          price: i.linePrice ?? i.price,
          quantity: i.quantity,
          image: resolveImageUrl(i.menuItem?.image ?? null),
        }));

    if (mappedItems.length === 0 && !currentToken) return;

    const subtotal = currentToken
      ? Number(currentToken.subtotal || 0)
      : mappedItems.reduce((s, it) => s + Number(it.price) * Number(it.quantity), 0);

    const tax = currentToken
      ? Number(currentToken.tax || ((currentToken.sgst || 0) + (currentToken.cgst || 0) + (currentToken.igst || 0)) || 0)
      : mappedItems.reduce((sum, item) => {
          const menu = allItems.find(m => m.id === item.menuItemId);
          const line = getLineTaxBreakdown(Number(item.price) * Number(item.quantity), menu?.taxType, Number(menu?.taxPercent ?? 0));
          return sum + Number(line.tax || 0);
        }, 0);

    const discount = currentToken ? Number(currentToken.discountApplied || 0) : 0;
    const total = currentToken ? Number(currentToken.total || 0) : Math.max(0, subtotal + tax - discount);

    const payload = {
      restaurantId: activeRestaurantId,
      tokenNumber: currentToken?.tokenNumber,
      items: mappedItems,
      subtotal,
      tax,
      discount,
      total,
    };
    socket.emit('customer_display_update', payload);
  }, [localCart, currentToken, socket, activeRestaurantId, allItems]);

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
      try { await presentToCustomer(data.data); } catch (e) {}
    } catch (err: any) { toast.error(err?.response?.data?.error || 'Token not found'); }
  };

  const clearToken = () => {
    setCurrentToken(null); setLocalCart([]); setCustomerName(''); setCustomerPhone('');
    if (socket) socket.emit('customer_display_reset', { restaurantId: user?.restaurant?.id });
  };

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

  // ── FIXED: handleAddToCart uses sellingPrice, never raw mrp ──
  const { playSound, playAddSound, playIncrementSound, playDecrementSound, playDeleteSound, playTokenSound, playKeypadSound } = useClickSound();
  const cartScrollRef = useRef<HTMLDivElement | null>(null);
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
    const {
      item,
      price,
      mrpId,
      purchaseRate,
      profitPercent,
      displayName,
      salesUnit,
      quantity = 1,
      inventoryItemName,
      inventoryMRPs,
    } = options;

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
      const newEntry = {
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

  // ── FIXED: changeLocalItemMRP uses sellingPrice ──
  const changeLocalItemMRP = (cartItemId: string, selectedMRP: InventoryMRP) => {
    const newPrice = getMRPSellingPrice(selectedMRP); // ✅ sellingPrice
    setLocalCart(prev => {
      return prev.map(p => p.id === cartItemId ? {
        ...p,
        inventoryItemMRPId: selectedMRP.id,
        purchaseRate: Number(selectedMRP.purchaseRate),
        profitPercent: Number(selectedMRP.profitPercent ?? 0),
        price: newPrice,
      } : p);
    });
  };

  const handleLoadWaiterBill = (bill: any) => {
    setCustomerName(bill.customerName || `Table ${bill.tableName}`);
    setCustomerPhone(bill.customerPhone || '');
    setLoadedWaiterBill({
      id: bill.id,
      orderId: bill.orderId ? Number(bill.orderId) : null,
      orderIds: Array.isArray(bill.orderIds) ? bill.orderIds : (bill.orderId ? [Number(bill.orderId)] : []),
      tableId: bill.tableId ? Number(bill.tableId) : null,
      tableIds: Array.isArray(bill.tableIds) ? bill.tableIds : (bill.tableId ? [Number(bill.tableId)] : []),
      tableChairs: Array.isArray(bill.tableChairs) ? bill.tableChairs : [],
      bakeryTokenId: bill.bakeryTokenId ? Number(bill.bakeryTokenId) : null,
      chairNumbers: Array.isArray(bill.chairNumbers) ? bill.chairNumbers : (bill.chairNumber ? [Number(bill.chairNumber)] : []),
      isEntireTable: bill.isEntireTable ?? true,
    });

    const mappedCart: LocalCartItem[] = (bill.items || []).map((it: any) => {
      const mi = allItems.find((m) => m.id === it.menuItemId);
      return {
        id: Math.random().toString(36).substr(2, 9),
        menuItemId: it.menuItemId,
        name: it.name || mi?.name || 'Item',
        displayName: it.name || mi?.name || 'Item',
        salesUnit: mi?.salesUnit || null,
        price: Number(it.price),
        quantity: Number(it.quantity || 1),
      };
    });

    if (bill.bakeryTokenId) {
      api.get(`/restaurant/tokens/${bill.bakeryTokenId}`).then((res) => {
        if (res.data?.data) {
          setCurrentToken(res.data.data);
          setLocalCart([]);
        } else {
          setLocalCart(mappedCart);
        }
      }).catch(() => {
        setLocalCart(mappedCart);
      });
    } else {
      setCurrentToken(null);
      setLocalCart(mappedCart);
    }
    setWaiterBillsModalOpen(false);
    playTokenSound();
    toast.success(`🛒 Loaded Bill for ${bill.tableName} (${bill.staffName || 'Waiter'})!`, { icon: '🧾' });
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

  // ── Live customer display sync ──
  useEffect(() => {
    if (!isPresentingRef.current) return;
    if (presentDebounceTimer.current) window.clearTimeout(presentDebounceTimer.current as number);
    presentDebounceTimer.current = window.setTimeout(() => {
      try {
        const combinedMap = new Map<string, any>();
        if (currentToken && Array.isArray(currentToken.items)) {
          for (const it of currentToken.items.filter(i => !i.isRemoved)) {
            const price = Number((it as any).price ?? 0);
            const key = `${it.menuItemId}::${price}`;
            combinedMap.set(key, { id: it.id, menuItemId: it.menuItemId, name: it.menuItemName, price, quantity: Number((it as any).quantity ?? 0), image: resolveImageUrl((it as any).menuItem?.image) || null });
          }
        }
        for (const i of localCart) {
          const mi = allItems.find(ai => ai.id === i.menuItemId);
          const resolvedName = i.displayName || i.name;
          const key = `${i.menuItemId}::${i.price}::${resolvedName}`;
          const existing = combinedMap.get(key);
          const image = resolveImageUrl(mi?.image ?? null) || `https://ui-avatars.com/api/?name=${encodeURIComponent(resolvedName.charAt(0) || 'A')}&background=1a1c23&color=fff`;
          if (existing) { existing.quantity = existing.quantity + i.quantity; combinedMap.set(key, existing); }
          else combinedMap.set(key, { id: i.id, menuItemId: i.menuItemId, name: resolvedName, price: i.price, quantity: i.quantity, image });
        }
        const combinedItems = Array.from(combinedMap.values());
        const subtotal = localCartSubtotal + (currentToken ? Number(currentToken.subtotal || 0) : 0);
        const currentTokenTax = currentToken ? Number(currentToken.tax ?? (Number(currentToken.sgst || 0) + Number(currentToken.cgst || 0) + Number(currentToken.igst || 0))) : 0;
        const tax = localCartTax + currentTokenTax;
        const discount = currentToken ? Number(currentToken.discountApplied || 0) : 0;
        const total = Math.max(0, subtotal + tax - discount);
        const payload: any = { restaurantId: user?.restaurant?.id, items: combinedItems, subtotal, tax, discount, total };
        if (currentToken) { payload.tokenNumber = currentToken.tokenNumber; payload.tokenId = currentToken.id; }
        if (socket) socket.emit('customer_display_update', payload);
        else api.post('/token/present', payload).catch(() => {});
      } catch (e) {}
    }, 300) as unknown as number;
    return () => { if (presentDebounceTimer.current) { window.clearTimeout(presentDebounceTimer.current as number); presentDebounceTimer.current = null; } };
  }, [localCart, currentToken, socket, user?.restaurant?.id]);

  useEffect(() => {
    const id = window.setInterval(() => {
      try { if (displayWindowRef.current && displayWindowRef.current.closed) { isPresentingRef.current = false; displayWindowRef.current = null; } } catch (e) {}
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Mutations ──
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
      const { data } = await api.post(`/token/${currentToken!.qrCode}/loyalty/claim`, { customerId: currentToken!.customer!.id, pointsToClaim });
      return data.data;
    },
    onSuccess: (data) => { setCurrentToken(data); setLoyaltyModal(false); toast.success('Loyalty discount applied!'); try { presentToCustomer(data).catch(() => {}); } catch (e) {} },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Loyalty claim failed'),
  });

  const assignCustomerMut = useMutation({
    mutationFn: async (c: { name: string; phone: string }) => {
      if (!currentToken) return null;
      const { data } = await api.post(`/token/${currentToken.qrCode}/customer`, { customerName: c.name, customerPhone: c.phone });
      return data.data;
    },
    onSuccess: (data) => { if (data) setCurrentToken(data); toast.success('Customer linked to token'); },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to link customer'),
  });

  const createTokenMut = useMutation({
    mutationFn: async (payload: { items: any[]; customerName?: string; customerPhone?: string }) => {
      const { data } = await api.post('/token/create', { ...payload, staffId: user?.id });
      return data.data;
    },
    onSuccess: (data) => {
      playTokenSound();
      setCurrentToken(data); setLocalCart([]);
      if (data.customerName) setCustomerName(data.customerName);
      if (data.customerPhone) setCustomerPhone(data.customerPhone);
      toast.success('Token saved');
      try { printTokenSlip(data, user?.restaurant?.name || 'SMARTGONEXT Bakery', billSettings); } catch (err) {}
      try { api.post(`/token/${data.qrCode}/present`).catch(() => {}); } catch {}
      setTimeout(() => { setCurrentToken(null); setCustomerName(''); setCustomerPhone(''); }, 700);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to create token'),
  });

  const addItemsMut = useMutation({
    mutationFn: async (payload: { qr: string; items: any[] }) => {
      const { data } = await api.post(`/token/${payload.qr}/items/bulk`, { items: payload.items, staffId: user?.id });
      return data.data;
    },
    onSuccess: (data) => {
      playTokenSound();
      setCurrentToken(data); setLocalCart([]); toast.success('Items added to token');
      try { printTokenSlip(data, user?.restaurant?.name || 'SMARTGONEXT Bakery', billSettings); } catch (err) {}
      try { api.post(`/token/${data.qrCode}/present`).catch(() => {}); } catch {}
      setTimeout(() => { setCurrentToken(null); setCustomerName(''); setCustomerPhone(''); }, 700);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to add items to token'),
  });

  const processPayment = async (method: string, customPayAmount?: number) => {
    if (!customerName || !customerName.trim()) {
      toast.error('Customer Name is REQUIRED! Please enter customer name before billing.');
      return;
    }
    if (!currentToken && localCart.length === 0) { toast.error('Cart is empty'); return; }
    if (currentToken?.status === 'paid') { toast.success('This token is already fully paid'); return; }
    playTokenSound();
    setIsSubmitting(true);
    let targetQrCode = currentToken?.qrCode;
    try {
      if (!currentToken) {
        const createRes = await api.post('/token/create', {
          items: localCart.map(i => ({
            menuItemId: i.menuItemId,
            quantity: i.quantity,
            inventoryItemMRPId: i.inventoryItemMRPId,
            purchaseRate: i.purchaseRate,
            linePrice: i.price,
            menuItemName: i.displayName || i.name,
          })),
          customerName: customerName || undefined, customerPhone: customerPhone || undefined,
          staffId: user?.id,
          orderId: loadedWaiterBill?.orderId || undefined,
          orderIds: loadedWaiterBill?.orderIds || undefined,
          tableId: loadedWaiterBill?.tableId || undefined,
          tableIds: loadedWaiterBill?.tableIds || undefined,
          tableChairs: loadedWaiterBill?.tableChairs || undefined,
          chairNumbers: loadedWaiterBill?.chairNumbers || undefined,
          isEntireTable: loadedWaiterBill?.isEntireTable ?? undefined,
        });
        targetQrCode = createRes.data.data.qrCode;
      } else if (localCart.length > 0) {
        await api.post(`/token/${currentToken.qrCode}/items/bulk`, {
          items: localCart.map(i => ({
            menuItemId: i.menuItemId,
            quantity: i.quantity,
            inventoryItemMRPId: i.inventoryItemMRPId,
            purchaseRate: i.purchaseRate,
            linePrice: i.price,
            menuItemName: i.displayName || i.name,
          })),
          staffId: user?.id,
        });
      }

      // If user typed customer info but did not press Save, attach before taking payment.
      if (targetQrCode && customerPhone) {
        const currentPhone = currentToken?.customerPhone;
        const customerChanged = !phonesLikelySame(currentPhone, customerPhone) ||
          ((customerName || '').trim() !== (currentToken?.customerName || '').trim()) ||
          !currentToken?.customer;

        if (customerChanged) {
          await api.post(`/token/${targetQrCode}/customer`, {
            customerName: customerName || undefined,
            customerPhone,
          });
        }
      }

      const tRes = await api.get(`/token/${targetQrCode}`);
      const latestToken = tRes.data.data;
      const totalPaid = latestToken.payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
      const remaining = Math.max(0, Number(latestToken.total) - totalPaid);
      const payAmount = (customPayAmount && customPayAmount > 0 && customPayAmount <= remaining) ? customPayAmount : remaining;

      if (remaining > 0) {
        if (method === 'gpay' || method === 'upi') {
          const merchantVpa = (billSettings?.upiVpa || billSettings?.upiId || import.meta.env.VITE_UPI_MERCHANT || import.meta.env.VITE_MERCHANT_UPI || '');
          if (!merchantVpa) {
            toast.error('Merchant UPI VPA is not configured! Please save your UPI ID in Settings -> Bill Settings.');
            setIsSubmitting(false);
            return;
          }
          const merchantName = (user?.restaurant?.name || import.meta.env.VITE_MERCHANT_NAME || 'Merchant');
          const upiUri = `upi://pay?pa=${encodeURIComponent(merchantVpa)}&pn=${encodeURIComponent(merchantName)}&am=${encodeURIComponent(String(payAmount))}&cu=INR&tr=${encodeURIComponent(String(targetQrCode || ''))}`;
          if (socket) socket.emit('customer_display_show_qr', { restaurantId: user?.restaurant?.id, upiUri, amount: payAmount, token: targetQrCode, merchantName, merchantVpa });
          setAwaitingUPIPayment(true); setPendingUpiPayment({ tokenQr: String(targetQrCode), amount: payAmount, method });
          toast.success('UPI/GPay QR shown on customer display'); setIsSubmitting(false); return;
        }
        const payRes = await api.post(`/token/${targetQrCode}/payment`, { method, amount: payAmount, staffId: user?.id });
        const responseData = payRes.data?.data || payRes.data;
        const finalToken = responseData?.token ?? responseData;
        if (!finalToken) throw new Error('Payment response missing final token data');
        setCurrentToken(finalToken); setLocalCart([]);

        // Open cash drawer if method is cash
        if (method === 'cash') {
          openCashDrawer();
        }

        if (finalToken?.status === 'paid') {
          setPaidSuccess(true); setAwaitingUPIPayment(false); setPendingUpiPayment(null);
          if (socket) socket.emit('customer_display_payment_ok', { restaurantId: user?.restaurant?.id, paid: payAmount, amount: payAmount, customerName: finalToken?.customerName });
          printFinalBill(finalToken, user?.restaurant?.name || 'SMARTGONEXT Bakery', billSettings);
          setLoadedWaiterBill(null);
          refetchPendingWaiterBills();
          setTimeout(() => { setPaidSuccess(false); setCurrentToken(null); setCustomerName(''); setCustomerPhone(''); }, 3000);
        } else {
          toast.success(`Partial payment of ₹${payAmount.toFixed(2)} (${method.toUpperCase()}) recorded!`);
        }
      } else { toast.success('Token is already fully paid'); setLocalCart([]); setCurrentToken(latestToken); }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Payment process failed');
    } finally { setIsSubmitting(false); }
  };

  const processSplitPayment = async (m1: string, a1: number, m2: string, a2: number) => {
    if (!currentToken && localCart.length === 0) { toast.error('Cart is empty'); return; }
    if (a1 <= 0 && a2 <= 0) { toast.error('Please enter payment amounts'); return; }
    playTokenSound();
    setIsSubmitting(true);
    try {
      let targetQrCode = currentToken?.qrCode;

      if (!currentToken) {
        const createRes = await api.post('/token/create', {
          items: localCart.map(i => ({
            menuItemId: i.menuItemId,
            quantity: i.quantity,
            inventoryItemMRPId: i.inventoryItemMRPId,
            purchaseRate: i.purchaseRate,
            linePrice: i.price,
            menuItemName: i.displayName || i.name,
          })),
          customerName: customerName || undefined, customerPhone: customerPhone || undefined,
          staffId: user?.id,
          orderId: loadedWaiterBill?.orderId || undefined,
          orderIds: loadedWaiterBill?.orderIds || undefined,
          tableId: loadedWaiterBill?.tableId || undefined,
          tableIds: loadedWaiterBill?.tableIds || undefined,
          tableChairs: loadedWaiterBill?.tableChairs || undefined,
          chairNumbers: loadedWaiterBill?.chairNumbers || undefined,
          isEntireTable: loadedWaiterBill?.isEntireTable ?? undefined,
        });
        targetQrCode = createRes.data.data.qrCode;
      } else if (localCart.length > 0) {
        await api.post(`/token/${currentToken.qrCode}/items/bulk`, {
          items: localCart.map(i => ({
            menuItemId: i.menuItemId,
            quantity: i.quantity,
            inventoryItemMRPId: i.inventoryItemMRPId,
            purchaseRate: i.purchaseRate,
            linePrice: i.price,
            menuItemName: i.displayName || i.name,
          })),
          staffId: user?.id,
        });
      }

      if (targetQrCode && customerPhone) {
        const currentPhone = currentToken?.customerPhone;
        const customerChanged = !phonesLikelySame(currentPhone, customerPhone) ||
          ((customerName || '').trim() !== (currentToken?.customerName || '').trim()) ||
          !currentToken?.customer;
        if (customerChanged) {
          await api.post(`/token/${targetQrCode}/customer`, {
            customerName: customerName || undefined,
            customerPhone,
          }).catch(() => {});
        }
      }

      let latestToken: any = null;

      // First split payment
      if (a1 > 0) {
        const payRes1 = await api.post(`/token/${targetQrCode}/payment`, { method: m1, amount: a1, staffId: user?.id });
        const resData1 = payRes1.data?.data || payRes1.data;
        latestToken = resData1?.token ?? resData1;
        if (m1 === 'cash') openCashDrawer();
      }

      // Second split payment
      if (a2 > 0) {
        const payRes2 = await api.post(`/token/${targetQrCode}/payment`, { method: m2, amount: a2, staffId: user?.id });
        const resData2 = payRes2.data?.data || payRes2.data;
        latestToken = resData2?.token ?? resData2;
        if (m2 === 'cash') openCashDrawer();
      }

      if (!latestToken) {
        const tRes = await api.get(`/token/${targetQrCode}`);
        latestToken = tRes.data.data;
      }

      setCurrentToken(latestToken);
      setLocalCart([]);

      if (latestToken?.status === 'paid') {
        setPaidSuccess(true);
        setAwaitingUPIPayment(false);
        setPendingUpiPayment(null);
        if (socket) socket.emit('customer_display_payment_ok', { restaurantId: activeRestaurantId, paid: latestToken.total, amount: latestToken.total, customerName: latestToken.customerName });
        toast.success('Split payment completed successfully!');
        printFinalBill(latestToken, user?.restaurant?.name || 'SMARTGONEXT Bakery', billSettings);
        setLoadedWaiterBill(null);
        refetchPendingWaiterBills();
        setTimeout(() => {
          setPaidSuccess(false);
          setCurrentToken(null);
          setCustomerName('');
          setCustomerPhone('');
        }, 3000);
      } else {
        toast.success(`Split payment recorded!`);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Split payment failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmUPIPayment = async () => {
    if (!pendingUpiPayment) { toast.error('No pending UPI payment to confirm'); return; }
    try {
      setIsSubmitting(true);
      const payRes = await api.post(`/token/${pendingUpiPayment.tokenQr}/payment`, { method: pendingUpiPayment.method, amount: pendingUpiPayment.amount, staffId: user?.id });
      const responseData = payRes.data?.data || payRes.data;
      const finalToken = responseData?.token ?? responseData;
      if (!finalToken) throw new Error('Payment response missing final token data');
      setCurrentToken(finalToken); setLocalCart([]); setAwaitingUPIPayment(false); setPendingUpiPayment(null);
      if (finalToken?.status === 'paid') {
        setPaidSuccess(true);
        if (socket) socket.emit('customer_display_payment_ok', { restaurantId: user?.restaurant?.id, paid: pendingUpiPayment.amount, amount: pendingUpiPayment.amount, customerName: finalToken?.customerName });
        printFinalBill(finalToken, user?.restaurant?.name || 'SMARTGONEXT Bakery', billSettings);
        setTimeout(() => { setPaidSuccess(false); setCurrentToken(null); setCustomerName(''); setCustomerPhone(''); }, 3000);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'UPI confirmation failed');
    } finally { setIsSubmitting(false); }
  };

  // Real-time automatic payment confirmation listener for UPI/EDC terminals
  useEffect(() => {
    if (!socket) return;
    const handleAutoPayment = (_data: any) => {
      if (pendingUpiPayment) {
        toast.success('Payment Received via Terminal/QR! Finalizing...');
        confirmUPIPayment();
      }
    };
    socket.on('customer_display_payment_ok', handleAutoPayment);
    socket.on('payment_success', handleAutoPayment);
    return () => {
      socket.off('customer_display_payment_ok', handleAutoPayment);
      socket.off('payment_success', handleAutoPayment);
    };
  }, [socket, pendingUpiPayment]);

  // ── Derived state ──
  const activeTokenItems = currentToken?.items.filter(i => !i.isRemoved) ?? [];
  const removedTokenItems = currentToken?.items.filter(i => i.isRemoved) ?? [];
  const localCartSubtotal = localCart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const existingRemaining = currentToken ? Math.max(0, Number(currentToken.total) - currentToken.payments.reduce((s, p) => s + Number(p.amount), 0)) : 0;
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
  const calculatedTotal = currentToken ? existingRemaining + localCartFinal : localCartFinal;
  const displayTotal = customTotalOverride !== null ? customTotalOverride : calculatedTotal;
  const totalActiveQuantity = activeTokenItems.reduce((s, it) => s + Number(it.quantity || 0), 0);
  const totalLocalQuantity = localCart.reduce((s, it) => s + Number(it.quantity || 0), 0);
  const combinedCartItemsCount = totalActiveQuantity + totalLocalQuantity;
  const isCartEmpty = combinedCartItemsCount === 0;
  const heldCount = (Array.isArray(terminalKots) && terminalKots.length > 0)
    ? terminalKots.filter((k: any) => k.status === 'pending').length
    : heldKots.filter(k => k.status === 'pending').length;

  const visibleKots = (Array.isArray(terminalKots) && terminalKots.length > 0) ? terminalKots : heldKots;

  const isKotInSelectedDate = (kot: any) => {
    const createdAt = kot?.createdAt ? new Date(kot.createdAt) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) return false;

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    if (kotDateFilter === 'today') {
      return createdAt >= todayStart && createdAt < tomorrowStart;
    }

    return createdAt >= yesterdayStart && createdAt < todayStart;
  };

  const filteredVisibleKots = visibleKots.filter((k: any) => isKotInSelectedDate(k));
  const todayOrdersCount = Number(todayCollection?.ordersCount ?? 0);
  const todayCollectionAmount = Number(todayCollection?.collectionAmount ?? 0);
  const sessionExpenseTotal = sessionExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
  const todayNetAfterExpense = Math.max(0, todayCollectionAmount - sessionExpenseTotal);

  if (!isAuthenticated) return <Navigate to="/mainpos" replace />;

  return (
    <div className={cn(
      "flex flex-col h-[calc(100vh)] overflow-hidden text-[13px] transition-colors duration-200",
      isLight ? "bg-slate-100 text-slate-900" : "bg-[#0f1014] text-white"
    )}>

      {/* Header */}
      <div className={cn(
        "flex items-center justify-between px-3 py-2 border-b flex-shrink-0 transition-colors duration-200",
        isLight ? "bg-white border-slate-200 text-slate-900 shadow-sm" : "bg-[#1a1c23] border-gray-800 text-white"
      )}>
        <div className="flex items-center gap-3">
          <CreditCard className="w-4 h-4 text-purple-500" />
          <span className={cn("font-bold uppercase tracking-wide text-[13px]", isLight ? "text-slate-800" : "text-gray-200")}>{terminal?.name ?? 'MAIN POS'}</span>
          {user?.name && (
            <span className={cn("px-2 py-0.5 text-[10px] font-black uppercase rounded-md border tracking-wider", isLight ? "bg-purple-100 text-purple-800 border-purple-200" : "bg-purple-500/10 text-purple-300 border-purple-500/20")}>
              Staff: {user.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Theme Toggle */}
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

          {/* Cash Register Status Button */}
          <button
            onClick={() => setIsRegisterModalOpen(true)}
            className={cn(
              "py-1.5 px-2.5 rounded-md text-[11px] font-bold uppercase transition flex items-center gap-1.5 border",
              isRegisterOpen
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25"
                : "bg-rose-500/15 text-rose-400 border-rose-500/30 hover:bg-rose-500/25"
            )}
            title="Cash Register Shift & Morning Float"
          >
            <Landmark className="w-3.5 h-3.5" />
            <span>
              {isRegisterOpen
                ? `Register Open (${formatCurrency(registerSession?.openingBalance || 0)})`
                : 'Open Register'}
            </span>
            <span className={`w-2 h-2 rounded-full ${isRegisterOpen ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
          </button>
          {(currentToken || (localCart.length > 0 && !currentToken)) && (
            <button onClick={() => presentToCustomer()} disabled={isSubmitting || (currentToken?.status === 'paid' && localCart.length === 0)}
              className="py-1.5 px-2.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-[11px] font-bold uppercase transition disabled:opacity-50 flex items-center gap-2">
              🖥️ Present
            </button>
          )}
          <span className={cn(
            "px-2 py-1 text-[10px] font-bold uppercase rounded-md border tracking-wider",
            isLight ? "bg-slate-100 text-slate-700 border-slate-300" : "bg-gray-800 text-gray-300 border-gray-700"
          )}>
            {combinedCartItemsCount} ITEMS
          </span>
          {/* <button
            onClick={() => setWaiterBillsModalOpen(true)}
            className={cn(
              "py-1.5 px-2.5 rounded-md text-[11px] font-bold uppercase transition flex items-center gap-1.5",
              pendingWaiterBills.length > 0
                ? "bg-amber-500 text-black font-black animate-pulse shadow-lg"
                : (isLight ? "bg-slate-200 text-slate-800 hover:bg-slate-300" : "bg-gray-800 text-gray-300")
            )}
            title="View Bills Requested by Waiters"
          >
            📋 Waiter Bills
            {pendingWaiterBills.length > 0 && (
              <span className="ml-1 inline-block bg-red-600 text-white text-xs font-black px-2 py-0.5 rounded-full shadow-sm">
                {pendingWaiterBills.length}
              </span>
            )}
          </button> */}
          <button onClick={() => setKotsModalOpen(true)}
            className={`py-1.5 px-2.5 rounded-md text-[11px] font-bold uppercase transition ${heldCount > 0 ? 'bg-red-500 text-white' : (isLight ? 'bg-slate-200 text-slate-800 hover:bg-slate-300' : 'bg-gray-800 text-gray-300')}`}>
            KOT {heldCount > 0 && <span className="ml-2 inline-block bg-white/10 text-white text-xs px-2 py-0.5 rounded-full">{heldCount}</span>}
          </button>
          <button
            onClick={() => { setOrdersModalOpen(true); setSelectedTodayOrder(null); }}
            className="py-1.5 px-2.5 rounded-md text-[11px] font-bold uppercase transition bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            ORD <span className="ml-2 inline-block bg-white/10 text-white text-xs px-2 py-0.5 rounded-full">{todayOrdersCount}</span>
          </button>
          <button
            onClick={() => setTotalAModalOpen(true)}
            className="py-1.5 px-2.5 rounded-md text-[11px] font-bold uppercase transition bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Total A <span className="ml-2 inline-block bg-white/10 text-white text-xs px-2 py-0.5 rounded-full">{formatCurrency(todayCollectionAmount)}</span>
          </button>
          <button onClick={() => setKotPopupEnabled(!kotPopupEnabled)}
            className={`py-1.5 px-2.5 rounded-md text-[11px] font-bold uppercase transition ${kotPopupEnabled ? 'bg-amber-400 text-black' : (isLight ? 'bg-slate-200 text-slate-800' : 'bg-gray-800 text-gray-300')}`}>
            <Bell className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setReturnModalOpen(true)}
            className="py-1.5 px-2.5 rounded-md text-[11px] font-bold uppercase transition bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-2">
            <RotateCw className="w-3.5 h-3.5" /> Return
          </button>
          <button onClick={logout} className={cn(
            "flex items-center gap-1.5 transition text-[11px] font-bold uppercase",
            isLight ? "text-slate-600 hover:text-slate-900" : "text-gray-400 hover:text-white"
          )}>
            <LogOut className="w-3.5 h-3.5" /> Exit POS
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
            : ((tab.currentToken?.items?.length || 0) + (tab.localCart?.length || 0));

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

      {/* Main Grid */}
      <div className="flex flex-1 overflow-hidden p-2.5 gap-2.5">

        <KotPopup />

        {waiterBillsModalOpen && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className={cn(
              "p-5 rounded-2xl w-full max-w-3xl border shadow-2xl transition-colors",
              isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#1a1c23] border-gray-800 text-white"
            )}>
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <div className="flex items-center gap-3">
                  <span className="text-xl">📋</span>
                  <div>
                    <h3 className={cn("text-base font-black uppercase tracking-wider", isLight ? "text-slate-900" : "text-white")}>
                      Pending Waiter Bills ({pendingWaiterBills.length})
                    </h3>
                    <p className="text-xs text-amber-500 font-bold">Select a table bill to load into cart & collect payment</p>
                  </div>
                </div>
                <button
                  onClick={() => setWaiterBillsModalOpen(false)}
                  className={cn("text-xs font-bold px-3 py-1.5 rounded-lg border transition", isLight ? "bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-300" : "bg-gray-700 hover:bg-gray-600 text-white border-gray-600")}
                >
                  Close
                </button>
              </div>

              <div className="mt-4 max-h-[60vh] overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                {pendingWaiterBills.length === 0 ? (
                  <div className="py-12 text-center text-gray-500 text-xs font-bold">
                    No active pending waiter bills requested at this moment.
                  </div>
                ) : (
                  pendingWaiterBills.map((bill: any) => (
                    <div
                      key={bill.id}
                      className={cn(
                        "p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition hover:border-amber-500/50",
                        isLight ? "bg-slate-50 border-slate-200" : "bg-[#0f1014] border-gray-800"
                      )}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-500 text-xs font-black uppercase">
                            Table {bill.tableName}
                          </span>
                          <span className="text-xs font-bold text-gray-400">
                            👤 Waiter: <strong className={isLight ? "text-slate-800" : "text-white"}>{bill.staffName}</strong>
                          </span>
                        </div>
                        <p className={cn("text-sm font-black", isLight ? "text-slate-900" : "text-white")}>
                          {bill.customerName || `Customer (Table ${bill.tableName})`} {bill.customerPhone ? `· ${bill.customerPhone}` : ''}
                        </p>
                        <div className="text-xs text-gray-500">
                          {(bill.items || []).map((it: any) => `${it.quantity}x ${it.name}`).join(', ')}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold text-gray-400 block">Total Payable</span>
                          <span className="text-lg font-black text-emerald-400">₹{Number(bill.total || 0).toFixed(2)}</span>
                        </div>

                        <button
                          onClick={() => handleLoadWaiterBill(bill)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase px-4 py-2.5 rounded-xl shadow-md transition flex items-center gap-1.5 active:scale-95 cursor-pointer"
                        >
                          🛒 Load to Cart & Pay
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {kotsModalOpen && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className={cn(
              "p-5 rounded-2xl w-full max-w-3xl border shadow-2xl transition-colors",
              isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#1a1c23] border-gray-800 text-white"
            )}>
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <div className="flex items-center gap-3">
                  <h3 className={cn("text-base font-black uppercase tracking-wider", isLight ? "text-slate-900" : "text-white")}>Held KOTs</h3>
                  <select
                    value={kotDateFilter}
                    onChange={(e) => setKotDateFilter(e.target.value as 'today' | 'yesterday')}
                    className={cn(
                      "border rounded-lg px-2.5 py-1 text-xs font-bold outline-none",
                      isLight ? "bg-slate-100 border-slate-300 text-slate-900" : "bg-[#0f1014] border-gray-700 text-gray-200"
                    )}
                  >
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  {selectedKot && (
                    <button
                      onClick={() => setSelectedKot(null)}
                      className={cn("text-xs font-bold px-3 py-1.5 rounded-lg border transition", isLight ? "bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-300" : "bg-gray-800 hover:bg-gray-700 text-white border-gray-700")}
                    >
                      Back
                    </button>
                  )}
                  <button
                    onClick={() => { setKotsModalOpen(false); setSelectedKot(null); }}
                    className={cn("text-xs font-bold px-3 py-1.5 rounded-lg border transition", isLight ? "bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-300" : "bg-gray-700 hover:bg-gray-600 text-white border-gray-600")}
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="mt-4 max-h-[60vh] overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                {selectedKot ? (
                  <div key={selectedKot.id} className="space-y-3">
                    <div className={cn("flex items-center justify-between p-3 rounded-xl border", isLight ? "bg-slate-50 border-slate-200" : "bg-[#0f1014] border-gray-800")}>
                      <div>
                        <div className="text-[10px] text-amber-500 font-black uppercase tracking-wider">KOT Details</div>
                        <div className={cn("text-lg font-black", isLight ? "text-slate-900" : "text-white")}>#{selectedKot.kotNumber}</div>
                        <div className={cn("text-xs font-bold", isLight ? "text-slate-500" : "text-gray-400")}>Order #{selectedKot.order?.orderNumber || selectedKot.orderId}</div>
                      </div>
                      <div className="text-right">
                        <div className={cn("text-base font-black", isLight ? "text-slate-900" : "text-white")}>
                          {formatCurrency((selectedKot.items || []).reduce((s:any,it:any)=>s + Number(it.price)*Number(it.quantity), 0))}
                        </div>
                        <div className={cn("text-xs font-medium", isLight ? "text-slate-500" : "text-gray-400")}>{(selectedKot.items || []).length} items</div>
                      </div>
                    </div>
                    <div className="mt-2 space-y-2">
                      {(selectedKot.items || []).map((it:any) => {
                        const itemName = it.menuItem?.name || it.menuItemName || 'Item';
                        const initial = String(itemName).charAt(0).toUpperCase();
                        return (
                          <div key={it.id} className={cn("flex items-center gap-3 p-2.5 rounded-xl border", isLight ? "bg-white border-slate-200" : "bg-[#0f1014] border-gray-800")}>
                            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold border", isLight ? "bg-slate-100 border-slate-300 text-slate-800" : "bg-gray-800 border-gray-700 text-gray-200")}>{initial}</div>
                            <div className="flex-1 min-w-0">
                              <div className={cn("font-bold text-xs uppercase truncate", isLight ? "text-slate-900" : "text-white")}>{itemName}</div>
                              <div className={cn("text-[11px] font-medium mt-0.5", isLight ? "text-slate-500" : "text-gray-400")}>Qty: {it.quantity} · ₹{Number(it.price).toFixed(2)} each</div>
                            </div>
                            <div className={cn("font-black text-sm", isLight ? "text-slate-900" : "text-white")}>₹{(Number(it.price)*Number(it.quantity)).toFixed(2)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : kotsLoading ? (
                  <div className="text-center py-8">
                    <div className={cn("text-sm font-bold", isLight ? "text-slate-500" : "text-gray-400")}>Loading KOTs...</div>
                  </div>
                ) : kotsError ? (
                  <div className="text-center py-8">
                    <div className="text-sm font-bold text-red-500">Failed to load KOT history</div>
                  </div>
                ) : (
                  filteredVisibleKots.length === 0 ? (
                    <div className={cn("text-sm font-bold text-center py-8", isLight ? "text-slate-500" : "text-gray-400")}>
                      No held KOTs for {kotDateFilter === 'today' ? 'today' : 'yesterday'}
                    </div>
                  ) : filteredVisibleKots.map(k => (
                    <div key={k.id} className={cn("p-3 rounded-xl border flex items-center justify-between transition-colors", isLight ? "bg-slate-50 border-slate-200 hover:border-slate-300" : "bg-[#0f1014] border-gray-800/80 hover:border-gray-700")}>
                      <div>
                        <div className={cn("font-black text-sm", isLight ? "text-slate-900" : "text-white")}>KOT #{k.kotNumber}</div>
                        <div className={cn("text-xs font-medium mt-0.5", isLight ? "text-slate-500" : "text-gray-400")}>
                          Order #{k.order?.orderNumber || k.orderId} · {k.items?.length || 0} items
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className={cn("text-right font-black text-sm", isLight ? "text-slate-900" : "text-white")}>
                          ₹{((k.items || []).reduce((s:any,it:any)=>s + Number(it.price)*Number(it.quantity),0)).toFixed(2)}
                        </div>
                        <button onClick={() => setSelectedKot(k)} className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs transition shadow-sm">View</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {ordersModalOpen && (
          <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className={cn(
              "p-5 rounded-2xl w-full max-w-4xl border shadow-2xl transition-colors",
              isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#1a1c23] border-gray-800 text-white"
            )}>
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <div className="flex items-center gap-3">
                  <h3 className={cn("text-base font-black uppercase tracking-wider", isLight ? "text-slate-900" : "text-white")}>Today Orders</h3>
                  {!selectedTodayOrder && (
                    <div className="flex items-center gap-1 bg-black/20 p-1 rounded-xl border border-white/10 text-xs">
                      <button
                        onClick={() => setOrdFilterTab('all')}
                        className={cn("px-2.5 py-1 rounded-lg font-bold transition", ordFilterTab === 'all' ? "bg-purple-600 text-white shadow" : "text-gray-400 hover:text-white")}
                      >
                        All ({todayOrders.length})
                      </button>
                      <button
                        onClick={() => setOrdFilterTab('active')}
                        className={cn("px-2.5 py-1 rounded-lg font-bold transition", ordFilterTab === 'active' ? "bg-amber-600 text-white shadow" : "text-gray-400 hover:text-white")}
                      >
                        Active ({todayOrders.filter((o: any) => o.status !== 'paid' && o.status !== 'completed').length})
                      </button>
                      <button
                        onClick={() => setOrdFilterTab('closed')}
                        className={cn("px-2.5 py-1 rounded-lg font-bold transition", ordFilterTab === 'closed' ? "bg-emerald-600 text-white shadow" : "text-gray-400 hover:text-white")}
                      >
                        Paid / Stored ({todayOrders.filter((o: any) => o.status === 'paid' || o.status === 'completed').length})
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {selectedTodayOrder && (
                    <button onClick={() => setSelectedTodayOrder(null)} className={cn("text-xs font-bold px-3 py-1.5 rounded-lg border transition", isLight ? "bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-300" : "bg-gray-800 hover:bg-gray-700 text-white border-gray-700")}>Back</button>
                  )}
                  <button onClick={() => { setOrdersModalOpen(false); setSelectedTodayOrder(null); }} className={cn("text-xs font-bold px-3 py-1.5 rounded-lg border transition", isLight ? "bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-300" : "bg-gray-700 hover:bg-gray-600 text-white border-gray-600")}>Close</button>
                </div>
              </div>

              <div className="mt-4 max-h-[65vh] overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                {selectedTodayOrder ? (
                  <div className="space-y-3">
                    <div className={cn("flex items-center justify-between border rounded-xl p-3", isLight ? "bg-slate-50 border-slate-200" : "bg-[#0f1014] border-gray-800")}>
                      <div>
                        <div className="text-xs text-indigo-500 font-black uppercase tracking-wider">TOKEN</div>
                        <div className={cn("text-lg font-black", isLight ? "text-slate-900" : "text-white")}>#{selectedTodayOrder.tokenNumber}</div>
                        <div className={cn("text-xs font-medium", isLight ? "text-slate-500" : "text-gray-400")}>{selectedTodayOrder.customerName || 'Walk-in'}{selectedTodayOrder.customerPhone ? ` · ${selectedTodayOrder.customerPhone}` : ''}</div>
                      </div>
                      <div className="text-right">
                        <div className={cn("text-sm font-black", isLight ? "text-slate-900" : "text-white")}>{formatCurrency(Number(selectedTodayOrder.total || 0))}</div>
                        <div className={cn("text-xs font-bold uppercase", (selectedTodayOrder.status === 'paid' || selectedTodayOrder.status === 'completed') ? "text-emerald-500" : "text-amber-500")}>
                          {selectedTodayOrder.status === 'paid' || selectedTodayOrder.status === 'completed' ? '✓ PAID / STORED' : String(selectedTodayOrder.status || 'open').replace('_', ' ')}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {(selectedTodayOrder.items || []).length === 0 ? (
                        <div className={cn("text-sm font-bold text-center py-6", isLight ? "text-slate-500" : "text-gray-400")}>No items</div>
                      ) : (
                        (selectedTodayOrder.items || []).map((it: any) => (
                          <div key={it.id} className={cn("flex items-center justify-between p-3 rounded-xl border", isLight ? "bg-white border-slate-200" : "bg-[#0f1014] border-gray-800")}>
                            <div>
                              <div className={cn("font-bold text-xs uppercase", isLight ? "text-slate-900" : "text-white")}>{it.menuItemName || 'Item'}</div>
                              <div className={cn("text-xs font-medium mt-0.5", isLight ? "text-slate-500" : "text-gray-400")}>Qty: {Number(it.quantity || 0)} · Rate: {formatCurrency(Number(it.price || 0))}</div>
                            </div>
                            <div className={cn("font-black text-sm", isLight ? "text-slate-900" : "text-white")}>{formatCurrency(Number(it.total || 0))}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : todayOrdersLoading ? (
                  <div className={cn("text-center py-8 text-sm font-bold", isLight ? "text-slate-500" : "text-gray-400")}>Loading orders...</div>
                ) : todayOrders.length === 0 ? (
                  <div className={cn("text-center py-8 text-sm font-bold", isLight ? "text-slate-500" : "text-gray-400")}>No orders for today</div>
                ) : (() => {
                  const filtered = todayOrders.filter((ord: any) => {
                    const isPaid = ord.status === 'paid' || ord.status === 'completed';
                    if (ordFilterTab === 'active') return !isPaid;
                    if (ordFilterTab === 'closed') return isPaid;
                    return true;
                  });

                  if (filtered.length === 0) {
                    return <div className={cn("text-center py-8 text-sm font-bold", isLight ? "text-slate-500" : "text-gray-400")}>No {ordFilterTab} orders found</div>;
                  }

                  return filtered.map((ord: any) => {
                    const isPaid = ord.status === 'paid' || ord.status === 'completed';
                    return (
                      <div key={ord.id} className={cn("p-3 border rounded-xl flex items-center justify-between transition-colors", isLight ? "bg-slate-50 border-slate-200 hover:border-slate-300" : "bg-[#0f1014] border-gray-800 hover:border-gray-700")}>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={cn("font-black text-sm", isLight ? "text-slate-900" : "text-white")}>Token #{ord.tokenNumber}</span>
                            {isPaid && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">✓ PAID</span>
                            )}
                          </div>
                          <div className={cn("text-xs font-medium mt-0.5", isLight ? "text-slate-500" : "text-gray-400")}>{ord.customerName || 'Walk-in'} · {(ord.items || []).length} items</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className={cn("font-black text-sm", isLight ? "text-slate-900" : "text-white")}>{formatCurrency(Number(ord.total || 0))}</div>
                            <div className={cn("text-xs font-bold uppercase", isPaid ? "text-emerald-500" : "text-amber-500")}>
                              {isPaid ? 'Paid' : String(ord.status || 'open').replace('_', ' ')}
                            </div>
                          </div>
                          <button onClick={() => setSelectedTodayOrder(ord)} className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-3.5 py-1 rounded-lg text-xs transition shadow-sm">View</button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        )}

        {totalAModalOpen && (
          <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className={cn(
              "p-5 rounded-2xl w-full max-w-2xl border shadow-2xl transition-colors",
              isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#1a1c23] border-gray-800 text-white"
            )}>
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <h3 className={cn("text-base font-black uppercase tracking-wider", isLight ? "text-slate-900" : "text-white")}>Today Collection / Expense (Total A)</h3>
                <button onClick={() => setTotalAModalOpen(false)} className={cn("text-xs font-bold px-3 py-1.5 rounded-lg border transition", isLight ? "bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-300" : "bg-gray-700 hover:bg-gray-600 text-white border-gray-600")}>Close</button>
              </div>

              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className={cn("border rounded-xl p-3", isLight ? "bg-slate-50 border-slate-200" : "bg-[#0f1014] border-gray-800")}>
                    <div className={cn("text-xs font-bold uppercase", isLight ? "text-slate-500" : "text-gray-400")}>Orders</div>
                    <div className={cn("text-lg font-black", isLight ? "text-slate-900" : "text-white")}>{todayOrdersCount}</div>
                  </div>
                  <div className={cn("border rounded-xl p-3", isLight ? "bg-slate-50 border-slate-200" : "bg-[#0f1014] border-gray-800")}>
                    <div className={cn("text-xs font-bold uppercase", isLight ? "text-slate-500" : "text-gray-400")}>Total A</div>
                    <div className="text-lg font-black text-emerald-600">{formatCurrency(todayCollectionAmount)}</div>
                  </div>
                  <div className={cn("border rounded-xl p-3", isLight ? "bg-slate-50 border-slate-200" : "bg-[#0f1014] border-gray-800")}>
                    <div className={cn("text-xs font-bold uppercase", isLight ? "text-slate-500" : "text-gray-400")}>Net (A - Exp)</div>
                    <div className={cn("text-lg font-black", isLight ? "text-amber-600" : "text-yellow-300")}>{formatCurrency(todayNetAfterExpense)}</div>
                  </div>
                </div>

                <div className={cn("border rounded-xl p-3 space-y-2", isLight ? "bg-slate-50 border-slate-200" : "bg-[#0f1014] border-gray-800")}>
                  <div className={cn("text-xs font-bold uppercase", isLight ? "text-slate-700" : "text-gray-300")}>Add Expense</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <input
                      value={expenseTitle}
                      onChange={(e) => setExpenseTitle(e.target.value)}
                      placeholder="Expense name"
                      className={cn("border rounded px-3 py-2 text-sm outline-none font-medium", isLight ? "bg-white border-slate-300 text-slate-900 focus:border-purple-600" : "bg-[#1a1c23] border-gray-700 text-white focus:border-purple-500")}
                    />
                    <input
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                      placeholder="Amount"
                      type="number"
                      min="0"
                      step="0.01"
                      className={cn("border rounded px-3 py-2 text-sm outline-none font-medium", isLight ? "bg-white border-slate-300 text-slate-900 focus:border-purple-600" : "bg-[#1a1c23] border-gray-700 text-white focus:border-purple-500")}
                    />
                    <select
                      value={expenseCategoryId ?? ''}
                      onChange={(e) => setExpenseCategoryId(e.target.value ? Number(e.target.value) : null)}
                      className={cn("border rounded px-3 py-2 text-sm outline-none font-medium", isLight ? "bg-white border-slate-300 text-slate-900 focus:border-purple-600" : "bg-[#1a1c23] border-gray-700 text-white focus:border-purple-500")}
                    >
                      <option value="">Select category</option>
                      {expenseCategories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => addExpenseMut.mutate()}
                      disabled={addExpenseMut.isPending}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 rounded text-sm font-bold text-white shadow-sm"
                    >
                      {addExpenseMut.isPending ? 'Adding...' : 'Expense'}
                    </button>
                  </div>
                </div>

                <div className={cn("border rounded-xl p-3", isLight ? "bg-slate-50 border-slate-200" : "bg-[#0f1014] border-gray-800")}>
                  <div className="flex items-center justify-between mb-2">
                    <div className={cn("text-xs font-bold uppercase", isLight ? "text-slate-700" : "text-gray-300")}>Session Expenses</div>
                    <div className={cn("text-xs font-bold", isLight ? "text-rose-600" : "text-rose-300")}>Total: {formatCurrency(sessionExpenseTotal)}</div>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto space-y-2 custom-scrollbar">
                    {sessionExpenses.length === 0 ? (
                      <div className={cn("text-xs font-medium", isLight ? "text-slate-500" : "text-gray-500")}>No expense added in this session.</div>
                    ) : (
                      sessionExpenses.map((exp) => (
                        <div key={exp.id} className={cn("flex items-center justify-between rounded px-3 py-2 border", isLight ? "bg-white border-slate-200" : "bg-[#1a1c23] border-gray-800")}>
                          <div>
                            <div className={cn("text-sm font-bold", isLight ? "text-slate-900" : "text-white")}>{exp.title}</div>
                            <div className={cn("text-xs font-medium", isLight ? "text-slate-500" : "text-gray-400")}>{exp.categoryName || 'Category'} · {new Date(exp.createdAt).toLocaleTimeString('en-IN')}</div>
                          </div>
                          <div className={cn("text-sm font-black", isLight ? "text-rose-600" : "text-rose-300")}>- {formatCurrency(exp.amount)}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
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
                  returnedBy: authToken?.substring(0, 20) || 'POS User',
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

        {/* LEFT: Menu Grid */}
        <div className={cn("flex-[2.7] min-w-0 flex flex-col min-h-0 rounded-xl transition-colors duration-200", isLight ? "bg-slate-100" : "bg-[#0f1014]")}>
          <div className="mb-3 space-y-2.5">
            <div className="flex gap-2.5 min-w-0">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={handleSearchKeyDown}
                  placeholder="Search menu items or scan barcode..."
                  className={cn(
                    "w-full rounded-md py-2 pl-10 pr-4 text-[12px] outline-none transition-all",
                    isLight
                      ? "bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-purple-600 shadow-sm"
                      : "bg-[#1a1c23] border border-gray-800 text-white placeholder-gray-500 focus:border-purple-500/50"
                  )} />
              </div>
              <button onClick={() => { setSearch(''); setActiveCategory('all'); }}
                className="bg-purple-600 hover:bg-purple-500 text-white px-4 rounded-md text-[11px] font-bold flex items-center gap-2 transition-colors shadow-sm">
                <RotateCcw className="w-3.5 h-3.5" /> Reset
              </button>
            </div>
            <div className="flex w-full max-w-full min-w-0 items-center gap-1.5 overflow-x-auto pb-1 pt-1 snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {(() => {
                const denseCategories = categories.length > 20;
                const chipClass = denseCategories
                  ? 'shrink-0 whitespace-nowrap rounded-md border px-2 py-1 text-[8px] font-bold uppercase tracking-wider transition-all snap-start leading-none'
                  : 'shrink-0 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wider transition-all snap-start leading-none';
                return (
                  <>
              <button
                onClick={() => setActiveCategory('all')}
                className={cn(
                  chipClass,
                  activeCategory === 'all'
                    ? (isLight ? 'bg-purple-600 border-purple-600 text-white font-black shadow-sm' : 'bg-purple-500/20 border-purple-500 text-purple-300 font-black')
                    : (isLight ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-200 hover:text-slate-900 shadow-sm' : 'bg-[#1a1c23] border-gray-800 text-gray-400 hover:bg-gray-800')
                )}
              >
                All Items
              </button>
              {categories.map((cat: any) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id.toString())}
                  className={cn(
                    chipClass,
                    activeCategory === cat.id.toString()
                      ? (isLight ? 'bg-purple-600 border-purple-600 text-white font-black shadow-sm' : 'bg-purple-500/20 border-purple-500 text-purple-300 font-black')
                      : (isLight ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-200 hover:text-slate-900 shadow-sm' : 'bg-[#1a1c23] border-gray-800 text-gray-400 hover:bg-gray-800')
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

          <div className="flex-1 overflow-y-auto custom-scrollbar pb-4 rounded-md pr-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5">
              {filteredItems.map(item => (
                <TouchMenuItemCard
                  key={item.id}
                  item={item}
                  isLight={isLight}
                  isDisabled={currentToken?.status === 'paid'}
                  onTap={(it) => handleAddToCart(it)}
                  onLongPress={(it) => setOptionsModalTarget({ item: it })}
                />
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: Cart & Payment */}
        <div className={cn(
          "flex-[1] min-w-0 sm:min-w-[320px] rounded-xl border flex flex-col relative overflow-hidden transition-colors duration-200",
          isLight ? "bg-white border-slate-200 text-slate-900 shadow-xl" : "bg-[#1a1c23] border-gray-800 text-white shadow-2xl"
        )}>

          {/* Bill Navigation & Token Lookup */}
          <div className={cn("p-3 border-b space-y-2.5 transition-colors duration-200", isLight ? "bg-slate-50 border-slate-200" : "bg-[#16181e] border-gray-800")}>
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
                  {browsingOrderIndex !== null && todayOrders[browsingOrderIndex] ? (
                    <span className="truncate">
                      Bill #{todayOrders[browsingOrderIndex].tokenNumber || todayOrders[browsingOrderIndex].orderNumber || todayOrders[browsingOrderIndex].id}
                    </span>
                  ) : (
                    <span>Bill #${(todayOrders?.length || 0) + 1}</span>
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
                {currentToken && (
                  <button onClick={clearToken} className="text-[9px] bg-red-500/10 text-red-400 hover:bg-red-500/20 px-2 py-1 rounded-lg transition font-bold">Clear Token</button>
                )}
              </div>
            </div>

            {browsingOrderIndex !== null && todayOrders[browsingOrderIndex] && (
              <div className={cn("p-2.5 rounded-xl border flex items-center justify-between transition-all", isLight ? "bg-amber-50 border-amber-300 text-amber-900" : "bg-amber-500/10 border-amber-500/30 text-amber-300")}>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider">Browsing Past Order</div>
                  <div className="text-xs font-bold">
                    Bill #{todayOrders[browsingOrderIndex].tokenNumber || todayOrders[browsingOrderIndex].orderNumber} · {formatCurrency(Number(todayOrders[browsingOrderIndex].total || 0))}
                  </div>
                </div>
                <button
                  onClick={() => setBrowsingOrderIndex(null)}
                  className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-[10px] font-bold transition shadow-sm"
                >
                  Return to Current Bill
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <input type="text" value={lookupInput} onChange={(e) => setLookupInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lookupToken(); } }}
                placeholder="Scan QR or Enter #"
                className={cn(
                  "flex-1 rounded-md py-2 pl-3 pr-4 text-[12px] font-black outline-none transition-all",
                  isLight ? "bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-purple-600" : "bg-[#0f1014] border border-gray-800 text-white placeholder-gray-600 focus:border-purple-500"
                )} />
              <button onClick={lookupToken} className="bg-purple-600 hover:bg-purple-500 text-white px-4 rounded-md font-bold text-[11px] transition">Find</button>
            </div>
            {currentToken && (
              <div className={cn("p-2.5 border rounded-md flex flex-col gap-1.5 relative overflow-hidden", isLight ? "bg-slate-100 border-slate-300 text-slate-900" : "bg-[#0f1014] border-gray-800 text-white")}>
                <div className="absolute top-0 right-0 p-1.5 opacity-10"><Tag className="w-16 h-16" /></div>
                <div className="flex justify-between items-center relative z-10">
                  <span className={cn("text-[13px] font-black", isLight ? "text-slate-900" : "text-white")}>Token #{currentToken.tokenNumber}</span>
                  <span className={cn("text-[9px] uppercase font-bold px-2 py-0.5 rounded",
                    currentToken?.status === 'paid' ? 'bg-green-500/20 text-green-700' :
                      currentToken?.status === 'partial_paid' ? 'bg-yellow-500/20 text-yellow-700' :
                        'bg-blue-500/20 text-blue-700')}>
                    {currentToken?.status?.replace('_', ' ') ?? 'unknown'}
                  </span>
                </div>
                {currentToken.customerName && (
                  <div className={cn("text-xs font-medium relative z-10", isLight ? "text-slate-600" : "text-gray-400")}>{currentToken.customerName} {currentToken.customerPhone ? `(${currentToken.customerPhone})` : ''}</div>
                )}
              </div>
            )}
          </div>

          {/* Cart Items */}
          <div ref={cartScrollRef} className="flex-1 overflow-y-auto p-2.5 custom-scrollbar flex flex-col gap-2 relative">
            {browsingOrderIndex !== null && todayOrders[browsingOrderIndex] ? (
              <div className="space-y-2">
                <div className={cn("p-2.5 rounded-lg border flex items-center justify-between text-xs font-bold shadow-sm", isLight ? "bg-amber-100 border-amber-300 text-amber-900" : "bg-amber-500/20 border-amber-500/40 text-amber-300")}>
                  <span>Past Bill #{todayOrders[browsingOrderIndex].tokenNumber || todayOrders[browsingOrderIndex].id} Items ({todayOrders[browsingOrderIndex].items?.length || 0})</span>
                </div>
                {(!todayOrders[browsingOrderIndex].items || todayOrders[browsingOrderIndex].items.length === 0) ? (
                  <div className="text-center py-8 opacity-50 text-xs font-bold">No items found in this past bill</div>
                ) : (
                  <div className="space-y-1.5">
                    {todayOrders[browsingOrderIndex].items.map((item: any, idx: number) => {
                      const itemName = item.menuItemName || item.name || 'Item';
                      const mi = allItems.find(ai => ai.id === item.menuItemId || ai.name === itemName);
                      const imgSrc = resolveImageUrl(item.menuItem?.image || item.image || mi?.image) || `https://ui-avatars.com/api/?name=${encodeURIComponent(itemName)}&background=1a1c23&color=fff`;

                      return (
                        <div key={`past-item-${idx}`} className={cn("flex gap-2.5 border p-2 rounded items-center", isLight ? "bg-slate-50 border-slate-200 hover:border-slate-300" : "bg-[#0f1014] border-gray-800 hover:border-gray-700")}>
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
                {/* Saved token items */}
                {activeTokenItems.length > 0 && (
                  <div className="mb-2">
                    <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2 px-1 flex justify-between">
                      <span>Saved Items</span><span className="text-blue-500 font-black">(Sync'd)</span>
                    </div>
                    <div className="space-y-1.5">
                      {activeTokenItems.map((item) => (
                        <div key={`exist-${item.id}`} className={cn("flex gap-2.5 border p-2 rounded transition items-center", isLight ? "bg-slate-50 border-slate-200 hover:border-slate-300" : "bg-[#0f1014] border-gray-800/60 hover:border-gray-700")}>
                          <img src={resolveImageUrl(item.menuItem?.image) || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.menuItemName)}&background=1a1c23&color=fff`}
                            alt={item.menuItemName} className="w-10 h-10 rounded-md object-cover flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <h4 className={cn("text-[11px] font-bold uppercase truncate leading-tight", isLight ? "text-slate-900" : "text-white")}>{item.menuItemName}</h4>
                            <div className={cn("text-[10px] font-bold mt-1", isLight ? "text-slate-500" : "text-gray-500")}>
                              ₹{Number(item.price).toFixed(2)} × {formatQtyDisplay(Number(item.quantity || 0), item.menuItem?.salesUnit)} = {formatCurrency(item.total)}
                            </div>
                          </div>
                          {currentToken?.status !== 'paid' && (
                            <div className="flex flex-col gap-1">
                              <button onClick={() => setEditModal({ itemId: item.id, name: item.menuItemName, qty: item.quantity })}
                                className={cn("p-1.5 rounded transition", isLight ? "bg-slate-200 hover:bg-slate-300 text-slate-700" : "bg-gray-800 hover:bg-gray-700 text-gray-400")}><Edit size={12} /></button>
                              <button onClick={() => setDeleteModal({ itemId: item.id, name: item.menuItemName })}
                                className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded transition"><Trash2 size={12} /></button>
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
                      <div key={`rem-${item.id}`} className={cn("flex justify-between items-center p-2 rounded text-[10px] line-through", isLight ? "bg-slate-100 text-slate-500" : "bg-[#0f1014] text-gray-500")}>
                        <span>{item.menuItemName} × {item.quantity}</span>
                        <span className="italic">{item.removeReason}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* New (unsaved) local cart items */}
                {localCart.length > 0 && (
                  <div className="mb-2">
                    <div className={cn("text-[9px] font-bold uppercase tracking-widest mb-2 px-1 flex justify-between", isLight ? "text-slate-600" : "text-gray-500")}>
                      <span>New Items</span><span className="text-green-600 font-black">(Unsaved)</span>
                    </div>
                    <div className="space-y-1.5">
                      {localCart.map((item) => {
                        const mi = allItems.find(ai => ai.id === item.menuItemId);
                        const allMRPs = item.inventoryMRPs ?? mi?.inventoryItem?.inventoryMRPs ?? [];
                        const activeMRPs = getActiveMRPs(allMRPs);
                        const selectedMRP = activeMRPs.find(m => m.id === item.inventoryItemMRPId) ?? activeMRPs[0] ?? null;
                        const label = item.displayName || item.name;
                        const imgSrc = resolveImageUrl(mi?.image ?? null) || `https://ui-avatars.com/api/?name=${encodeURIComponent(label)}&background=1a1c23&color=fff`;
                          return (
                            <div id={`local-${item.id}`} key={item.id} className={cn(
                              "flex gap-2.5 p-2 rounded relative overflow-hidden group items-start border transition-all",
                              isLight ? "bg-purple-50/70 border-purple-200 text-slate-900 shadow-sm" : "bg-purple-500/5 border-purple-500/20 text-white"
                            )}>
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-purple-600" />
                            <img src={imgSrc} alt={label} className="w-10 h-10 rounded-md object-cover flex-shrink-0 ml-2 mt-0.5" />
                            <div className="flex-1 min-w-0 pl-1">
                              <h4 className={cn("text-[11px] font-bold uppercase truncate leading-tight mb-1", isLight ? "text-slate-900" : "text-white")}>{label}</h4>
                              {item.modifiers && item.modifiers.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-0.5 mb-1.5">
                                  {item.modifiers.map((m, i) => (
                                    <span key={i} className={cn("text-[8px] border rounded px-1 py-0.5 font-bold uppercase", isLight ? "bg-purple-100 border-purple-300 text-purple-800" : "bg-purple-500/15 border-purple-500/30 text-purple-300")}>
                                      +{m.name} (+₹{Number(m.price).toFixed(2)})
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* ── MRP selector ── */}
                              {activeMRPs.length > 1 ? (
                                <div className="space-y-1">
                                  <select
                                    value={String(item.inventoryItemMRPId ?? (selectedMRP?.id ?? ''))}
                                    onChange={(e) => {
                                      const mrp = activeMRPs.find(m => m.id === Number(e.target.value));
                                      if (mrp) changeLocalItemMRP(item.id, mrp);
                                    }}
                                    className={cn("w-full border text-[11px] rounded-lg px-2 py-1.5 focus:outline-none", isLight ? "bg-white border-slate-300 text-slate-900 focus:border-purple-600" : "bg-[#0f1014] border-gray-700 text-white focus:border-purple-500")}
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
                                    <div className={cn("text-[9px] px-1", isLight ? "text-slate-600" : "text-gray-500")}>
                                      Selling: <span className="text-green-600 font-bold">₹{getMRPSellingPrice(selectedMRP).toFixed(2)}</span>
                                      {' · '}Cost: ₹{Number(selectedMRP.purchaseRate).toFixed(2)}
                                      {' · '}Profit: {Number(selectedMRP.profitPercent ?? 0).toFixed(1)}%
                                      {selectedMRP.createdAt ? ` · ${new Date(selectedMRP.createdAt).toLocaleDateString()}` : ''}
                                    </div>
                                  )}
                                </div>
                              ) : activeMRPs.length === 1 ? (
                                <div className={cn("text-[10px] space-y-0.5", isLight ? "text-slate-600" : "text-gray-400")}>
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
                                <button onClick={() => updateLocalQty(item.id, -1)} className={cn("w-6 h-6 rounded-md flex items-center justify-center transition active:scale-95 text-xs font-bold", isLight ? "bg-slate-200 hover:bg-slate-300 text-slate-800" : "bg-gray-800 hover:bg-gray-700 text-gray-300")}>-</button>
                                <button
                                  onClick={() => setQtyEditor({ id: item.id, value: String(item.quantity) })}
                                  className={cn("font-black text-[10px] w-[64px] text-center truncate transition", isLight ? "text-slate-900 hover:text-purple-700" : "text-white hover:text-purple-300")}
                                  title="Edit quantity"
                                >
                                  {formatQtyDisplay(item.quantity, item.salesUnit)}
                                </button>
                                <button onClick={() => updateLocalQty(item.id, 1)} className={cn("w-6 h-6 rounded-md flex items-center justify-center transition active:scale-95 text-xs font-bold", isLight ? "bg-slate-200 hover:bg-slate-300 text-slate-800" : "bg-gray-800 hover:bg-gray-700 text-gray-300")}>+</button>
                              </div>
                              <div className={cn("text-xs font-black", isLight ? "text-slate-900" : "text-white")}>{formatCurrency(item.price * item.quantity)}</div>
                              <div className="flex items-center gap-2">
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

          {/* Summary & Payment */}
          <div className={cn("border-t transition-colors duration-200", isLight ? "bg-slate-50 border-slate-200 text-slate-900" : "bg-[#0f1014] border-gray-800 text-white")}>
            {browsingOrderIndex !== null && todayOrders[browsingOrderIndex] ? (
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Bill #{todayOrders[browsingOrderIndex].tokenNumber || todayOrders[browsingOrderIndex].id} Total</span>
                  <span className="text-xl font-black text-purple-600">{formatCurrency(todayOrders[browsingOrderIndex].total || 0)}</span>
                </div>
                <div className={cn("flex justify-between items-center text-xs font-semibold p-2.5 rounded-lg border", isLight ? "bg-white border-slate-200 text-slate-700" : "bg-[#16181e] border-gray-800 text-gray-300")}>
                  <span>Status: <strong className="uppercase text-green-600">{todayOrders[browsingOrderIndex].status || 'paid'}</strong></span>
                  {todayOrders[browsingOrderIndex].customerName && (
                    <span>Customer: <strong>{todayOrders[browsingOrderIndex].customerName}</strong></span>
                  )}
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => printFinalBill(todayOrders[browsingOrderIndex], user?.restaurant?.name || 'SMARTGONEXT Bakery', billSettings)}
                    className={cn("flex-1 py-2.5 border rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition uppercase", isLight ? "bg-white border-slate-300 text-slate-800 hover:bg-slate-100" : "bg-gray-800 border-gray-700 text-white hover:bg-gray-700")}
                  >
                    <Printer className="w-4 h-4" /> Reprint
                  </button>
                  <button
                    onClick={() => setBrowsingOrderIndex(null)}
                    className="flex-[2] py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-lg font-black text-xs shadow-lg tracking-wide uppercase transition active:scale-[0.98] flex items-center justify-center gap-1.5"
                  >
                    Return to Current Bill
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Customer fields */}
                {(!currentToken || currentToken?.status !== 'paid') && (
                  <div className={cn("p-2.5 border-b flex gap-2 relative", isLight ? "border-slate-200" : "border-gray-800/50")}>
                    <div className="relative flex-1">
                      <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Cust Name * (Required)"
                        className={cn("w-full px-3 py-1.5 border-2 rounded-md text-[11px] font-bold focus:outline-none transition shadow-sm", isLight ? "bg-slate-900 border-purple-600 text-white placeholder-slate-400 focus:ring-2 focus:ring-purple-400" : "bg-slate-100 border-purple-500 text-slate-950 placeholder-slate-500 focus:ring-2 focus:ring-purple-400")} />
                    </div>
                    <div className="relative flex-1">
                      <input type="tel" value={customerPhone} onFocus={() => setShowCustomerDropdown(true)}
                        onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                        onChange={(e) => { setCustomerPhone(e.target.value); setShowCustomerDropdown(true); }}
                        placeholder="Phone (Opt)"
                        className={cn("w-full px-3 py-1.5 border-2 rounded-md text-[11px] font-bold focus:outline-none transition shadow-sm", isLight ? "bg-slate-900 border-purple-600 text-white placeholder-slate-400 focus:ring-2 focus:ring-purple-400" : "bg-slate-100 border-purple-500 text-slate-950 placeholder-slate-500 focus:ring-2 focus:ring-purple-400")} />
                      {matchedCustomer && (
                        <div className="mt-1 text-[10px] font-semibold text-green-600">
                          Available points: {Number(matchedCustomer.loyaltyPoints || 0)} pts
                        </div>
                      )}
                      {showCustomerDropdown && customerSuggestions.length > 0 && (
                        <div className={cn("absolute bottom-full mb-1 right-0 w-64 border rounded-xl z-50 shadow-2xl overflow-hidden", isLight ? "bg-white border-slate-300" : "bg-[#1a1c23] border-gray-800")}>
                          {customerSuggestions.map((c: any) => (
                            <button key={c.id} onMouseDown={(e) => { e.preventDefault(); setCustomerPhone(c.phone || ''); setCustomerName(c.name || ''); setShowCustomerDropdown(false); }}
                              className={cn("w-full text-left px-4 py-3 flex justify-between items-center transition-colors border-b last:border-0", isLight ? "hover:bg-slate-100 border-slate-200" : "hover:bg-gray-800 border-gray-800/50")}>
                              <div>
                                <div className={cn("text-sm font-bold", isLight ? "text-slate-900" : "text-white")}>{c.name || 'Unknown'}</div>
                                <div className={cn("text-xs font-medium", isLight ? "text-slate-500" : "text-gray-400")}>{c.phone}</div>
                              </div>
                              {c.loyaltyPoints > 0 && <div className="text-[10px] font-bold bg-[#7c5cfc]/20 text-[#7c5cfc] px-2 py-1 rounded">{c.loyaltyPoints} pts</div>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {currentToken && (customerPhone || customerName) && (currentToken.customerPhone !== customerPhone || currentToken.customerName !== customerName) && (
                      <button onClick={() => assignCustomerMut.mutate({ name: customerName, phone: customerPhone })} disabled={assignCustomerMut.isPending}
                        className="px-3 bg-[#7c5cfc] hover:bg-[#6b4ce6] text-white rounded-md text-[10px] font-bold uppercase transition disabled:opacity-50">Save</button>
                    )}
                  </div>
                )}

                {/* Totals */}
                <div className={cn("p-3 space-y-2 border-b text-[10px] font-bold", isLight ? "border-slate-200 text-slate-700" : "border-gray-800/50 text-gray-400")}>
                  {currentToken && <div className="flex justify-between"><span>Existing Subtotal</span><span>₹{Number(currentToken.subtotal).toFixed(2)}</span></div>}
                  {localCartSubtotal > 0 && <div className={cn("flex justify-between", isLight ? "text-slate-800" : "text-gray-300")}><span>New Items Subtotal</span><span>{formatCurrency(localCartSubtotal)}</span></div>}
                  {localCartTax > 0 && <div className={cn("flex justify-between", isLight ? "text-slate-800" : "text-gray-300")}><span>New Items GST/TAX</span><span>{formatCurrency(localCartTax)}</span></div>}
                  {Number(currentToken?.discountApplied) > 0 && <div className="flex justify-between text-green-600"><span>🏆 Loyalty Discount</span><span>-₹{Number(currentToken!.discountApplied).toFixed(2)}</span></div>}
                  <div className={cn("flex justify-between items-center text-base font-black pt-2 border-t mt-2", isLight ? "text-slate-900 border-slate-300" : "text-white border-gray-800")}>
                    <span>TOTAL TO PAY</span>
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
                        title="Click to edit TOTAL TO PAY amount for this bill"
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

                {/* Loyalty */}
                {currentToken?.customer && currentToken?.status !== 'paid' && (
                  <div className="px-3 pt-2.5">
                    <button onClick={() => setLoyaltyModal(true)}
                      className="w-full py-1.5 bg-gray-900 border border-green-500/30 text-green-400 hover:bg-green-500/10 rounded-md text-[10px] uppercase tracking-wider font-bold transition flex items-center justify-center gap-2">
                      <Tag className="w-3 h-3" /> Claim Points ({currentToken.customer.loyaltyPoints} available)
                    </button>
                  </div>
                )}

                {/* Save */}
                {localCart.length > 0 && (
                  <div className="p-2.5 border-b border-gray-800/50">
                    <button onClick={saveToken} disabled={isSubmitting || currentToken?.status === 'paid'}
                      className="w-full py-1.5 bg-[#7c5cfc] hover:bg-[#6b4ce6] text-white rounded-md text-[10px] font-bold uppercase transition disabled:opacity-50">
                      {currentToken ? 'Save Items to Token' : 'Save as Token'}
                    </button>
                  </div>
                )}

                {/* Payment buttons */}
                <div className="p-2.5">
                  {currentToken?.status === 'paid' && localCart.length === 0 ? (
                    <div className="space-y-2">
                      <div className="w-full py-2.5 bg-green-500/10 border border-green-500/20 text-green-400 rounded-md font-bold uppercase tracking-widest text-center text-[10px] flex items-center justify-center gap-2">
                        <CheckCircle size={14} /> Paid Successfully
                      </div>
                      <button onClick={() => printFinalBill(currentToken, user?.restaurant?.name || 'SMARTGONEXT Bakery', billSettings)}
                        className="w-full py-2.5 bg-[#1a1c23] border border-gray-700 hover:bg-gray-800 text-white rounded-md font-bold text-[10px] flex items-center justify-center gap-2 uppercase tracking-wider transition">
                        <Printer className="w-4 h-4" /> REPRINT BILL
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-4 gap-1.5">
                        <button onClick={() => processPayment('cash')} disabled={isSubmitting || isCartEmpty}
                          className="bg-[#27ae60] hover:bg-[#2ecc71] disabled:opacity-50 disabled:grayscale text-white py-2.5 rounded text-[9px] font-black uppercase flex flex-col items-center gap-1 transition-colors">
                          <Banknote size={16} /> Cash
                        </button>
                        <button onClick={() => processPayment('card')} disabled={isSubmitting || isCartEmpty}
                          className="bg-[#8e44ad] hover:bg-[#9b59b6] disabled:opacity-50 disabled:grayscale text-white py-2.5 rounded text-[9px] font-black uppercase flex flex-col items-center gap-1 transition-colors">
                          <CreditCard size={16} /> Card
                        </button>
                        <button onClick={() => processPayment('upi')} disabled={isSubmitting || isCartEmpty}
                          className="bg-[#e67e22] hover:bg-[#f39c12] disabled:opacity-50 disabled:grayscale text-white py-2.5 rounded text-[9px] font-black uppercase flex flex-col items-center gap-1 transition-colors">
                          <Wallet size={16} /> UPI
                        </button>
                        <button onClick={() => setShowSplitModal(true)} disabled={isSubmitting || isCartEmpty}
                          className="bg-[#2980b9] hover:bg-[#3498db] disabled:opacity-50 disabled:grayscale text-white py-2.5 rounded text-[9px] font-black uppercase flex flex-col items-center gap-1 transition-colors">
                          <Split size={16} /> Split
                        </button>
                      </div>
                      {awaitingUPIPayment && pendingUpiPayment && (
                        <div className="mt-3 bg-emerald-950/60 border-2 border-emerald-500/80 p-3 rounded-xl shadow-lg shadow-emerald-500/20 text-center animate-pulse">
                          <p className="text-emerald-400 font-extrabold text-xs uppercase mb-2">Awaiting Customer GPay / UPI Scan...</p>
                          <button onClick={() => confirmUPIPayment()} disabled={isSubmitting}
                            className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white rounded-xl text-xs font-black uppercase transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer">
                            <span>✅</span> CONFIRM GPAY / UPI PAYMENT RECEIVED
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {deleteModal && (
        <PasswordModal action="delete"
          onConfirm={(password, reason) => deleteItemMut.mutate({ itemId: deleteModal.itemId, adminPassword: password, reason })}
          onCancel={() => setDeleteModal(null)} />
      )}
      {editModal && (
        <PasswordModal action="edit"
          onConfirm={(password, reason) => editItemMut.mutate({ itemId: editModal.itemId, quantity: editModal.qty, adminPassword: password, reason })}
          onCancel={() => setEditModal(null)} />
      )}
      {loyaltyModal && currentToken?.customer && (
        <LoyaltyModal customer={currentToken.customer} pointValue={Number(loyaltyConfig?.pointValue ?? 0.5)}
          onApply={(points) => loyaltyMut.mutate(points)}
          onCancel={() => setLoyaltyModal(false)} />
      )}
      {showSplitModal && (
        <SplitPaymentModal
          totalAmount={displayTotal}
          restaurantId={activeRestaurantId}
          socket={socket}
          onCancel={() => setShowSplitModal(false)}
          onConfirm={async (m1, a1, m2, a2) => {
            setShowSplitModal(false);
            await processSplitPayment(m1, a1, m2, a2);
          }}
        />
      )}

      {packPickerItem && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[150]" onClick={() => setPackPickerItem(null)}>
          <div className="bg-[#1a1c23] rounded-xl border border-gray-800 p-4 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="text-white font-black text-sm uppercase tracking-wide mb-3">Select Pack</div>
            <div className="text-gray-400 text-xs mb-3">{packPickerItem.name}</div>
            <div className="space-y-2">
              {(getPackOptions(packPickerItem)).map((pack, idx) => (
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
                      salesUnit: (pack.unitLabel || packPickerItem.salesUnit || null),
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
                    if (parsed == null) {
                      toast.error('Enter a valid quantity');
                      return;
                    }
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
                    if (parsed == null) {
                      toast.error('Enter a valid quantity');
                      return;
                    }
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

      {/* Payment success overlay */}
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

      {/* ── Modifiers Selection Modal ── */}
      {activeModifierItem && (
        <div className="fixed inset-0 bg-[#0f1014]/90 backdrop-blur-sm flex items-center justify-center z-[210] no-print">
          <div className="bg-[#1a1c23] rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl border border-gray-800 space-y-4 text-left">
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

      {showSplitModal && (
        <SplitPaymentModal
          totalAmount={calculatedTotal}
          restaurantId={user?.restaurant?.id}
          socket={socket}
          upiVpa={billSettings?.upiVpa}
          onConfirm={(m1, a1, m2, a2) => {
            setShowSplitModal(false);
            processSplitPayment(m1, a1, m2, a2);
          }}
          onCancel={() => setShowSplitModal(false)}
        />
      )}

      <CashRegisterModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
      />

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

interface SplitPaymentModalProps {
  totalAmount: number;
  restaurantId?: number;
  socket?: any;
  upiVpa?: string;
  onConfirm: (method1: string, amount1: number, method2: string, amount2: number) => void;
  onCancel: () => void;
}

function SplitPaymentModal({ totalAmount, restaurantId, socket, upiVpa, onConfirm, onCancel }: SplitPaymentModalProps) {
  const theme = useThemeStore((s) => s.theme);
  const isLight = theme === 'light';

  const [method1, setMethod1] = useState<string>('cash');
  const [amount1, setAmount1] = useState<string>('');
  
  const [method2, setMethod2] = useState<string>('upi');
  const [amount2, setAmount2] = useState<string>('');

  const num1 = parseFloat(amount1) || 0;
  const num2 = parseFloat(amount2) || 0;
  const combinedTotal = num1 + num2;
  const changeDue = Math.max(0, combinedTotal - totalAmount);

  // Sync live split amounts and auto-trigger UPI QR with Customer Display (debounced)
  useEffect(() => {
    if (!socket || !restaurantId) return;

    socket.emit('customer_display_split_update', {
      restaurantId,
      method1,
      amount1: num1,
      method2,
      amount2: num2,
      total: totalAmount,
    });

    const upiAmount = method1 === 'upi' ? num1 : method2 === 'upi' ? num2 : 0;
    if (upiAmount > 0) {
      const timer = setTimeout(() => {
        const merchantVpa = (upiVpa || import.meta.env.VITE_UPI_MERCHANT || import.meta.env.VITE_MERCHANT_UPI || '');
        const merchantName = 'Restaurant';
        const upiUri = `upi://pay?pa=${encodeURIComponent(merchantVpa)}&pn=${encodeURIComponent(merchantName)}&am=${encodeURIComponent(String(upiAmount))}&cu=INR`;
        socket.emit('customer_display_show_qr', {
          restaurantId,
          upiUri,
          amount: upiAmount,
          merchantName,
          merchantVpa,
        });
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [method1, num1, method2, num2, totalAmount, socket, restaurantId, upiVpa]);

  const handleAmount1Change = (val: string) => {
    setAmount1(val);
    const v1 = parseFloat(val) || 0;
    if (v1 >= totalAmount) {
      setAmount2('0');
    } else {
      const rem = Math.max(0, totalAmount - v1);
      setAmount2(rem > 0 ? rem.toFixed(2) : '0');
    }
  };

  const handleAmount2Change = (val: string) => {
    setAmount2(val);
    const v2 = parseFloat(val) || 0;
    if (v2 >= totalAmount) {
      setAmount1('0');
    } else {
      const rem = Math.max(0, totalAmount - v2);
      setAmount1(rem > 0 ? rem.toFixed(2) : '0');
    }
  };

  const setHalfHalf = () => {
    const half = (totalAmount / 2).toFixed(2);
    setAmount1(half);
    setAmount2(half);
  };

  const setFullMethod1 = () => {
    setAmount1(totalAmount.toFixed(2));
    setAmount2('0');
  };

  const setFullMethod2 = () => {
    setAmount1('0');
    setAmount2(totalAmount.toFixed(2));
  };

  const hasCash = (method1 === 'cash' && num1 > 0) || (method2 === 'cash' && num2 > 0);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[200] p-4">
      <div
        className={cn(
          "rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 transition-colors border",
          isLight
            ? "bg-white border-gray-200 text-gray-900"
            : "bg-[#1a1c23] border-gray-800 text-white"
        )}
      >
        {/* Header */}
        <div className={cn("flex justify-between items-center pb-3 border-b", isLight ? "border-gray-200" : "border-gray-800")}>
          <h3 className={cn("text-sm font-black flex items-center gap-2 uppercase tracking-wide", isLight ? "text-indigo-600" : "text-indigo-400")}>
            <Split size={18} /> Split Payment
          </h3>
          <button onClick={onCancel} className={cn("text-lg font-bold hover:opacity-75", isLight ? "text-gray-500" : "text-gray-400")}>✕</button>
        </div>

        {/* Total Due Banner */}
        <div
          className={cn(
            "p-3.5 rounded-xl flex justify-between items-center text-xs font-bold border",
            isLight
              ? "bg-emerald-50/80 border-emerald-200 text-emerald-900"
              : "bg-gray-900/90 border-gray-800 text-white"
          )}
        >
          <span className={cn("uppercase tracking-wider text-[10px] font-black", isLight ? "text-emerald-700" : "text-gray-400")}>Total Order Due:</span>
          <span className="text-emerald-500 text-lg font-black font-mono">₹{totalAmount.toFixed(2)}</span>
        </div>

        {/* Quick Presets */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={setHalfHalf}
            className={cn(
              "flex-1 py-1.5 px-2 rounded-lg text-[10px] font-extrabold uppercase transition border",
              isLight ? "bg-gray-100 hover:bg-gray-200 border-gray-300 text-gray-700" : "bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-300"
            )}
          >
            50% / 50%
          </button>
          <button
            type="button"
            onClick={setFullMethod1}
            className={cn(
              "flex-1 py-1.5 px-2 rounded-lg text-[10px] font-extrabold uppercase transition border",
              isLight ? "bg-gray-100 hover:bg-gray-200 border-gray-300 text-gray-700" : "bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-300"
            )}
          >
            100% {method1.toUpperCase()}
          </button>
          <button
            type="button"
            onClick={setFullMethod2}
            className={cn(
              "flex-1 py-1.5 px-2 rounded-lg text-[10px] font-extrabold uppercase transition border",
              isLight ? "bg-gray-100 hover:bg-gray-200 border-gray-300 text-gray-700" : "bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-300"
            )}
          >
            100% {method2.toUpperCase()}
          </button>
        </div>

        {/* Inputs */}
        <div className="space-y-3.5 pt-1">
          {/* Method 1 */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className={cn("text-[11px] font-black uppercase flex items-center gap-1.5", isLight ? "text-gray-700" : "text-gray-300")}>
                Payment 1 Method
              </label>
              <select
                value={method1}
                onChange={(e) => setMethod1(e.target.value)}
                className={cn(
                  "text-xs font-black uppercase rounded p-1 border outline-hidden",
                  isLight ? "bg-white border-gray-300 text-gray-800" : "bg-gray-800 border-gray-700 text-white"
                )}
              >
                <option value="cash">Cash 💵</option>
                <option value="upi">UPI / QR 📱</option>
                <option value="card">Card 💳</option>
              </select>
            </div>
            <input
              type="number"
              step="0.01"
              value={amount1}
              onChange={(e) => handleAmount1Change(e.target.value)}
              placeholder={`Enter ${method1.toUpperCase()} Amount...`}
              className={cn(
                "w-full rounded-xl p-3 font-mono text-base font-bold transition-all border outline-hidden",
                isLight
                  ? "bg-gray-50 border-gray-300 text-gray-900 focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
                  : "bg-[#121319] border-gray-700 text-white focus:border-indigo-500"
              )}
              autoFocus
            />
          </div>

          {/* Method 2 */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className={cn("text-[11px] font-black uppercase flex items-center gap-1.5", isLight ? "text-gray-700" : "text-gray-300")}>
                Payment 2 Method
              </label>
              <select
                value={method2}
                onChange={(e) => setMethod2(e.target.value)}
                className={cn(
                  "text-xs font-black uppercase rounded p-1 border outline-hidden",
                  isLight ? "bg-white border-gray-300 text-gray-800" : "bg-gray-800 border-gray-700 text-white"
                )}
              >
                <option value="upi">UPI / QR 📱</option>
                <option value="card">Card 💳</option>
                <option value="cash">Cash 💵</option>
              </select>
            </div>
            <input
              type="number"
              step="0.01"
              value={amount2}
              onChange={(e) => handleAmount2Change(e.target.value)}
              placeholder={`Enter ${method2.toUpperCase()} Amount...`}
              className={cn(
                "w-full rounded-xl p-3 font-mono text-base font-bold transition-all border outline-hidden",
                isLight
                  ? "bg-gray-50 border-gray-300 text-gray-900 focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
                  : "bg-[#121319] border-gray-700 text-white focus:border-indigo-500"
              )}
            />
          </div>
        </div>

        {/* Change Return / Cash Drawer Indicators */}
        <div className="space-y-2">
          {changeDue > 0 && (
            <div className={cn("p-2.5 rounded-lg text-xs font-black flex items-center justify-between border", isLight ? "bg-green-100 border-green-300 text-green-800" : "bg-green-950/50 border-green-800 text-green-300")}>
              <span>💵 Cash Return Change:</span>
              <span className="text-sm font-mono font-extrabold">₹{changeDue.toFixed(2)}</span>
            </div>
          )}

          {hasCash && (
            <div className={cn("p-2 rounded-lg text-[10px] font-extrabold flex items-center gap-1.5 border", isLight ? "bg-blue-50 border-blue-200 text-blue-800" : "bg-blue-950/40 border-blue-900 text-blue-300")}>
              <span>⚡ Cash Drawer will open automatically upon payment completion.</span>
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className={cn("flex gap-3 pt-3 border-t", isLight ? "border-gray-200" : "border-gray-800")}>
          <button
            type="button"
            onClick={onCancel}
            className={cn(
              "flex-1 py-2.5 rounded-xl font-bold text-xs uppercase transition",
              isLight ? "bg-gray-200 hover:bg-gray-300 text-gray-800" : "bg-gray-800 hover:bg-gray-700 text-gray-300"
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(method1, num1, method2, num2)}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase transition shadow-lg flex items-center justify-center gap-1.5"
          >
            Pay & Print Bill
          </button>
        </div>
      </div>
    </div>
  );
}