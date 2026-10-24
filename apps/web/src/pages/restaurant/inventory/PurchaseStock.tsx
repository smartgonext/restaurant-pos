import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, Trash2, Plus, ChevronRight, Printer, History, Truck,
  ArrowRight, Filter, CheckCircle2, X, FileText, IndianRupee,
  Layers, Edit3, Download, Package, Tag, TrendingUp, Zap,
  ChevronDown, ChevronUp, AlertTriangle, RefreshCw, BoxSelect,
  BarChart3, ShoppingCart, ChevronsUpDown
} from 'lucide-react';
import api from '@/lib/api';
import { formatCurrency, resolveImageUrl, cn, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '@/hooks/useSocket';

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface InventoryUnit { id: number; name: string; symbol: string; }
interface InventoryItem {
  id: number; name: string; image?: string; categoryId?: number; unitId?: number;
  currentStock: number; thresholdQty: number; costPerUnit: number;
  unit?: InventoryUnit & { id?: number };
  category?: { id?: number; name: string };
  inventoryMRPs?: any[];
}
interface MenuPackOption {
  label?: string; quantity?: number; unitId?: number | null; unitLabel?: string;
  mrp?: number; purchaseRate?: number; profitPercent?: number; sellingPrice?: number;
  price?: number; stockWarningThreshold?: number; productQR?: string;
}
interface MenuItemLight {
  id: number; name: string; image?: string; categoryId?: number | null;
  productQR?: string; enablePackOptions?: boolean; packOptions?: MenuPackOption[];
}
interface PackVariantOption {
  key: string; menuItemId: number; menuItemName: string; inventoryName: string;
  label: string; unitId?: number | null; unitLabel?: string;
  mrp?: number; purchaseRate?: number; profitPercent?: number; sellingPrice?: number;
  stockWarningThreshold?: number; image?: string; inventoryItemId?: number;
}
type PurchaseSelectOption =
  | { kind: 'inventory'; key: string; item: InventoryItem }
  | { kind: 'pack'; key: string; variant: PackVariantOption; item?: InventoryItem };

interface Supplier {
  id: number; name: string; contactPerson?: string; phone?: string;
  outstandingBalance: number; totalOrders?: number; totalOrderAmount?: number;
}
interface PORow {
  inventoryItemId?: number; item?: InventoryItem;
  quantity: number; unitCost: number; gstPercent: number; discountPercent: number;
  tempId: string; itemMRPs?: MRP[]; selectedMRPId?: number; inventoryItemMRPId?: number;
}
interface MRP {
  id: number; inventoryItemId: number; mrp: number; purchaseRate: number;
  profitPercent: number; inventoryItem: InventoryItem;
}

// ─── UTILS ───────────────────────────────────────────────────────────────────

const indianFormat = (amount: number | string) => {
  const num = Number(amount);
  return isNaN(num) ? '₹0.00' : num.toLocaleString('en-IN', {
    maximumFractionDigits: 2, minimumFractionDigits: 2, style: 'currency', currency: 'INR'
  });
};
const today = () => new Date().toISOString().split('T')[0];
const genId = () => Math.random().toString(36).substr(2, 9);

const groupMRPsByItem = (mrps: MRP[]) => {
  const map = new Map<number, MRP[]>();
  for (const m of mrps || []) {
    if (!map.has(m.inventoryItemId)) map.set(m.inventoryItemId, []);
    map.get(m.inventoryItemId)!.push(m);
  }
  return map;
};

// ─── VARIANT DRAWER COMPONENT ─────────────────────────────────────────────────

interface VariantDrawerProps {
  item: InventoryItem;
  variants: PackVariantOption[];
  allItems: InventoryItem[];
  supplierMRPs: MRP[];
  selectedSupplierId: number | null;
  onClose: () => void;
  onEnsureVariantItem: (v: PackVariantOption) => Promise<InventoryItem | undefined>;
  onStockUpdated: () => void;
  toast: any;
}

function VariantDrawer({
  item, variants, allItems, supplierMRPs, selectedSupplierId,
  onClose, onEnsureVariantItem, onStockUpdated, toast
}: VariantDrawerProps) {
  const qc = useQueryClient();
  const [variantQtys, setVariantQtys] = useState<Record<string, string>>({});
  const [bulkQty, setBulkQty] = useState('');
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [bulkLoading, setBulkLoading] = useState(false);
  const [selectedMRPFilter, setSelectedMRPFilter] = useState<Record<string, number>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const getInvItem = (v: PackVariantOption): InventoryItem | undefined =>
    allItems.find(it => it.name.trim().toLowerCase() === v.inventoryName.trim().toLowerCase());

  const getMRPsForVariant = (v: PackVariantOption) => {
    const inv = getInvItem(v);
    if (!inv) return [];
    return supplierMRPs.filter(m => m.inventoryItemId === inv.id);
  };

  const doStockUpdate = async (inv: InventoryItem, qty: number, note: string) => {
    if (qty <= 0) throw new Error('Qty must be > 0');
    await api.post(`/restaurant/inventory/items/${inv.id}/movements`, {
      type: 'stock_in', quantity: qty, note
    });
    await qc.invalidateQueries({ queryKey: ['inv-items'] } as any);
    await qc.invalidateQueries({ queryKey: ['menu-items-nonkot-packvariants'] } as any);
    onStockUpdated();
  };

  const handleSingleUpdate = async (v: PackVariantOption) => {
    const qty = parseFloat(variantQtys[v.key] || '0');
    if (!(qty > 0)) {
      toast({ title: 'Enter quantity > 0', variant: 'destructive' });
      return;
    }
    setLoading(p => ({ ...p, [v.key]: true }));
    try {
      let inv = getInvItem(v);
      if (!inv) inv = await onEnsureVariantItem(v);
      if (!inv) return;
      await doStockUpdate(inv, qty, `Variant stock update: ${v.inventoryName}`);
      setVariantQtys(p => ({ ...p, [v.key]: '' }));
      toast({ title: `✓ ${v.label} updated`, description: `+${qty} ${inv.unit?.symbol || 'units'}` });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.response?.data?.error || e?.message, variant: 'destructive' });
    } finally {
      setLoading(p => ({ ...p, [v.key]: false }));
    }
  };

  const handleBulkUpdate = async () => {
    const qty = parseFloat(bulkQty || '0');
    if (!(qty > 0)) {
      toast({ title: 'Enter bulk quantity > 0', variant: 'destructive' });
      return;
    }
    setBulkLoading(true);
    let successCount = 0;
    try {
      for (const v of variants) {
        try {
          let inv = getInvItem(v);
          if (!inv) inv = await onEnsureVariantItem(v);
          if (!inv) continue;
          await doStockUpdate(inv, qty, `Bulk variant update: ${item.name}`);
          successCount++;
        } catch { /* continue other variants */ }
      }
      setBulkQty('');
      toast({ title: `✓ ${successCount}/${variants.length} variants updated`, description: `+${qty} applied to all` });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, v: PackVariantOption) => {
    if (e.key === 'Enter') { e.preventDefault(); void handleSingleUpdate(v); }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="border-b border-[#2a2d3e] bg-gradient-to-b from-[#141824] to-[#0f1420]"
    >
      {/* Drawer header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-[#2a2d3e]/50">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Package className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div>
            <div className="text-xs font-black text-purple-300 uppercase tracking-wider">{item.name}</div>
            <div className="text-[10px] text-slate-500">{variants.length} variant{variants.length !== 1 ? 's' : ''} · click qty field & press Enter to update</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Bulk update row */}
          <div className="flex items-center gap-1.5 bg-[#0b0f17] border border-[#2a2d3e] rounded-lg px-2 py-1">
            <Zap className="w-3 h-3 text-yellow-400" />
            <span className="text-[9px] font-black text-yellow-400 uppercase mr-1">All</span>
            <input
              type="number"
              min="0"
              step="0.001"
              value={bulkQty}
              onChange={e => setBulkQty(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleBulkUpdate(); } }}
              placeholder="+Qty"
              className="w-16 bg-transparent text-xs text-right text-white focus:outline-none placeholder:text-slate-600"
            />
            <button
              onClick={() => void handleBulkUpdate()}
              disabled={bulkLoading || !bulkQty || parseFloat(bulkQty) <= 0}
              className="ml-1 px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 text-[9px] font-black uppercase hover:bg-yellow-500/30 disabled:opacity-40 transition-colors"
            >
              {bulkLoading ? '...' : 'Update All'}
            </button>
          </div>

          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#2a2d3e] text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Variant cards grid */}
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {variants.map(v => {
          const inv = getInvItem(v);
          const mrpOptions = getMRPsForVariant(v);
          const isLow = inv ? Number(inv.currentStock) <= Number(inv.thresholdQty) : false;
          const isUpdating = loading[v.key];
          const qty = variantQtys[v.key] || '';
          const hasQty = parseFloat(qty) > 0;

          return (
            <div
              key={v.key}
              className={cn(
                "rounded-xl border p-3 transition-all",
                hasQty
                  ? "border-blue-500/60 bg-blue-500/5"
                  : "border-[#2a2d3e] bg-[#0b0f17] hover:border-[#3a3d4e]"
              )}
            >
              {/* Variant name + stock */}
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="text-xs font-black text-slate-100">{v.label}</div>
                  <div className="text-[9px] text-slate-500 mt-0.5">{v.inventoryName}</div>
                </div>
                <div className={cn(
                  "text-[10px] font-black px-1.5 py-0.5 rounded-md flex items-center gap-1",
                  isLow ? "bg-red-500/20 text-red-400" : "bg-slate-700/50 text-slate-400"
                )}>
                  {isLow && <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse inline-block" />}
                  {inv ? `${Number(inv.currentStock).toFixed(1)} ${inv.unit?.symbol || 'u'}` : '—'}
                </div>
              </div>

              {/* Pricing row */}
              <div className="grid grid-cols-2 gap-1.5 mb-2.5">
                <div className="bg-[#1a1d27] rounded-lg px-2 py-1.5">
                  <div className="text-[8px] text-slate-600 uppercase font-black">MRP</div>
                  <div className="text-[11px] font-black text-slate-300">₹{Number(v.mrp || 0).toFixed(2)}</div>
                </div>
                <div className="bg-[#1a1d27] rounded-lg px-2 py-1.5">
                  <div className="text-[8px] text-slate-600 uppercase font-black">Selling</div>
                  <div className="text-[11px] font-black text-green-400">₹{Number(v.sellingPrice || 0).toFixed(2)}</div>
                </div>
              </div>

              {/* MRP selector (if multiple) */}
              {mrpOptions.length > 1 && (
                <div className="mb-2">
                  <select
                    value={selectedMRPFilter[v.key] ?? mrpOptions[0]?.id ?? ''}
                    onChange={e => setSelectedMRPFilter(p => ({ ...p, [v.key]: Number(e.target.value) }))}
                    className="w-full bg-[#1a1d27] border border-[#2a2d3e] rounded px-1.5 py-1 text-[9px] text-slate-400"
                  >
                    {mrpOptions.map(m => (
                      <option key={m.id} value={m.id}>
                        MRP ₹{m.mrp} · Buy ₹{m.purchaseRate}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {mrpOptions.length === 1 && (
                <div className="mb-2 text-[9px] text-slate-600">
                  Buy Rate: <span className="text-slate-400 font-bold">₹{mrpOptions[0].purchaseRate}</span>
                </div>
              )}

              {/* Qty input + update button */}
              <div className="flex items-center gap-1.5">
                <input
                  ref={el => { inputRefs.current[v.key] = el; }}
                  type="number"
                  min="0"
                  step="1"
                  value={qty}
                  onChange={e => setVariantQtys(p => ({ ...p, [v.key]: e.target.value }))}
                  onKeyDown={e => handleKeyDown(e, v)}
                  placeholder="+Qty"
                  className={cn(
                    "flex-1 bg-[#111827] border rounded-lg px-2 py-1.5 text-xs text-right font-black transition-colors focus:outline-none",
                    hasQty ? "border-blue-500 text-blue-400" : "border-[#2a2d3e] text-white focus:border-blue-500/50"
                  )}
                />
                <button
                  onClick={() => void handleSingleUpdate(v)}
                  disabled={isUpdating || !hasQty}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all",
                    hasQty
                      ? "bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/20"
                      : "bg-[#1a1d27] text-slate-600 cursor-not-allowed"
                  )}
                >
                  {isUpdating ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3 h-3" />
                  )}
                </button>
              </div>

              {/* After update stock preview */}
              {hasQty && inv && (
                <div className="mt-1.5 text-[9px] text-blue-400 font-bold text-right">
                  → {(Number(inv.currentStock) + parseFloat(qty)).toFixed(1)} {inv.unit?.symbol || 'u'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function PurchaseStock() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { socket } = useSocket();

  // Realtime listeners
  useEffect(() => {
    if (!socket) return;
    const inv = () => { qc.invalidateQueries({ queryKey: ['inv-items'] } as any); };
    const sup = () => { qc.invalidateQueries({ queryKey: ['inv-suppliers'] } as any); };
    const po = (payload: any) => {
      qc.invalidateQueries({ queryKey: ['inv-pos'] } as any);
      inv(); sup();
      if (payload?.purchaseOrder) setLastPO(payload.purchaseOrder);
      if (payload?.payment) setLastPayment(payload.payment);
    };
    const poReceived = (payload: any) => {
      qc.invalidateQueries({ queryKey: ['inv-pos'] } as any); inv(); sup();
      if (payload?.data) setLastPO(payload.data);
    };
    const poPay = (payload: any) => {
      qc.invalidateQueries({ queryKey: ['inv-pos'] } as any); inv(); sup();
      if (payload?.payment) setLastPayment(payload.payment);
    };
    socket.on('purchaseOrder.created', po);
    socket.on('purchaseOrder.received', poReceived);
    socket.on('purchaseOrder.payment', poPay);
    socket.on('inventory.item.updated', inv);
    socket.on('supplier.updated', sup);
    return () => {
      socket.off('purchaseOrder.created', po);
      socket.off('purchaseOrder.received', poReceived);
      socket.off('purchaseOrder.payment', poPay);
      socket.off('inventory.item.updated', inv);
      socket.off('supplier.updated', sup);
    };
  }, [socket, qc]);

  // ─── STATE ─────────────────────────────────────────────────────────────────

  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [globalDiscountPercent, setGlobalDiscountPercent] = useState(0);
  const [globalDiscountAmount, setGlobalDiscountAmount] = useState(0);
  const [rows, setRows] = useState<PORow[]>([]);
  const [showAllItems, setShowAllItems] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [rowSearches, setRowSearches] = useState<Record<string, string>>({});
  const [activeRowDropdown, setActiveRowDropdown] = useState<string | null>(null);
  const [rowHighlighted, setRowHighlighted] = useState<Record<string, number>>({});
  const [supplierMRPs, setSupplierMRPs] = useState<MRP[]>([]);
  const [orderDate, setOrderDate] = useState(today());
  const [expectedDate, setExpectedDate] = useState('');
  const [note, setNote] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [lastPO, setLastPO] = useState<any | null>(null);
  const [lastPayment, setLastPayment] = useState<any | null>(null);

  // Variant drawer state
  const [variantDrawerItem, setVariantDrawerItem] = useState<InventoryItem | null>(null);

  // MRP modals
  const [showAddMRP, setShowAddMRP] = useState(false);
  const [addMRPItemId, setAddMRPItemId] = useState<number | null>(null);
  const [addMRPMrp, setAddMRPMrp] = useState(0);
  const [addMRPPurchaseRate, setAddMRPPurchaseRate] = useState(0);
  const [showEditMRP, setShowEditMRP] = useState(false);
  const [editMRPId, setEditMRPId] = useState<number | null>(null);
  const [editMRPValue, setEditMRPValue] = useState(0);
  const [editProfitPercent, setEditProfitPercent] = useState(0);
  const [showDeleteMRPModal, setShowDeleteMRPModal] = useState(false);
  const [deleteMRPItemId, setDeleteMRPItemId] = useState<number | null>(null);
  const [deleteMRPSelectedId, setDeleteMRPSelectedId] = useState<number | null>(null);
  const [showThresholdModal, setShowThresholdModal] = useState(false);
  const [thresholdItemId, setThresholdItemId] = useState<number | null>(null);
  const [thresholdValue, setThresholdValue] = useState(0);

  // Payment modal
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

  // History expanded state
  const [expandedPOId, setExpandedPOId] = useState<number | null>(null);
  const [poPaymentsCache, setPoPaymentsCache] = useState<Record<number, any[]>>({});

  // ─── QUERIES ───────────────────────────────────────────────────────────────

  const { data: suppliers = [] } = useQuery({
    queryKey: ['inv-suppliers'],
    queryFn: () => api.get('/restaurant/inventory/suppliers').then(r => r.data.data),
  });

  const { data: allItems = [], refetch: refetchAllItems } = useQuery({
    queryKey: ['inv-items'],
    queryFn: () => api.get('/restaurant/inventory/items').then(r => r.data.data),
  });

  const { data: nonKotMenuItems = [] } = useQuery({
    queryKey: ['menu-items-nonkot-packvariants'],
    queryFn: () => api.get('/restaurant/menu-items?isKOT=false').then(r => r.data.data as MenuItemLight[]),
  });

  const filteredSuppliers = (suppliers as Supplier[]).filter(s =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
    (s.contactPerson && s.contactPerson.toLowerCase().includes(supplierSearch.toLowerCase()))
  );
  const selectedSupplier = (suppliers as Supplier[]).find(s => s.id === selectedSupplierId);

  // ─── PACK VARIANTS ─────────────────────────────────────────────────────────

  const packVariants = useMemo<PackVariantOption[]>(() => {
    const out: PackVariantOption[] = [];
    for (const mi of (nonKotMenuItems || [])) {
      if (!mi?.enablePackOptions || !Array.isArray(mi.packOptions)) continue;
      for (let idx = 0; idx < mi.packOptions.length; idx++) {
        const p = mi.packOptions[idx] || {};
        const label = String(p.label || '').trim() || (idx === 0 ? 'Main' : `Pack ${idx}`);
        const inventoryName = `${mi.name} - ${label}`;
        const mappedInventory = allItems.find((it: any) =>
          String(it.name || '').trim().toLowerCase() === inventoryName.trim().toLowerCase()
        );
        out.push({
          key: `pack-${mi.id}-${idx}`,
          menuItemId: mi.id,
          menuItemName: mi.name,
          inventoryName,
          label,
          unitId: p.unitId ?? null,
          unitLabel: p.unitLabel,
          mrp: Number(p.mrp ?? 0) || undefined,
          purchaseRate: Number(p.purchaseRate ?? 0) || undefined,
          profitPercent: Number(p.profitPercent ?? 0) || undefined,
          sellingPrice: Number(p.sellingPrice ?? p.price ?? 0) || undefined,
          stockWarningThreshold: Number(p.stockWarningThreshold ?? 0) || undefined,
          image: mi.image,
          inventoryItemId: mappedInventory?.id,
        });
      }
    }
    return out;
  }, [nonKotMenuItems, allItems]);

  const getVariantsForItem = useCallback((item: InventoryItem | null): PackVariantOption[] => {
    if (!item) return [];
    const name = item.name.trim().toLowerCase();
    const direct = packVariants.filter(v => v.menuItemName.trim().toLowerCase() === name);
    if (direct.length > 0) return direct;
    return packVariants.filter(v => v.inventoryName.trim().toLowerCase().startsWith(`${name} -`));
  }, [packVariants]);

  const variantDrawerVariants = useMemo(
    () => getVariantsForItem(variantDrawerItem),
    [variantDrawerItem, getVariantsForItem]
  );

  // ─── SELECT OPTIONS ────────────────────────────────────────────────────────

  const selectOptions = useMemo<PurchaseSelectOption[]>(() => {
    const opts: PurchaseSelectOption[] = [];
    for (const it of allItems) opts.push({ kind: 'inventory', key: `inv-${it.id}`, item: it });
    for (const v of packVariants) {
      const mapped = allItems.find((it: any) =>
        String(it.name || '').trim().toLowerCase() === v.inventoryName.trim().toLowerCase()
      );
      opts.push({ kind: 'pack', key: v.key, variant: v, item: mapped });
    }
    return opts;
  }, [allItems, packVariants]);

  const visibleSelectOptions = useMemo<PurchaseSelectOption[]>(() => {
    if (showAllItems) return selectOptions;
    const supplierItemIds = new Set<number>(supplierMRPs.map(m => m.inventoryItemId));
    return selectOptions.filter(o => {
      if (o.kind === 'inventory') return supplierItemIds.has(o.item.id);
      if (o.item?.id && supplierItemIds.has(o.item.id)) return true;
      return false;
    });
  }, [showAllItems, selectOptions, supplierMRPs]);

  // ─── SUPPLIER LOAD / RELOAD ─────────────────────────────────────────────────

  const reloadSupplierMRPs = useCallback(async () => {
    if (!selectedSupplierId) return;
    try {
      const res = await api.get(`/restaurant/inventory/suppliers/${selectedSupplierId}/items`);
      const mrps: MRP[] = res.data.data || [];
      setSupplierMRPs(mrps);
      setRows(prev => prev.map(r => {
        if (!r.inventoryItemId) return r;
        const itemMRPs = mrps.filter(m => m.inventoryItemId === r.inventoryItemId);
        const selected = itemMRPs.find(m => m.id === r.selectedMRPId) ?? itemMRPs[0];
        return {
          ...r,
          itemMRPs,
          selectedMRPId: selected?.id,
          inventoryItemMRPId: selected?.id,
          unitCost: selected?.purchaseRate ?? r.unitCost
        };
      }));
    } catch { /* silent */ }
  }, [selectedSupplierId]);

  useEffect(() => {
    if (!selectedSupplierId) { setRows([]); setSupplierMRPs([]); return; }
    api.get(`/restaurant/inventory/suppliers/${selectedSupplierId}/items`).then(res => {
      const mrps: MRP[] = res.data.data || [];
      setSupplierMRPs(mrps);
      const byItem = groupMRPsByItem(mrps);
      const autoRows: PORow[] = [];
      let cnt = 0;
      for (const [itemId, itemMRPs] of byItem) {
        if (cnt++ >= 8) break;
        const primary = itemMRPs[0];
        autoRows.push({
          inventoryItemId: itemId,
          item: primary.inventoryItem,
          quantity: 0,
          unitCost: Number(primary.purchaseRate || 0),
          gstPercent: 5,
          discountPercent: 0,
          tempId: genId(),
          itemMRPs,
          selectedMRPId: primary.id,
          inventoryItemMRPId: primary.id,
        });
      }
      setRows(autoRows);
      setNote('');
      setLastPO(null);
      setLastPayment(null);
      setVariantDrawerItem(null);
    });
  }, [selectedSupplierId]);

  // ─── ENSURE PACK VARIANT INV ITEM ──────────────────────────────────────────

  const ensurePackVariantInventoryItem = async (variant: PackVariantOption): Promise<InventoryItem | undefined> => {
    const existing = allItems.find((it: any) =>
      String(it.name || '').trim().toLowerCase() === variant.inventoryName.trim().toLowerCase()
    );
    if (existing) return existing as InventoryItem;

    const base = allItems.find((it: any) =>
      String(it.name || '').trim().toLowerCase() === String(variant.menuItemName || '').trim().toLowerCase()
    );
    const resolvedCategoryId = Number(base?.categoryId ?? base?.category?.id ?? 0);
    const resolvedUnitId = Number(variant.unitId ?? base?.unitId ?? base?.unit?.id ?? 0);

    if (!resolvedCategoryId || !resolvedUnitId) {
      toast({ title: 'Missing mapping', description: `Set main inventory item/category/unit first for ${variant.inventoryName}.`, variant: 'destructive' });
      return undefined;
    }

    const createRes = await api.post('/restaurant/inventory/items', {
      name: variant.inventoryName,
      categoryId: resolvedCategoryId,
      unitId: resolvedUnitId,
      image: variant.image,
      thresholdQty: Number(variant.stockWarningThreshold || 0),
      currentStock: 0,
      costPerUnit: Number(variant.purchaseRate || 0),
    });
    const created = createRes?.data?.data as InventoryItem;

    if (created && selectedSupplierId && Number(variant.mrp || 0) >= 0 && Number(variant.purchaseRate || 0) >= 0) {
      try {
        await api.post(`/restaurant/inventory/suppliers/${selectedSupplierId}/items`, {
          inventoryItemId: created.id,
          mrp: Number(variant.mrp || variant.sellingPrice || 0),
          purchaseRate: Number(variant.purchaseRate || 0),
          profitPercent: Number(variant.profitPercent || 0),
        });
      } catch { /* continue */ }
    }

    await qc.invalidateQueries({ queryKey: ['inv-items'] } as any);
    await refetchAllItems();
    await reloadSupplierMRPs();
    const fresh = await api.get('/restaurant/inventory/items').then(r => r.data.data || []);
    return fresh.find((it: any) =>
      String(it.name || '').trim().toLowerCase() === variant.inventoryName.trim().toLowerCase()
    ) || created;
  };

  // ─── CHIP CLICK ────────────────────────────────────────────────────────────

  const handleChipClick = (item: InventoryItem) => {
    const variants = getVariantsForItem(item);

    // If item has variants → open/toggle variant drawer
    if (variants.length > 0) {
      setVariantDrawerItem(prev => prev?.id === item.id ? null : item);
      return;
    }

    // No variants → add/increment row
    setVariantDrawerItem(null);
    const existingIndex = rows.findIndex(r => r.inventoryItemId === item.id);
    if (existingIndex > -1) {
      setRows(prev => {
        const next = [...prev];
        next[existingIndex] = { ...next[existingIndex], quantity: next[existingIndex].quantity + 1 };
        return next;
      });
    } else {
      const itemMRPs = supplierMRPs.filter(m => m.inventoryItemId === item.id);
      const primary = itemMRPs[0];
      setRows(prev => [...prev, {
        inventoryItemId: item.id, item,
        quantity: 1,
        unitCost: Number(primary?.purchaseRate || item.costPerUnit || 0),
        gstPercent: 5, discountPercent: 0,
        tempId: genId(),
        itemMRPs, selectedMRPId: primary?.id, inventoryItemMRPId: primary?.id,
      }]);
    }
  };

  // ─── ROW MANAGEMENT ────────────────────────────────────────────────────────

  const addEmptyRow = () => setRows(prev => [...prev, {
    quantity: 0, unitCost: 0, gstPercent: 5, discountPercent: 0, tempId: genId()
  }]);

  const removeRow = (index: number) => setRows(prev => prev.filter((_, i) => i !== index));

  const updateRow = (index: number, updates: Partial<PORow> & { selectedMRPId?: number }) => {
    setRows(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };

      if (updates.inventoryItemId) {
        const item = (updates as any).item ?? allItems.find((it: any) => it.id === updates.inventoryItemId);
        const itemMRPs = supplierMRPs.filter(m => m.inventoryItemId === updates.inventoryItemId);
        const selId = updates.selectedMRPId ?? itemMRPs[0]?.id;
        const selected = itemMRPs.find(m => m.id === selId) ?? itemMRPs[0];
        next[index].item = item;
        next[index].itemMRPs = itemMRPs;
        next[index].selectedMRPId = selected?.id;
        next[index].inventoryItemMRPId = selected?.id;
        next[index].unitCost = Number(selected?.purchaseRate || item?.costPerUnit || 0);
      }

      if (updates.selectedMRPId && !updates.inventoryItemId) {
        const m = supplierMRPs.find(x => x.id === updates.selectedMRPId);
        if (m) {
          next[index].selectedMRPId = m.id;
          next[index].inventoryItemMRPId = m.id;
          next[index].unitCost = Number(m.purchaseRate || 0);
          next[index].item = m.inventoryItem;
          next[index].itemMRPs = supplierMRPs.filter(x => x.inventoryItemId === m.inventoryItemId);
        }
      }
      return next;
    });
  };

  const selectOptionForRow = async (option: PurchaseSelectOption, row: PORow, idx: number) => {
    if (option.kind === 'inventory') {
      const existingMrp = supplierMRPs.find(m => m.inventoryItemId === option.item.id);
      updateRow(idx, { inventoryItemId: option.item.id, item: option.item, unitCost: Number(existingMrp?.purchaseRate || option.item.costPerUnit || 0) });
    } else {
      let inv = option.item;
      if (!inv) inv = await ensurePackVariantInventoryItem(option.variant);
      if (!inv) return;
      const existingMrp = supplierMRPs.find(m => m.inventoryItemId === inv!.id);
      updateRow(idx, { inventoryItemId: inv.id, item: inv, unitCost: Number(existingMrp?.purchaseRate || inv.costPerUnit || 0) });
    }
    setRowSearches(prev => { const c = { ...prev }; delete c[row.tempId]; return c; });
    setActiveRowDropdown(null);
    setRowHighlighted(prev => ({ ...prev, [row.tempId]: -1 }));
  };

  const handleRowKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, row: PORow, idx: number) => {
    const q = (rowSearches[row.tempId] ?? '').trim().toLowerCase();
    const list = buildDropdownList(q, row);
    const cur = rowHighlighted[row.tempId] ?? -1;

    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveRowDropdown(row.tempId); setRowHighlighted(p => ({ ...p, [row.tempId]: Math.min(cur + 1, list.length - 1) })); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveRowDropdown(row.tempId); setRowHighlighted(p => ({ ...p, [row.tempId]: Math.max(cur - 1, 0) })); }
    else if (e.key === 'Enter' && activeRowDropdown === row.tempId) {
      e.preventDefault();
      const chosen = list[Math.max(0, Math.min(cur, list.length - 1))];
      if (chosen) void selectOptionForRow(chosen, row, idx);
    } else if (e.key === 'Escape') { setActiveRowDropdown(null); }
  };

  const buildDropdownList = (q: string, row: PORow): PurchaseSelectOption[] => {
    const base = q.length > 0
      ? visibleSelectOptions.filter(opt => {
          if (opt.kind === 'inventory') return opt.item.name.toLowerCase().includes(q) || String(opt.item.id) === q;
          return opt.variant.inventoryName.toLowerCase().includes(q);
        }).slice(0, 50)
      : visibleSelectOptions.slice(0, 50);
    return base;
  };

  // ─── CALCULATIONS ──────────────────────────────────────────────────────────

  const baseSubtotal = useMemo(() => rows.reduce((a, r) => a + (r.quantity || 0) * (r.unitCost || 0), 0), [rows]);

  const rowCalculations = rows.map(row => {
    const base = (row.quantity || 0) * (row.unitCost || 0);
    let disc = 0;
    if (globalDiscountPercent > 0) disc = base * (globalDiscountPercent / 100);
    else if (globalDiscountAmount > 0 && baseSubtotal > 0) disc = (base / baseSubtotal) * globalDiscountAmount;
    else disc = base * ((row.discountPercent || 0) / 100);
    const after = base - disc;
    const gst = after * ((row.gstPercent || 0) / 100);
    return { item_base: base, item_discount: disc, item_after: after, item_gst: gst, item_total: after + gst };
  });

  const invoice = useMemo(() => ({
    subtotal: rowCalculations.reduce((a, r) => a + r.item_base, 0),
    discount: rowCalculations.reduce((a, r) => a + r.item_discount, 0),
    total_gst: rowCalculations.reduce((a, r) => a + r.item_gst, 0),
    get grand_total() { return this.subtotal - this.discount + this.total_gst; }
  }), [rowCalculations]);

  const totalPayable = Number(selectedSupplier?.outstandingBalance || 0) + invoice.grand_total;
  const newBalance = totalPayable - paidAmount;
  const canPurchase = rows.some(r => r.quantity > 0) && !!selectedSupplierId;

  // ─── CHIP BASE ─────────────────────────────────────────────────────────────

  const chipBase: InventoryItem[] = showAllItems
    ? allItems
    : (() => {
        const seen = new Set<number>();
        const list: InventoryItem[] = [];
        for (const m of supplierMRPs) {
          if (m.inventoryItem && !seen.has(m.inventoryItem.id)) {
            seen.add(m.inventoryItem.id);
            list.push(m.inventoryItem);
          }
        }
        return list;
      })();

  const filteredChips = chipBase.filter(it => (it.name || '').toLowerCase().includes(itemSearch.toLowerCase()));

  // ─── MUTATIONS ─────────────────────────────────────────────────────────────

  const purchaseMutation = useMutation({
    mutationFn: async () => {
      const subtotalForItems = rows.filter(r => r.quantity > 0).reduce((s, r) => s + (r.quantity || 0) * (r.unitCost || 0), 0);
      const distributePercent = globalDiscountPercent > 0
        ? globalDiscountPercent
        : (globalDiscountAmount > 0 && subtotalForItems > 0)
          ? (globalDiscountAmount / subtotalForItems) * 100
          : 0;

      const validItems = rows
        .filter(r => r.inventoryItemId && (r.quantity || 0) > 0 && (r.unitCost || 0) >= 0)
        .map(r => ({
          inventoryItemId: Number(r.inventoryItemId),
          quantity: Number(r.quantity),
          unitCost: Number(r.unitCost),
          taxPercent: Number(r.gstPercent || 0),
          discountPercent: Number(distributePercent || 0),
          inventoryItemMRPId: r.selectedMRPId ?? undefined
        }));

      const poRes = await api.post('/restaurant/inventory/purchase-orders', {
        supplierId: selectedSupplierId, items: validItems, orderDate, expectedDate, note
      });
      const poData = poRes.data.data;
      const po = poData?.purchaseOrder ?? poData;
      setLastPO(po);
      if (!po?.id) throw new Error('Created purchase order missing id');
      if (!(poData?.stockUpdated) && po.status !== 'received') {
        await api.post(`/restaurant/inventory/purchase-orders/${po.id}/receive`, {});
      }
      if (paidAmount > 0) {
        const payRes = await api.post(`/restaurant/inventory/purchase-orders/${po.id}/payments`, {
          amount: paidAmount, method: paymentMethod, reference: paymentRef,
          notes: paymentNote, supplierId: selectedSupplierId, paymentDate: orderDate
        });
        setLastPayment(payRes.data.data);
      }
      return po;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inv-pos'] } as any);
      qc.invalidateQueries({ queryKey: ['inv-items'] } as any);
      qc.invalidateQueries({ queryKey: ['inv-suppliers'] } as any);
      setRows(prev => prev.map(r => ({ ...r, quantity: 0 })));
      setGlobalDiscountPercent(0);
      setGlobalDiscountAmount(0);
      setShowPayment(false);
      toast({ title: '✓ Purchase complete', description: 'Stock updated successfully.' });
    },
    onError: (err: any) => toast({ title: 'Error', description: err.response?.data?.error || err.message, variant: 'destructive' })
  });

  const editMRPMutation = useMutation({
    mutationFn: async () => {
      if (!editMRPId || !selectedSupplierId) throw new Error('Missing MRP id or supplier');
      const mrpObj = supplierMRPs.find(m => m.id === editMRPId);
      if (!mrpObj) throw new Error('MRP not found');
      // FIX: compute purchaseRate from current mrpObj.purchaseRate, not from editMRPValue
      const profitPercent = editProfitPercent || 0;
      const purchaseRate = mrpObj.purchaseRate; // purchase rate stays same, MRP (sellingRate) changes
      return api.post(`/restaurant/inventory/suppliers/${selectedSupplierId}/items`, {
        inventoryItemId: mrpObj.inventoryItemId,
        mrp: editMRPValue,
        purchaseRate,
        profitPercent
      }).then(r => r.data.data);
    },
    onSuccess: () => { reloadSupplierMRPs(); setShowEditMRP(false); setEditMRPId(null); toast({ title: 'MRP updated' }); },
    onError: (err: any) => toast({ title: 'Failed to update MRP', description: err?.response?.data?.error || err?.message, variant: 'destructive' })
  });

  const deleteMRPMutation = useMutation({
    mutationFn: (mrpId: number) => api.delete(`/restaurant/inventory/mrps/${mrpId}`).then(r => r.data.data),
    onSuccess: () => {
      reloadSupplierMRPs(); setShowDeleteMRPModal(false); setDeleteMRPItemId(null); setDeleteMRPSelectedId(null);
      toast({ title: 'MRP deleted' });
    },
    onError: (err: any) => toast({ title: 'Failed to delete MRP', description: err?.response?.data?.error || err?.message, variant: 'destructive' })
  });

  // ─── PRINT ─────────────────────────────────────────────────────────────────

  const printReceipt = () => {
    if (!lastPO || !selectedSupplier) return;
    const w = window.open('', '_blank', 'width=400,height=600');
    if (!w) return;
    const itemsHtml = lastPO.items.map((it: any) => `
      <div style="margin-bottom:5px">
        <div style="font-weight:bold">${it.inventoryItem?.name || 'Item'}</div>
        <div style="display:flex;justify-content:space-between;font-size:13px">
          <span>${it.quantity} × ₹${Number(it.unitCost).toFixed(2)}</span>
          <span>₹${Number(it.total * (1 + it.taxPercent / 100)).toFixed(2)}</span>
        </div>
        <div style="font-size:11px;color:#444">GST ${it.taxPercent}%: ₹${Number(it.total * (it.taxPercent / 100)).toFixed(2)}</div>
      </div>`).join('');
    w.document.write(`<html><head><style>body{font-family:'Courier New',monospace;padding:20px;color:#000;font-size:14px;max-width:400px}.h{text-align:center;margin-bottom:10px}.d{border-top:1px dashed #000;margin:8px 0}.r{display:flex;justify-content:space-between;margin:2px 0}.b{font-weight:bold}</style></head>
      <body onload="window.print();window.close()">
      <div class="h"><h2 style="margin:0">PURCHASE INVOICE</h2><div class="b">${selectedSupplier.name}</div><div>${selectedSupplier.phone || ''}</div></div>
      <div class="d"></div>
      <div class="r"><span>Invoice#</span><span class="b">${lastPO.orderNumber}</span></div>
      <div class="r"><span>Date</span><span class="b">${formatDate(lastPO.createdAt)}</span></div>
      <div class="d"></div>${itemsHtml}<div class="d"></div>
      <div class="r"><span>Subtotal</span><span>${indianFormat(invoice.subtotal)}</span></div>
      <div class="r"><span>CGST</span><span>${indianFormat(invoice.total_gst / 2)}</span></div>
      <div class="r"><span>SGST</span><span>${indianFormat(invoice.total_gst / 2)}</span></div>
      <div class="d"></div>
      <div class="r b" style="font-size:16px"><span>Grand Total</span><span>${indianFormat(invoice.grand_total)}</span></div>
      <div class="r"><span>Paid (${lastPayment?.method || 'UPI'})</span><span>${indianFormat(lastPayment?.amount || 0)}</span></div>
      <div class="r"><span>Balance</span><span>${indianFormat(Math.max(0, invoice.grand_total - (lastPayment?.amount || 0)))}</span></div>
      <div class="d"></div><div style="text-align:center;font-size:12px;margin-top:15px">Thank you · SMARTGONEXT</div>
      </body></html>`);
    w.document.close();
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-[#0f1117] text-slate-200 overflow-hidden font-sans">

      {/* TOPBAR */}
      <header className="h-14 border-b border-[#2a2d3e] px-6 flex items-center justify-between bg-[#1a1d27] z-30 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Layers className="w-5 h-5 text-blue-500" />
          <h1 className="text-sm font-black uppercase tracking-widest text-slate-100">Purchase & Stock</h1>
        </div>
        <div className="flex items-center gap-2">
          {lastPO && (
            <Button onClick={printReceipt} className="h-9 bg-green-600 hover:bg-green-700 font-bold px-4">
              <Printer className="w-4 h-4 mr-2" /> Print Bill
            </Button>
          )}
          {selectedSupplierId && (
            <Button onClick={() => setShowHistory(true)} variant="outline" className="h-9 border-[#2a2d3e] hover:bg-[#1e2235] text-slate-300">
              <History className="w-4 h-4 mr-2" /> History
            </Button>
          )}
        </div>
      </header>

      {/* THREE-PANEL LAYOUT */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT PANEL: SUPPLIERS */}
        <aside className="w-56 border-r border-[#2a2d3e] bg-[#1a1d27] flex flex-col pt-2 flex-shrink-0">
          <div className="px-3 mb-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
              <input
                placeholder="Search vendor..."
                value={supplierSearch}
                onChange={e => setSupplierSearch(e.target.value)}
                className="w-full bg-[#0b0f17] border border-[#2a2d3e] rounded-lg pl-7 pr-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 space-y-1.5 pb-20">
            {filteredSuppliers.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedSupplierId(s.id)}
                className={cn(
                  "w-full text-left p-2.5 rounded-xl border transition-all flex flex-col gap-1",
                  selectedSupplierId === s.id ? "bg-blue-600/10 border-blue-500" : "bg-[#0b0f17] border-transparent hover:border-[#2a2d3e]"
                )}
              >
                <span className={cn("font-bold text-[11px] truncate", selectedSupplierId === s.id ? "text-blue-400" : "text-slate-300")}>{s.name}</span>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-slate-500 font-bold uppercase">{s.contactPerson || 'Vendor'}</span>
                  <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded uppercase",
                    Number(s.outstandingBalance) > 0 ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-500"
                  )}>
                    {Number(s.outstandingBalance) > 0 ? `₹${Number(s.outstandingBalance)}` : 'CLEAR'}
                  </span>
                </div>
              </button>
            ))}
          </div>
          {selectedSupplier && (
            <div className="p-3 bg-[#0b0f17] border-t border-[#2a2d3e] space-y-2">
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500 uppercase font-black">Outstanding</span>
                <span className="text-red-500 font-black">{indianFormat(selectedSupplier.outstandingBalance)}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500 uppercase font-black">Total Orders</span>
                <span className="text-slate-300 font-black">{selectedSupplier.totalOrders || 0}</span>
              </div>
            </div>
          )}
        </aside>

        {/* CENTER PANEL: WORKSPACE */}
        <main className="flex-1 flex flex-col bg-[#0b0f17] overflow-hidden min-w-0">
          {!selectedSupplierId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-600 opacity-40 gap-3">
              <Truck className="w-12 h-12" />
              <p className="text-sm font-black uppercase tracking-widest">Select a Supplier to Begin</p>
            </div>
          ) : (
            <div className="flex flex-col h-full overflow-hidden">

              {/* TOOLBAR */}
              <div className="p-3 border-b border-[#2a2d3e] bg-[#1a1d27]/50 flex items-center justify-between gap-3 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black uppercase text-blue-400 tracking-tighter">{selectedSupplier?.name}</span>
                  <div className="flex bg-[#0b0f17] p-0.5 rounded-lg border border-[#2a2d3e]">
                    <button onClick={() => setShowAllItems(false)} className={cn("px-3 py-1 text-[9px] font-black uppercase rounded transition-all", !showAllItems ? "bg-blue-600 text-white" : "text-slate-500")}>Supplier</button>
                    <button onClick={() => setShowAllItems(true)} className={cn("px-3 py-1 text-[9px] font-black uppercase rounded transition-all", showAllItems ? "bg-blue-600 text-white" : "text-slate-500")}>All Items</button>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-1 max-w-sm ml-auto">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" />
                    <input value={itemSearch} onChange={e => setItemSearch(e.target.value)} placeholder="Filter items..." className="w-full bg-[#0b0f17] border border-[#2a2d3e] rounded-lg pl-8 pr-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500/50" />
                  </div>
                  <Button onClick={addEmptyRow} variant="outline" size="sm" className="h-[30px] border-[#2a2d3e] text-[9px] font-black uppercase whitespace-nowrap">
                    <Plus className="w-3 h-3 mr-1" /> Row
                  </Button>
                </div>
              </div>

              {/* ITEM CHIPS */}
              <div className="p-3 flex flex-wrap gap-1.5 max-h-[110px] overflow-y-auto border-b border-[#2a2d3e] bg-[#1a1d27]/20 flex-shrink-0">
                {filteredChips.map(it => {
                  const isLow = Number(it.currentStock) <= Number(it.thresholdQty);
                  const qtyInRows = rows.filter(r => r.inventoryItemId === it.id).reduce((a, b) => a + (b.quantity || 0), 0);
                  const variants = getVariantsForItem(it);
                  const hasVariants = variants.length > 0;
                  const isDrawerOpen = variantDrawerItem?.id === it.id;

                  return (
                    <button
                      key={it.id}
                      onClick={() => handleChipClick(it)}
                      className={cn(
                        "inline-flex items-center px-2.5 py-1.5 rounded-full border text-[10px] font-bold transition-all gap-1",
                        isDrawerOpen
                          ? "bg-purple-500/25 border-purple-400 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.2)]"
                          : qtyInRows > 0
                            ? "bg-blue-500/20 border-blue-500 text-blue-400"
                            : "bg-[#1a1d27] border-[#2a2d3e] text-slate-400 hover:border-slate-500"
                      )}
                    >
                      {isLow && <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />}
                      {it.name}
                      <span className="opacity-40 text-[9px]">{it.currentStock}{it.unit?.symbol || 'U'}</span>
                      {hasVariants && (
                        <span className={cn(
                          "text-[8px] px-1 py-0.5 rounded font-black",
                          isDrawerOpen ? "bg-purple-400/30 text-purple-300" : "bg-slate-600/40 text-slate-500"
                        )}>
                          {variants.length}V {isDrawerOpen ? '▲' : '▼'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* VARIANT DRAWER — shown inline below chips */}
              <AnimatePresence>
                {variantDrawerItem && variantDrawerVariants.length > 0 && (
                  <VariantDrawer
                    key={variantDrawerItem.id}
                    item={variantDrawerItem}
                    variants={variantDrawerVariants}
                    allItems={allItems}
                    supplierMRPs={supplierMRPs}
                    selectedSupplierId={selectedSupplierId}
                    onClose={() => setVariantDrawerItem(null)}
                    onEnsureVariantItem={ensurePackVariantInventoryItem}
                    onStockUpdated={reloadSupplierMRPs}
                    toast={toast}
                  />
                )}
              </AnimatePresence>

              {/* ORDER ROWS TABLE */}
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left border-collapse table-fixed">
                  <thead className="sticky top-0 bg-[#1a1d27] z-10">
                    <tr className="text-[9px] font-black uppercase text-slate-500 border-b border-[#2a2d3e]">
                      <th className="px-4 py-2.5 w-[220px]">ITEM</th>
                      <th className="px-2 py-2.5 text-center w-[90px]">STOCK</th>
                      <th className="px-2 py-2.5 text-right w-[80px]">QTY</th>
                      <th className="px-2 py-2.5 text-center w-[65px]">GST%</th>
                      <th className="px-4 py-2.5 text-right w-[110px]">RATE</th>
                      <th className="px-4 py-2.5 text-right w-[110px]">TOTAL</th>
                      <th className="px-2 py-2.5 text-center w-[45px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr key={row.tempId} className="border-b border-[#1a1d27] group hover:bg-[#1a1d27]/30">
                        <td className="px-4 py-2">
                          <div className="relative">
                            <input
                              value={rowSearches[row.tempId] ?? (row.item?.name ?? '')}
                              onChange={e => { setRowSearches(p => ({ ...p, [row.tempId]: e.target.value })); setActiveRowDropdown(row.tempId); }}
                              onFocus={() => setActiveRowDropdown(row.tempId)}
                              onBlur={() => setTimeout(() => setActiveRowDropdown(null), 150)}
                              onKeyDown={e => handleRowKeyDown(e, row, idx)}
                              placeholder="Search item..."
                              className="w-full bg-[#0b0f17] border border-[#2a2d3e] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500/50"
                            />
                            {activeRowDropdown === row.tempId && (
                              <div className="absolute left-0 right-0 mt-1 bg-[#0b0f17] border border-[#2a2d3e] rounded max-h-44 overflow-y-auto z-50 shadow-xl">
                                {(() => {
                                  const q = (rowSearches[row.tempId] ?? '').trim().toLowerCase();
                                  const list = buildDropdownList(q, row);
                                  return list.length ? list.map((opt, i) => {
                                    const title = opt.kind === 'inventory' ? opt.item.name : opt.variant.inventoryName;
                                    const sub = opt.kind === 'inventory' ? `ID: ${opt.item.id}` : `Pack · ${opt.variant.menuItemName}`;
                                    return (
                                      <button
                                        key={opt.key}
                                        onMouseDown={e => e.preventDefault()}
                                        onClick={() => void selectOptionForRow(opt, row, idx)}
                                        onMouseEnter={() => setRowHighlighted(p => ({ ...p, [row.tempId]: i }))}
                                        className={cn("w-full text-left px-3 py-2", (rowHighlighted[row.tempId] ?? -1) === i ? "bg-[#1e3a5f]" : "hover:bg-[#1e2235]")}
                                      >
                                        <div className="font-bold text-sm flex items-center gap-2">
                                          {title}
                                          {opt.kind === 'pack' && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 uppercase font-black">Pack</span>}
                                        </div>
                                        <div className="text-xs text-slate-500">{sub}</div>
                                      </button>
                                    );
                                  }) : <div className="p-2 text-sm text-slate-500">No results</div>;
                                })()}
                              </div>
                            )}
                          </div>

                          {/* MRP selector for row */}
                          {row.inventoryItemId && (
                            <div className="mt-1 flex items-center gap-1.5">
                              <select
                                value={row.selectedMRPId ?? ''}
                                onChange={e => {
                                  const m = (row.itemMRPs || supplierMRPs).find(s => String(s.id) === e.target.value);
                                  if (m) updateRow(idx, { selectedMRPId: m.id, unitCost: Number(m.purchaseRate) });
                                  else updateRow(idx, { selectedMRPId: undefined });
                                }}
                                className="flex-1 bg-[#0b0f17] border border-[#2a2d3e] rounded px-1.5 py-0.5 text-[10px] text-slate-400"
                              >
                                <option value="">No MRP</option>
                                {(row.itemMRPs || supplierMRPs).filter(m => m.inventoryItemId === row.inventoryItemId).map(m => (
                                  <option key={m.id} value={m.id}>₹{m.mrp} MRP · Buy ₹{m.purchaseRate}</option>
                                ))}
                              </select>

                              <button
                                onClick={() => {
                                  const itemMRPs = supplierMRPs.filter(m => m.inventoryItemId === row.inventoryItemId);
                                  if (itemMRPs.length > 0) {
                                    const last = itemMRPs[itemMRPs.length - 1];
                                    setEditMRPId(last.id);
                                    setEditMRPValue(Number(last.mrp ?? 0));
                                    setEditProfitPercent(Number(last.profitPercent ?? 0));
                                    setShowEditMRP(true);
                                  } else {
                                    setAddMRPItemId(row.inventoryItemId ?? null);
                                    setAddMRPMrp(Number(row.unitCost ?? 0));
                                    setAddMRPPurchaseRate(Number(row.unitCost ?? 0));
                                    setShowAddMRP(true);
                                  }
                                }}
                                className="p-1 text-slate-600 hover:text-blue-400 transition-colors" title="Edit MRP"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>

                              <button
                                onClick={() => {
                                  setAddMRPItemId(row.inventoryItemId ?? null);
                                  setAddMRPMrp(row.unitCost || 0);
                                  setAddMRPPurchaseRate(row.unitCost || 0);
                                  setShowAddMRP(true);
                                }}
                                className="text-[9px] text-blue-500 hover:text-blue-400 font-black"
                              >+MRP</button>

                              <button
                                onClick={() => {
                                  setDeleteMRPItemId(row.inventoryItemId ?? null);
                                  const itemMRPs = supplierMRPs.filter(m => m.inventoryItemId === row.inventoryItemId);
                                  setDeleteMRPSelectedId(itemMRPs.length ? itemMRPs[itemMRPs.length - 1].id : null);
                                  setShowDeleteMRPModal(true);
                                }}
                                className="p-1 text-slate-700 hover:text-red-500 transition-colors" title="Delete MRP"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </td>

                        <td className="px-2 py-2 text-center">
                          {row.item ? (
                            <div className="flex flex-col items-center">
                              <button
                                onClick={() => { setThresholdItemId(row.item!.id); setThresholdValue(Number(row.item!.thresholdQty || 0)); setShowThresholdModal(true); }}
                                className={cn("text-[11px] font-bold", Number(row.item.currentStock) <= Number(row.item.thresholdQty) ? "text-red-500" : "text-slate-500")}
                              >
                                {row.item.currentStock} {row.item.unit?.symbol}
                              </button>
                              {(row.quantity || 0) > 0 && (
                                <span className="text-[9px] text-blue-500 font-black">→{(Number(row.item.currentStock) + Number(row.quantity)).toFixed(1)}</span>
                              )}
                            </div>
                          ) : '—'}
                        </td>

                        <td className="px-2 py-2">
                          <input
                            type="number"
                            value={row.quantity || ''}
                            onChange={e => updateRow(idx, { quantity: Number(e.target.value) })}
                            className="w-full bg-[#0b0f17] border border-[#2a2d3e] rounded-lg px-2 py-1.5 text-xs text-right font-black focus:outline-none focus:border-blue-500/50"
                            placeholder="0"
                          />
                        </td>

                        <td className="px-2 py-2">
                          <input
                            type="number"
                            value={row.gstPercent}
                            onChange={e => updateRow(idx, { gstPercent: Number(e.target.value) })}
                            className="w-full bg-[#0b0f17] border border-[#2a2d3e] rounded-lg px-2 py-1.5 text-[10px] text-center font-bold text-slate-500 focus:outline-none"
                          />
                        </td>

                        <td className="px-4 py-2">
                          <input
                            type="number"
                            value={row.unitCost || ''}
                            onChange={e => updateRow(idx, { unitCost: Number(e.target.value) })}
                            className="w-full bg-[#0b0f17] border border-[#2a2d3e] rounded-lg px-2 py-1.5 text-xs text-right font-black text-blue-500 focus:outline-none"
                          />
                        </td>

                        <td className="px-4 py-2 text-right">
                          {(row.quantity || 0) > 0
                            ? <span className="font-bold text-xs text-slate-100">{indianFormat(rowCalculations[idx].item_total)}</span>
                            : <span className="text-slate-700">—</span>
                          }
                        </td>

                        <td className="px-2 py-2 text-center opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={() => removeRow(idx)} className="text-slate-600 hover:text-red-500 p-1">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}

                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-slate-700 text-xs font-bold uppercase">
                          Click an item above or add an empty row
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* NOTES BAR */}
              <div className="p-3 border-t border-[#2a2d3e] bg-[#1a1d27] grid grid-cols-3 gap-3 flex-shrink-0">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase">Order Date</label>
                  <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} className="w-full bg-[#0b0f17] border border-[#2a2d3e] rounded-lg px-2 py-1.5 text-[11px] focus:outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase">Expected Delivery</label>
                  <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} className="w-full bg-[#0b0f17] border border-[#2a2d3e] rounded-lg px-2 py-1.5 text-[11px] focus:outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase">Note</label>
                  <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Quality / Vendor note..." className="w-full bg-[#0b0f17] border border-[#2a2d3e] rounded-lg px-2 py-1.5 text-[11px] focus:outline-none" />
                </div>
              </div>
            </div>
          )}
        </main>

        {/* RIGHT PANEL: SUMMARY */}
        <aside className="w-52 border-l border-[#2a2d3e] bg-[#1a1d27] flex flex-col flex-shrink-0 overflow-y-auto">
          {selectedSupplier ? (
            <div className="flex flex-col h-full">
              <div className="p-4 border-b border-[#2a2d3e]">
                <h3 className="text-[10px] font-black text-slate-500 uppercase mb-3 text-center">Balance</h3>
                <div className="flex flex-col items-center bg-[#0b0f17] p-3 py-4 rounded-xl border border-[#2a2d3e]">
                  <span className="text-[9px] font-bold text-slate-600 mb-1">Previous Dues</span>
                  <span className={cn("text-lg font-black", Number(selectedSupplier.outstandingBalance) > 0 ? "text-red-500" : "text-green-500")}>
                    {indianFormat(selectedSupplier.outstandingBalance)}
                  </span>
                </div>
              </div>

              <div className="flex-1 p-4 space-y-5">
                <div className="space-y-3">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center border-b border-[#2a2d3e] pb-1">This Invoice</h3>
                  <div className="space-y-2.5">
                    <div className="flex justify-between text-[11px] font-bold text-slate-400"><span>Subtotal</span><span>{indianFormat(invoice.subtotal)}</span></div>
                    {invoice.discount > 0 && <div className="flex justify-between text-[11px] font-bold text-red-500"><span>Discount</span><span>- {indianFormat(invoice.discount)}</span></div>}
                    <div className="flex justify-between text-[10px] text-slate-500 italic"><span>CGST</span><span>{indianFormat(invoice.total_gst / 2)}</span></div>
                    <div className="flex justify-between text-[10px] text-slate-500 italic"><span>SGST</span><span>{indianFormat(invoice.total_gst / 2)}</span></div>
                    <div className="pt-2.5 border-t border-[#2a2d3e] flex justify-between items-center">
                      <span className="text-[12px] font-black text-slate-200">TOTAL</span>
                      <span className="text-[14px] font-black text-blue-500">{indianFormat(invoice.grand_total)}</span>
                    </div>
                  </div>
                </div>

                {rows.some(r => (r.quantity || 0) > 0) && (
                  <div className="space-y-3 pt-3">
                    <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest text-center border-b border-[#2a2d3e] pb-1">Preview</h3>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {rows.filter(r => (r.quantity || 0) > 0).map((r, i) => (
                        <div key={i} className="flex justify-between text-[9px] font-bold py-1 border-b border-white/5 truncate">
                          <span className="text-slate-400 truncate pr-2">{r.item?.name}</span>
                          <span className="text-blue-500">+{r.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 mt-auto bg-[#0b0f17]">
                <Button
                  disabled={!canPurchase || purchaseMutation.isPending}
                  onClick={() => { setPaidAmount(invoice.grand_total); setShowPayment(true); }}
                  className="w-full h-14 rounded-xl flex flex-col items-center justify-center bg-blue-600 hover:bg-blue-700 shadow-xl transition-all disabled:opacity-50"
                >
                  <span className="text-[9px] font-black text-blue-100 uppercase opacity-60 mb-0.5">
                    {rows.filter(r => (r.quantity || 0) > 0).length} ITEMS
                  </span>
                  <div className="text-lg font-black text-white flex items-center">
                    {indianFormat(invoice.grand_total)} <ArrowRight className="w-4 h-4 ml-2" />
                  </div>
                </Button>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-center p-4 text-[10px] text-slate-600 font-black italic uppercase opacity-40">
              Select Supplier
            </div>
          )}
        </aside>
      </div>

      {/* ─── PAYMENT MODAL ──────────────────────────────────────────────────── */}
      <Modal isOpen={showPayment} onClose={() => setShowPayment(false)} title="Confirm Purchase & Payment">
        <div className="space-y-6 max-w-sm mx-auto">
          <div className="p-5 bg-[#0b0f17] rounded-3xl border border-[#2a2d3e] space-y-4">
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs font-bold text-slate-500 uppercase"><span>Prev. Balance</span><span>{indianFormat(selectedSupplier?.outstandingBalance || 0)}</span></div>
              <div className="flex justify-between text-xs font-bold text-slate-500 uppercase"><span>Invoice Total</span><span>{indianFormat(invoice.grand_total)}</span></div>
              <div className="pt-3 border-t border-[#2a2d3e] flex justify-between items-center">
                <span className="text-sm font-black text-blue-400">TOTAL PAYABLE</span>
                <span className="text-xl font-black text-blue-500">{indianFormat(totalPayable)}</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Discount %</label>
                <Input type="number" value={globalDiscountPercent} onChange={e => { const p = Number(e.target.value || 0); setGlobalDiscountPercent(p); setGlobalDiscountAmount(Number(((baseSubtotal * p) / 100).toFixed(2))); }} className="h-10 bg-[#1a1d27]" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Discount (₹)</label>
                <Input type="number" value={globalDiscountAmount} onChange={e => { const a = Number(e.target.value || 0); setGlobalDiscountAmount(a); setGlobalDiscountPercent(baseSubtotal > 0 ? (a / baseSubtotal) * 100 : 0); }} className="h-10 bg-[#1a1d27]" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-500 ml-1">PAID AMOUNT (₹)</label>
              <Input type="number" value={paidAmount} onChange={e => setPaidAmount(Number(e.target.value))} className="h-16 text-3xl font-black bg-[#1a1d27] border-[#2a2d3e] text-blue-500 text-center rounded-2xl" />
            </div>

            <div className={cn("p-4 rounded-2xl flex flex-col items-center justify-center border transition-colors", newBalance > 0 ? "bg-red-500/10 border-red-500/30" : "bg-green-500/10 border-green-500/30")}>
              <span className="text-[10px] font-black text-slate-500 uppercase mb-1">New Balance</span>
              <span className={cn("text-2xl font-black", newBalance > 0 ? "text-red-500" : "text-green-500")}>{indianFormat(newBalance)}</span>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Payment Method</label>
              <div className="grid grid-cols-4 gap-1.5">
                {['Cash', 'UPI', 'Card', 'Credit'].map(m => (
                  <button key={m} onClick={() => setPaymentMethod(m)} className={cn("py-2 rounded-xl text-[10px] font-black uppercase border transition-all", paymentMethod === m ? "bg-blue-600 border-blue-500 text-white shadow-lg" : "bg-[#1a1d27] border-[#2a2d3e] text-slate-500 hover:text-slate-300")}>{m}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Ref # / UTR" value={paymentRef} onChange={e => setPaymentRef(e.target.value)} className="bg-[#1a1d27]" />
              <Input placeholder="Notes" value={paymentNote} onChange={e => setPaymentNote(e.target.value)} className="bg-[#1a1d27]" />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={() => setShowPayment(false)} variant="outline" className="flex-1 h-12 rounded-xl font-bold border-[#2a2d3e]">Cancel</Button>
            <Button onClick={() => purchaseMutation.mutate()} disabled={purchaseMutation.isPending} className="flex-[2] h-12 rounded-xl font-black bg-blue-600 hover:bg-blue-700 shadow-xl">
              {purchaseMutation.isPending ? 'Processing...' : 'Confirm Purchase'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── ADD MRP MODAL ──────────────────────────────────────────────────── */}
      <Modal isOpen={showAddMRP} onClose={() => setShowAddMRP(false)} title="Add MRP for Item">
        <div className="space-y-4 max-w-sm mx-auto">
          <div className="p-3 bg-[#0b0f17] rounded border border-[#2a2d3e] font-bold text-sm">
            {(allItems as InventoryItem[]).find(it => it.id === addMRPItemId)?.name || '—'}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500">MRP (Selling Price)</label>
              <Input type="number" value={addMRPMrp} onChange={e => setAddMRPMrp(Number(e.target.value))} className="bg-[#1a1d27]" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500">Purchase Rate</label>
              <Input type="number" value={addMRPPurchaseRate} onChange={e => setAddMRPPurchaseRate(Number(e.target.value))} className="bg-[#1a1d27]" />
            </div>
          </div>
          {addMRPMrp > 0 && addMRPPurchaseRate > 0 && (
            <div className="p-2 bg-green-500/10 border border-green-500/20 rounded text-[11px] text-green-400 font-bold">
              Profit: ₹{(addMRPMrp - addMRPPurchaseRate).toFixed(2)} ({(((addMRPMrp - addMRPPurchaseRate) / addMRPPurchaseRate) * 100).toFixed(1)}%)
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button onClick={() => setShowAddMRP(false)} variant="outline" className="flex-1">Cancel</Button>
            <Button onClick={async () => {
              try {
                if (!addMRPItemId || !selectedSupplierId) { alert('Select supplier and item'); return; }
                const profitPercent = addMRPPurchaseRate > 0
                  ? ((addMRPMrp - addMRPPurchaseRate) / addMRPPurchaseRate) * 100
                  : 0;
                await api.post(`/restaurant/inventory/suppliers/${selectedSupplierId}/items`, {
                  inventoryItemId: addMRPItemId, mrp: addMRPMrp,
                  purchaseRate: addMRPPurchaseRate, profitPercent
                });
                await reloadSupplierMRPs();
                setShowAddMRP(false);
                toast({ title: 'MRP added' });
              } catch (err: any) {
                alert('Failed: ' + (err?.response?.data?.error || err?.message));
              }
            }} className="flex-1">Add MRP</Button>
          </div>
        </div>
      </Modal>

      {/* ─── EDIT MRP MODAL ─────────────────────────────────────────────────── */}
      <Modal isOpen={showEditMRP} onClose={() => setShowEditMRP(false)} title="Edit MRP">
        <div className="space-y-4 max-w-sm mx-auto">
          {editMRPId && (() => {
            const mrpItem = supplierMRPs.find(m => m.id === editMRPId);
            if (!mrpItem) return null;
            return (
              <div className="space-y-4">
                <div className="p-3 bg-[#0b0f17] rounded border border-[#2a2d3e]">
                  <h3 className="font-bold text-sm text-white mb-1">{mrpItem.inventoryItem?.name}</h3>
                  <p className="text-[10px] text-slate-400">Purchase Rate: <strong>₹{mrpItem.purchaseRate}</strong> (fixed)</p>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400">New MRP (Selling Price)</label>
                  <Input type="number" value={editMRPValue} onChange={e => {
                    const v = Number(e.target.value || 0);
                    setEditMRPValue(v);
                    if (v > 0 && mrpItem.purchaseRate > 0) {
                      setEditProfitPercent(Math.round(((v - mrpItem.purchaseRate) / mrpItem.purchaseRate) * 1000) / 10);
                    }
                  }} className="bg-[#1a1d27]" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400">Profit %</label>
                  <Input type="number" value={editProfitPercent} onChange={e => {
                    const p = Number(e.target.value || 0);
                    setEditProfitPercent(p);
                    setEditMRPValue(Math.round(mrpItem.purchaseRate * (1 + p / 100) * 100) / 100);
                  }} className="bg-[#1a1d27]" />
                </div>
                {editMRPValue > 0 && (
                  <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded text-[11px] text-blue-400 font-bold">
                    New: MRP ₹{editMRPValue} · Profit ₹{(editMRPValue - mrpItem.purchaseRate).toFixed(2)} ({editProfitPercent.toFixed(1)}%)
                  </div>
                )}
                <div className="flex gap-2">
                  <Button onClick={() => setShowEditMRP(false)} variant="outline" className="flex-1">Cancel</Button>
                  <Button onClick={() => editMRPMutation.mutate()} disabled={editMRPMutation.isPending} className="flex-1 bg-green-600">
                    {editMRPMutation.isPending ? 'Updating...' : 'Update MRP'}
                  </Button>
                </div>
              </div>
            );
          })()}
        </div>
      </Modal>

      {/* ─── DELETE MRP MODAL ───────────────────────────────────────────────── */}
      <Modal isOpen={showDeleteMRPModal} onClose={() => setShowDeleteMRPModal(false)} title="Delete MRP">
        <div className="space-y-4 max-w-sm mx-auto">
          <div className="p-3 bg-[#0b0f17] rounded border border-[#2a2d3e]">
            <div className="text-[10px] text-slate-400">Item</div>
            <div className="font-bold">{(allItems as InventoryItem[]).find(it => it.id === deleteMRPItemId)?.name || '—'}</div>
          </div>
          <select
            value={deleteMRPSelectedId ?? ''}
            onChange={e => setDeleteMRPSelectedId(e.target.value ? Number(e.target.value) : null)}
            className="w-full bg-[#1a1d27] border border-[#2a2d3e] rounded px-2 py-1.5 text-sm"
          >
            <option value="">Select MRP to delete</option>
            {supplierMRPs.filter(m => m.inventoryItemId === deleteMRPItemId).map(m => (
              <option key={m.id} value={m.id}>MRP ₹{m.mrp} · Buy ₹{m.purchaseRate}</option>
            ))}
          </select>
          <div className="p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            This cannot be undone. Existing purchase orders remain unchanged.
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setShowDeleteMRPModal(false)} variant="outline" className="flex-1">Cancel</Button>
            <Button
              onClick={() => { if (deleteMRPSelectedId) deleteMRPMutation.mutate(deleteMRPSelectedId); }}
              disabled={!deleteMRPSelectedId || deleteMRPMutation.isPending}
              className="flex-1 bg-red-600"
            >
              {deleteMRPMutation.isPending ? 'Deleting...' : 'Delete MRP'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── THRESHOLD MODAL ────────────────────────────────────────────────── */}
      <Modal isOpen={showThresholdModal} onClose={() => setShowThresholdModal(false)} title="Set Stock Threshold">
        <div className="space-y-4 max-w-sm mx-auto">
          <div className="p-3 bg-[#0b0f17] rounded border border-[#2a2d3e] font-bold">
            {(allItems as InventoryItem[]).find(it => it.id === thresholdItemId)?.name || '—'}
          </div>
          <div>
            <label className="text-[10px] text-slate-500">Threshold Quantity (low stock warning)</label>
            <Input type="number" value={thresholdValue} onChange={e => setThresholdValue(Number(e.target.value))} className="bg-[#1a1d27]" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={() => setShowThresholdModal(false)} variant="outline" className="flex-1">Cancel</Button>
            <Button onClick={async () => {
              try {
                if (!thresholdItemId) return;
                await api.put(`/restaurant/inventory/items/${thresholdItemId}`, { thresholdQty: Number(thresholdValue) });
                qc.invalidateQueries({ queryKey: ['inv-items'] } as any);
                qc.invalidateQueries({ queryKey: ['inventory-summary'] } as any);
                setShowThresholdModal(false);
                toast({ title: 'Threshold updated' });
              } catch (err: any) {
                alert('Failed: ' + (err?.response?.data?.error || err?.message));
              }
            }} className="flex-1">Save</Button>
          </div>
        </div>
      </Modal>

      {/* ─── HISTORY MODAL ──────────────────────────────────────────────────── */}
      <Modal isOpen={showHistory} onClose={() => setShowHistory(false)} title={`History — ${selectedSupplier?.name}`}>
        <div className="space-y-4 max-h-[85vh] overflow-hidden flex flex-col">
          <div className="flex gap-2">
            <Button
              onClick={() => {
                const w = window.open('', '_blank', 'width=600,height=800');
                if (!w) return;
                w.document.write(`<html><head><title>History</title><style>body{font-family:Arial;padding:20px;font-size:13px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}th{background:#f5f5f5;font-weight:bold}</style></head><body onload="window.print();window.close()"><h2>Payment History — ${selectedSupplier?.name}</h2></body></html>`);
                w.document.close();
              }}
              className="flex-1 h-10 rounded-lg font-bold bg-blue-600 hover:bg-blue-700 text-sm flex items-center justify-center gap-2"
            >
              <Printer className="w-4 h-4" /> Print
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 bg-[#1a1d27] rounded-3xl border border-[#2a2d3e] flex flex-col items-center">
              <span className="text-[9px] font-black text-slate-500 uppercase">Orders</span>
              <span className="text-lg font-black">{selectedSupplier?.totalOrders || 0}</span>
            </div>
            <div className="p-4 bg-[#1a1d27] rounded-3xl border border-[#2a2d3e] flex flex-col items-center">
              <span className="text-[9px] font-black text-slate-500 uppercase">Total Buy</span>
              <span className="text-lg font-black text-blue-500">{indianFormat((suppliers as Supplier[]).find(s => s.id === selectedSupplierId)?.totalOrderAmount || 0)}</span>
            </div>
            <div className="p-4 bg-red-500/5 rounded-3xl border border-red-500/20 flex flex-col items-center">
              <span className="text-[9px] font-black text-red-500 uppercase opacity-50">Outstanding</span>
              <span className="text-lg font-black text-red-500">{indianFormat(selectedSupplier?.outstandingBalance || 0)}</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-1 space-y-2.5">
            {selectedSupplierId && (
              <HistoryList
                supplierId={selectedSupplierId}
                poPaymentsCache={poPaymentsCache}
                setPoPaymentsCache={setPoPaymentsCache}
                expandedPOId={expandedPOId}
                setExpandedPOId={setExpandedPOId}
              />
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── HISTORY SUB-COMPONENTS ───────────────────────────────────────────────────

function HistoryList({ supplierId, poPaymentsCache, setPoPaymentsCache, expandedPOId, setExpandedPOId }: any) {
  const { data: pos = [], isLoading } = useQuery({
    queryKey: ['inv-pos', supplierId],
    queryFn: () => api.get(`/restaurant/inventory/purchase-orders?supplierId=${supplierId}`).then(r => r.data.data),
  });

  if (isLoading) return (
    <div className="text-center py-20 text-[10px] font-black animate-pulse opacity-20">LOADING...</div>
  );

  return (
    <div className="space-y-3 pb-4">
      {pos.length === 0 && (
        <div className="text-center py-20 text-slate-600 font-bold italic opacity-40 uppercase text-xs">No records</div>
      )}
      {pos.map((po: any) => (
        <div key={po.id} className="bg-[#1a1d27] border border-[#2a2d3e] rounded-3xl overflow-hidden">
          <button
            onClick={() => setExpandedPOId(expandedPOId === po.id ? null : po.id)}
            className="w-full flex items-center justify-between p-4 hover:bg-[#1e2235] text-left transition-all"
          >
            <div className="flex items-center gap-3">
              <div className={cn("w-2.5 h-2.5 rounded-full", po.status === 'received' ? "bg-green-500" : "bg-orange-500")} />
              <div>
                <div className="font-black text-sm text-slate-100">{po.orderNumber}</div>
                <div className="text-[10px] text-slate-500 font-bold uppercase">{formatDate(po.createdAt)} · {po.items?.length} items</div>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-[9px] text-slate-600 uppercase font-black">Total</div>
                <div className="font-black text-sm">₹{Number(po.total).toLocaleString()}</div>
              </div>
              <div className="text-right">
                <div className="text-[9px] text-slate-600 uppercase font-black">Due</div>
                <div className={cn("font-black text-sm", (po.total - (po.paid || 0)) > 0 ? "text-red-500" : "text-green-500")}>
                  ₹{(po.total - (po.paid || 0)).toLocaleString()}
                </div>
              </div>
              <ChevronRight className={cn("w-4 h-4 text-slate-700 transition-transform", expandedPOId === po.id ? "rotate-90" : "")} />
            </div>
          </button>
          <AnimatePresence>
            {expandedPOId === po.id && (
              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden bg-[#0b0f17] border-t border-[#2a2d3e]">
                <div className="p-5 grid grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black uppercase text-slate-600 pl-2 border-l-2 border-blue-500">ITEMS</h4>
                    <div className="space-y-1.5">
                      {po.items?.map((it: any, k: number) => (
                        <div key={k} className="flex justify-between text-[11px] py-1 px-3 rounded-xl bg-[#1a1d27]/40">
                          <span className="font-bold text-slate-400">{it.inventoryItem?.name} <span className="text-slate-600">× {it.quantity}</span></span>
                          <span className="font-black italic">₹{Number(it.total * (1 + (it.taxPercent || 0) / 100)).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black uppercase text-slate-600 pl-2 border-l-2 border-purple-500">PAYMENTS</h4>
                    <PaymentsLog poId={po.id} cache={poPaymentsCache} setCache={setPoPaymentsCache} />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

function PaymentsLog({ poId, cache, setCache }: any) {
  useEffect(() => {
    if (!cache[poId]) {
      api.get(`/restaurant/inventory/purchase-orders/${poId}/payments`)
        .then(r => setCache((p: any) => ({ ...p, [poId]: r.data.data })));
    }
  }, [poId]);

  const pms = cache[poId] || [];
  return (
    <div className="space-y-1.5">
      {pms.length === 0 && <div className="text-[10px] text-slate-700 italic px-2">No payments</div>}
      {pms.map((p: any) => (
        <div key={p.id} className="flex justify-between items-center bg-[#1a1d27]/40 p-2.5 rounded-xl border border-white/5">
          <div className="flex items-center gap-2.5">
            <span className={cn("px-1.5 py-0.5 rounded text-[8px] font-black uppercase",
              p.method === 'Cash' ? "bg-green-500/20 text-green-400" : p.method === 'UPI' ? "bg-purple-500/20 text-purple-400" : "bg-blue-500/20 text-blue-400"
            )}>{p.method}</span>
            <div>
              <div className="text-[10px] font-bold text-slate-500">{formatDate(p.paymentDate || p.createdAt)}</div>
              {p.reference && <div className="text-[8px] text-slate-600">#{p.reference}</div>}
            </div>
          </div>
          <span className="font-black text-xs text-white">₹{Number(p.amount).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}