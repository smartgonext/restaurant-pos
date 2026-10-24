import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, Trash2, Plus, ChevronRight, Printer, History, Truck,
  AlertCircle, ArrowRight, User, CheckCircle2, X, FileText,
  IndianRupee, Package, RotateCcw, ChevronDown, ShoppingCart,
  TrendingUp, Clock, CreditCard, BadgeIndianRupee, Banknote,
  Smartphone, CheckCircle, Edit3, Eye, Copy, Download
} from 'lucide-react';
import api from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '@/hooks/useSocket';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface InventoryUnit { id: number; name: string; symbol: string; }
interface InventoryCategory { id: number; name: string; }
interface InventoryItemMRP {
  id: number; inventoryItemId: number; supplierId?: number;
  mrp: number; purchaseRate: number; profitPercent: number;
  isActive: boolean; createdAt: string;
}
interface InventoryItem {
  id: number; name: string; image?: string;
  currentStock: number; thresholdQty: number; costPerUnit: number;
  unit?: InventoryUnit; category?: InventoryCategory;
  inventoryMRPs?: InventoryItemMRP[];
}
interface Supplier {
  id: number; name: string; contactPerson?: string; phone?: string;
  email?: string; address?: string; outstandingBalance: number;
  totalOrders?: number; totalOrderAmount?: number;
}
interface SupplierMRPItem {
  id: number; inventoryItemId: number; mrp: number;
  purchaseRate: number; profitPercent: number; isActive: boolean;
  inventoryItem: InventoryItem;
  sellingPrice?: number;
}
interface OrderRow {
  tempId: string;
  inventoryItemId?: number;
  item?: InventoryItem;
  quantity: number;
  unitCost: number;
  taxPercent: number;
  discountPercent: number;
  mrp?: number;
  lastPurchaseRate?: number;
  inventoryItemMRPId?: number;
  availableMRPs?: SupplierMRPItem[];
}
interface POPayment {
  id: number; amount: number; method: string; reference?: string;
  notes?: string; paymentDate?: string; createdAt: string;
}
interface PurchaseOrderItem {
  id: number; inventoryItemId: number; quantity: number;
  unitCost: number; total: number; taxPercent?: number; discountPercent?: number;
  inventoryItem?: InventoryItem; inventoryItemMRP?: InventoryItemMRP;
}
interface PurchaseOrder {
  id: number; orderNumber: string; status: string; total: number;
  createdAt: string; orderDate?: string; receivedAt?: string;
  note?: string; supplierId: number; supplier?: Supplier;
  items: PurchaseOrderItem[]; payments: POPayment[];
  totalPaid?: number; balance?: number;
}

// ═══════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════

const inr = (amount: number | string | null | undefined): string => {
  const num = Number(amount ?? 0);
  if (isNaN(num)) return '₹0.00';
  return num.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const today = () => new Date().toISOString().split('T')[0];
const genId = () => Math.random().toString(36).substr(2, 9);

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function PurchasesStock() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket) return;
    const invalidateAll = () => {
      qc.invalidateQueries({ queryKey: ['inv-pos'] } as any);
      qc.invalidateQueries({ queryKey: ['inv-items'] } as any);
      qc.invalidateQueries({ queryKey: ['inv-suppliers'] } as any);
    };

    socket.on('purchaseOrder.created', invalidateAll);
    socket.on('purchaseOrder.received', invalidateAll);
    socket.on('purchaseOrder.payment', invalidateAll);
    socket.on('inventory.item.updated', () => qc.invalidateQueries({ queryKey: ['inv-items'] } as any));
    socket.on('supplier.updated', () => qc.invalidateQueries({ queryKey: ['inv-suppliers'] } as any));

    return () => {
      socket.off('purchaseOrder.created', invalidateAll);
      socket.off('purchaseOrder.received', invalidateAll);
      socket.off('purchaseOrder.payment', invalidateAll);
      socket.off('inventory.item.updated', () => qc.invalidateQueries({ queryKey: ['inv-items'] } as any));
      socket.off('supplier.updated', () => qc.invalidateQueries({ queryKey: ['inv-suppliers'] } as any));
    };
  }, [socket, qc]);

  // ── State ────────────────────────────────────────────────────
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [showAllItems, setShowAllItems] = useState(false);
  const [orderDate, setOrderDate] = useState(today());
  const [expectedDate, setExpectedDate] = useState('');
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [supplierMRPs, setSupplierMRPs] = useState<SupplierMRPItem[]>([]);

  // Payment modal state
  const [showPayment, setShowPayment] = useState(false);
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Card' | 'Credit' | 'Multiple'>('Cash');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  // History modal state
  const [showHistory, setShowHistory] = useState(false);
  const [expandedPOId, setExpandedPOId] = useState<number | null>(null);

  // Last saved PO (for printing)
  const [lastPO, setLastPO] = useState<PurchaseOrder | null>(null);
  const [lastPaymentData, setLastPaymentData] = useState<POPayment | null>(null);

  // Assign items modal
  const [showAssignItems, setShowAssignItems] = useState(false);
  const [assignSearch, setAssignSearch] = useState('');
  const [assignRates, setAssignRates] = useState<Record<number, { purchaseRate: string; mrp: string }>>({});

  // Edit MRP modal state
  const [showEditMRP, setShowEditMRP] = useState(false);
  const [editMRPId, setEditMRPId] = useState<number | null>(null);
  const [editMRPValue, setEditMRPValue] = useState(0);
  const [editProfitPercent, setEditProfitPercent] = useState(0);
  const [latestMRP, setLatestMRP] = useState<SupplierMRPItem | null>(null);

  // ── Queries ──────────────────────────────────────────────────
  const { data: suppliers = [], isLoading: suppliersLoading } = useQuery<Supplier[]>({
    queryKey: ['inv-suppliers'],
    queryFn: () => api.get('/restaurant/inventory/suppliers').then(r => r.data.data)
  });

  const { data: allItems = [], isLoading: itemsLoading } = useQuery<InventoryItem[]>({
    queryKey: ['inv-items'],
    queryFn: () => api.get('/restaurant/inventory/items').then(r => r.data.data)
  });

  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: ['supplier-history', selectedSupplierId],
    queryFn: () => selectedSupplierId
      ? api.get(`/restaurant/inventory/suppliers/${selectedSupplierId}/payment-history`).then(r => r.data.data)
      : null,
    enabled: !!selectedSupplierId && showHistory
  });

  // ── Derived values ───────────────────────────────────────────
  const selectedSupplier = useMemo(
    () => suppliers.find(s => s.id === selectedSupplierId) || null,
    [suppliers, selectedSupplierId]
  );

  const filteredSuppliers = useMemo(
    () => suppliers.filter(s =>
      s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
      (s.contactPerson || '').toLowerCase().includes(supplierSearch.toLowerCase())
    ),
    [suppliers, supplierSearch]
  );

  const itemChips = useMemo(() => {
    const base = showAllItems ? allItems : supplierMRPs.map(m => m.inventoryItem).filter(Boolean);
    return base.filter(it => it && it.name.toLowerCase().includes(itemSearch.toLowerCase()));
  }, [showAllItems, allItems, supplierMRPs, itemSearch]);

  const rowCalcs = useMemo(() => rows.map(r => {
    const qty = Number(r.quantity) || 0;
    const rate = Number(r.unitCost) || 0;
    const base = qty * rate;
    const disc = base * (Number(r.discountPercent) / 100);
    const afterDisc = base - disc;
    const gst = afterDisc * (Number(r.taxPercent) / 100);
    const total = afterDisc + gst;
    return { base, disc, afterDisc, gst, total };
  }), [rows]);

  const invoice = useMemo(() => {
    const subtotal = rowCalcs.reduce((s, r) => s + r.base, 0);
    const discount = rowCalcs.reduce((s, r) => s + r.disc, 0);
    const totalGst = rowCalcs.reduce((s, r) => s + r.gst, 0);
    const grandTotal = rowCalcs.reduce((s, r) => s + r.total, 0);
    return { subtotal, discount, totalGst, grandTotal };
  }, [rowCalcs]);

  const totalPayable = Number(selectedSupplier?.outstandingBalance || 0) + invoice.grandTotal;
  const netBalance = totalPayable - paidAmount;
  const canPurchase = rows.some(r => r.inventoryItemId && r.quantity > 0) && !!selectedSupplierId;

  // ── Effects ──────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedSupplierId) {
      setRows([]);
      setSupplierMRPs([]);
      return;
    }
    // Load supplier-linked items (MRPs)
    api.get(`/restaurant/inventory/suppliers/${selectedSupplierId}/items`).then(res => {
      const mrps: SupplierMRPItem[] = res.data.data || [];
      setSupplierMRPs(mrps);
      // Set latest MRP (most recently added, usually last in list)
      if (mrps.length > 0) {
        setLatestMRP(mrps[mrps.length - 1]);
      }
      // Auto-populate rows with unique supplier items (qty 0).
      // Group MRPs by inventoryItemId so each item appears only once with nested MRPs.
      const grouped = new Map<number, SupplierMRPItem[]>();
      for (const m of mrps) {
        const arr = grouped.get(m.inventoryItemId) || [];
        arr.push(m);
        grouped.set(m.inventoryItemId, arr);
      }

      const autoRows: OrderRow[] = Array.from(grouped.entries()).slice(0, 12).map(([inventoryItemId, arr]) => {
        // pick the latest MRP for this item as the selected default (newest-last)
        const primary = arr[arr.length - 1] ?? arr[0];
        return {
          tempId: genId(),
          inventoryItemId,
          item: primary.inventoryItem,
          quantity: 0,
          unitCost: Number(primary.purchaseRate || 0),
          taxPercent: 5,
          discountPercent: 0,
          mrp: Number((primary as any).sellingPrice ?? primary.mrp ?? 0),
          lastPurchaseRate: Number(primary.purchaseRate || 0),
          inventoryItemMRPId: primary.id,
          availableMRPs: arr
        } as OrderRow;
      });
      setRows(autoRows);
      setNote('');
      setLastPO(null);
      setLastPaymentData(null);
    }).catch(() => {
      setSupplierMRPs([]);
      setLatestMRP(null);
      setRows([{ tempId: genId(), quantity: 0, unitCost: 0, taxPercent: 5, discountPercent: 0 }]);
    });
  }, [selectedSupplierId]);

  // ── Row actions ──────────────────────────────────────────────
  const addEmptyRow = useCallback(() => {
    setRows(prev => [...prev, { tempId: genId(), quantity: 0, unitCost: 0, taxPercent: 5, discountPercent: 0 }]);
  }, []);

  const removeRow = useCallback((idx: number) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const updateRow = useCallback((idx: number, updates: Partial<OrderRow>) => {
    setRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...updates };
      if (updates.inventoryItemId !== undefined) {
        const item = allItems.find(it => it.id === updates.inventoryItemId);
        // collect MRPs for this item from supplier list
        const itemMRPs = supplierMRPs.filter(m => m.inventoryItemId === updates.inventoryItemId);
        const primary = itemMRPs[itemMRPs.length - 1] ?? itemMRPs[0];
        next[idx].item = item;
        next[idx].availableMRPs = itemMRPs;
        next[idx].unitCost = Number(primary?.purchaseRate || item?.costPerUnit || 0);
        // show computed selling price when present
        next[idx].mrp = Number((primary as any)?.sellingPrice ?? primary?.mrp ?? 0);
        next[idx].lastPurchaseRate = Number(primary?.purchaseRate || item?.costPerUnit || 0);
        next[idx].inventoryItemMRPId = primary?.id;
      }
      return next;
    });
  }, [allItems, supplierMRPs]);

  const handleChipClick = useCallback((item: InventoryItem) => {
    const existingIdx = rows.findIndex(r => r.inventoryItemId === item.id);
    if (existingIdx > -1) {
      updateRow(existingIdx, { quantity: rows[existingIdx].quantity + 1 });
    } else {
      const itemMRPs = supplierMRPs.filter(m => m.inventoryItemId === item.id);
      const primary = itemMRPs[itemMRPs.length - 1] ?? itemMRPs[0];
      setRows(prev => [...prev, {
        tempId: genId(),
        inventoryItemId: item.id,
        item,
        quantity: 1,
        unitCost: Number(primary?.purchaseRate || item.costPerUnit || 0),
        taxPercent: 5,
        discountPercent: 0,
        mrp: Number((primary as any)?.sellingPrice ?? primary?.mrp ?? 0),
        lastPurchaseRate: Number(primary?.purchaseRate || item.costPerUnit || 0),
        inventoryItemMRPId: primary?.id,
        availableMRPs: itemMRPs
      }]);
    }
  }, [rows, supplierMRPs, updateRow]);

  // ── Purchase mutation ────────────────────────────────────────
  // ── Purchase mutation ────────────────────────────────────────
  const purchaseMutation = useMutation({
    mutationFn: async () => {
      const validItems = rows.filter(r => r.inventoryItemId && r.quantity > 0);
      if (!validItems.length) throw new Error('No items with quantity > 0');

      const payload = {
        supplierId: selectedSupplierId!,
        items: validItems.map(r => ({
          inventoryItemId: r.inventoryItemId!,
          quantity: r.quantity,
          unitCost: r.unitCost,
          taxPercent: r.taxPercent,
          discountPercent: r.discountPercent,
          inventoryItemMRPId: (r as any).inventoryItemMRPId ?? undefined,
          mrp: r.mrp || undefined
        })),
        orderDate,
        expectedDate: expectedDate || undefined,
        note: note || undefined,
        paidAmount: paidAmount > 0 ? paidAmount : undefined,
        paymentMethod,
        paymentReference: paymentRef || undefined,
        paymentNotes: paymentNotes || undefined,
        autoReceive: true
      };

      const res = await api.post('/restaurant/inventory/purchase-orders', payload);
      return res.data.data;
    },
    onSuccess: (data) => {
      setLastPO(data.purchaseOrder);
      setLastPaymentData(data.payment);
      qc.invalidateQueries({ queryKey: ['inv-suppliers'] });
      qc.invalidateQueries({ queryKey: ['inv-items'] });
      qc.invalidateQueries({ queryKey: ['supplier-history', selectedSupplierId] });
      // Reset quantities to 0, keep items in the list
      setRows(prev => prev.map(r => ({ ...r, quantity: 0 })));
      setShowPayment(false);
      setPaidAmount(0);
      setPaymentRef('');
      setPaymentNotes('');
      toast({ title: '✅ Purchase completed', description: `${data.stockUpdated ? 'Stock updated. ' : ''}PO ${data.purchaseOrder?.orderNumber} saved.` });
    },
    onError: (err: any) => {
      toast({ title: 'Purchase failed', description: err.response?.data?.error || err.message, variant: 'destructive' });
    }
  });

  // ── Edit MRP mutation ────────────────────────────────────────
  const editMRPMutation = useMutation({
    mutationFn: async () => {
      if (!editMRPId || !selectedSupplierId) throw new Error('Missing MRP ID or supplier');
      
      // Calculate purchase rate from profit percent
      const profitPercent = editProfitPercent;
      const purchaseRate = Number((editMRPValue / (1 + profitPercent / 100)).toFixed(2));

      // Backend does not expose PUT /suppliers/:id/mrp/:id — create a new MRP for the supplier+item instead
      const mrpObj = supplierMRPs.find(m => m.id === editMRPId);
      if (!mrpObj) throw new Error('MRP not found');
      const res = await api.post(`/restaurant/inventory/suppliers/${selectedSupplierId}/items`, {
        inventoryItemId: mrpObj.inventoryItemId,
        mrp: editMRPValue,
        purchaseRate,
        profitPercent
      });
      return res.data.data;
    },
    onSuccess: () => {
      if (selectedSupplierId) {
        api.get(`/restaurant/inventory/suppliers/${selectedSupplierId}/items`).then(res => {
          const mrps: SupplierMRPItem[] = res.data.data || [];
          setSupplierMRPs(mrps);
          if (mrps.length > 0) setLatestMRP(mrps[mrps.length - 1]);
        });
      }
      setShowEditMRP(false);
      setEditMRPId(null);
      toast({ title: 'MRP updated successfully' });
    },
    onError: (err: any) => {
      toast({ title: 'Failed to update MRP', description: err.response?.data?.error || err.message, variant: 'destructive' });
    }
  });

  // ── Delete MRP mutation ──────────────────────────────────────
  const deleteMRPMutation = useMutation({
    mutationFn: async (mrpId: number) => {
      if (!selectedSupplierId) throw new Error('Missing supplier ID');
      
      // Use DELETE /mrps/:id which soft-deactivates the MRP
      const res = await api.delete(`/restaurant/inventory/mrps/${mrpId}`);
      return res.data.data;
    },
    onSuccess: () => {
      if (selectedSupplierId) {
        api.get(`/restaurant/inventory/suppliers/${selectedSupplierId}/items`).then(res => {
          const mrps: SupplierMRPItem[] = res.data.data || [];
          setSupplierMRPs(mrps);
          if (mrps.length > 0) setLatestMRP(mrps[mrps.length - 1]);
        });
      }
      toast({ title: 'MRP deleted successfully' });
    },
    onError: (err: any) => {
      toast({ title: 'Failed to delete MRP', description: err.response?.data?.error || err.message, variant: 'destructive' });
    }
  });

  // ── Print receipt ────────────────────────────────────────────
  const printReceipt = () => {
    if (!lastPO || !selectedSupplier) return;
    const w = window.open('', '_blank', 'width=420,height=700');
    if (!w) return;
    const itemsHtml = (lastPO.items || []).map(it => `
      <tr>
        <td style="padding:4px 8px;border-bottom:1px solid #eee;">${it.inventoryItem?.name || 'Item'}</td>
        <td style="padding:4px 8px;text-align:center;border-bottom:1px solid #eee;">${it.quantity} ${it.inventoryItem?.unit?.symbol || ''}</td>
        <td style="padding:4px 8px;text-align:right;border-bottom:1px solid #eee;">${inr(it.unitCost)}</td>
        <td style="padding:4px 8px;text-align:right;border-bottom:1px solid #eee;font-weight:600;">${inr(it.total)}</td>
      </tr>
    `).join('');
    w.document.write(`
      <html><head><title>Purchase Invoice</title>
      <style>
        body{font-family:Arial,sans-serif;padding:20px;max-width:420px;color:#111;font-size:13px}
        h2{text-align:center;margin:0 0 4px;font-size:18px}
        .sub{text-align:center;color:#666;margin-bottom:12px;font-size:12px}
        table{width:100%;border-collapse:collapse}
        .total-row td{font-weight:bold;font-size:15px;padding:6px 8px}
        .divider{border:none;border-top:1px dashed #bbb;margin:10px 0}
        .footer{text-align:center;font-size:11px;color:#888;margin-top:16px}
        @media print{body{padding:0}}
      </style></head>
      <body onload="window.print();window.close()">
        <h2>PURCHASE INVOICE</h2>
        <div class="sub">${selectedSupplier.name}${selectedSupplier.phone ? ' · ' + selectedSupplier.phone : ''}</div>
        <hr class="divider"/>
        <table>
          <tr>
            <td><b>Invoice#</b></td><td colspan="3" style="text-align:right">${lastPO.orderNumber}</td>
          </tr>
          <tr>
            <td><b>Date</b></td><td colspan="3" style="text-align:right">${formatDate(lastPO.createdAt)}</td>
          </tr>
        </table>
        <hr class="divider"/>
        <table>
          <thead>
            <tr style="background:#f5f5f5">
              <th style="padding:4px 8px;text-align:left">Item</th>
              <th style="padding:4px 8px;text-align:center">Qty</th>
              <th style="padding:4px 8px;text-align:right">Rate</th>
              <th style="padding:4px 8px;text-align:right">Amount</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <hr class="divider"/>
        <table>
          <tr><td>Subtotal</td><td style="text-align:right">${inr(invoice.subtotal)}</td></tr>
          ${invoice.discount > 0 ? `<tr><td>Discount</td><td style="text-align:right;color:red">- ${inr(invoice.discount)}</td></tr>` : ''}
          <tr><td>CGST</td><td style="text-align:right">${inr(invoice.totalGst / 2)}</td></tr>
          <tr><td>SGST</td><td style="text-align:right">${inr(invoice.totalGst / 2)}</td></tr>
          <tr class="total-row"><td>Grand Total</td><td style="text-align:right">${inr(invoice.grandTotal)}</td></tr>
        </table>
        <hr class="divider"/>
        <table>
          <tr><td>Previous Balance</td><td style="text-align:right">${inr(selectedSupplier.outstandingBalance - invoice.grandTotal)}</td></tr>
          ${lastPaymentData ? `<tr><td>Paid (${lastPaymentData.method}${lastPaymentData.reference ? ' · ' + lastPaymentData.reference : ''})</td><td style="text-align:right;color:green">${inr(lastPaymentData.amount)}</td></tr>` : ''}
          <tr class="total-row"><td style="color:${Number(selectedSupplier?.outstandingBalance || 0) > 0 ? 'red' : 'green'}">Balance Due</td><td style="text-align:right;color:${Number(selectedSupplier?.outstandingBalance || 0) > 0 ? 'red' : 'green'}">${inr(selectedSupplier?.outstandingBalance || 0)}</td></tr>
        </table>
        <div class="footer">SMARTGONEXT · Thank you for your business</div>
      </body></html>
    `);
    w.document.close();
  };

  // ── Duplicate PO ─────────────────────────────────────────────
  const handleDuplicatePO = (po: PurchaseOrder) => {
    if (!po) return;
    const newRows: OrderRow[] = (po.items || []).map(it => ({
      tempId: genId(),
      inventoryItemId: it.inventoryItemId,
      item: it.inventoryItem,
      quantity: Number(it.quantity || 0),
      unitCost: Number(it.unitCost || 0),
      taxPercent: Number(it.taxPercent || 5),
      discountPercent: Number(it.discountPercent || 0),
      mrp: it.inventoryItemMRP ? Number((it.inventoryItemMRP as any).sellingPrice ?? it.inventoryItemMRP.mrp) : 0,
      inventoryItemMRPId: it.inventoryItemMRP ? it.inventoryItemMRP.id : undefined
    }));
    setRows(newRows.length ? newRows : [{ tempId: genId(), quantity: 0, unitCost: 0, taxPercent: 5, discountPercent: 0 }]);
    setNote(po.note || '');
    setShowHistory(false);
    toast({ title: 'PO duplicated', description: 'Items loaded. Edit quantities and purchase.' });
  };

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col h-screen bg-bg-base text-text-primary overflow-hidden">

      {/* ── TOP BAR ─────────────────────────────────────────────── */}
      <div className="h-14 border-b border-border px-6 flex items-center justify-between bg-bg-primary shadow-sm z-20 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <ShoppingCart className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight uppercase leading-none">Purchase & Stock</h1>
            <p className="text-[10px] text-slate-500 mt-0.5">Purchase = Stock update · One page · All in one</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastPO && (
            <Button onClick={printReceipt} size="sm" className="h-8 gap-1.5 bg-green-600 hover:bg-green-700 text-xs font-bold px-3">
              <Printer className="w-3.5 h-3.5" /> Print Bill
            </Button>
          )}
          {selectedSupplierId && (
            <>
              <Button onClick={() => { setShowHistory(true); refetchHistory(); }} variant="outline" size="sm" className="h-8 gap-1.5 border-slate-700 text-slate-300 text-xs px-3">
                <History className="w-3.5 h-3.5" /> Payment History
              </Button>
              <Button onClick={() => setShowAssignItems(true)} variant="outline" size="sm" className="h-8 gap-1.5 border-slate-700 text-slate-300 text-xs px-3">
                <Package className="w-3.5 h-3.5" /> Assign Items
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── THREE PANEL LAYOUT ──────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT PANEL: SUPPLIER LIST */}
        <aside className="w-60 border-r border-border bg-bg-primary flex flex-col flex-shrink-0">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
              <input
                type="text"
                placeholder="Search vendor..."
                value={supplierSearch}
                onChange={e => setSupplierSearch(e.target.value)}
                className="w-full bg-bg-tertiary border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-white placeholder:text-slate-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {suppliersLoading && <p className="text-center py-4 text-xs text-slate-500 animate-pulse">Loading...</p>}
            {filteredSuppliers.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedSupplierId(s.id === selectedSupplierId ? null : s.id)}
                className={cn(
                  'w-full text-left p-3 rounded-xl border transition-all',
                  selectedSupplierId === s.id
                    ? 'bg-blue-600 border-blue-500 shadow-lg shadow-blue-500/20'
                    : 'bg-bg-tertiary border-slate-800 hover:border-slate-600 hover:bg-bg-hover'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn('font-bold text-xs truncate', selectedSupplierId === s.id ? 'text-white' : 'text-slate-200')}>{s.name}</span>
                  {selectedSupplierId === s.id && <CheckCircle2 className="w-3.5 h-3.5 text-white flex-shrink-0" />}
                </div>
                {s.contactPerson && (
                  <p className={cn('text-[10px] mt-0.5 truncate', selectedSupplierId === s.id ? 'text-blue-100/70' : 'text-slate-500')}>{s.contactPerson}</p>
                )}
                <div className="flex items-center justify-between mt-1.5">
                  <span className={cn('text-[9px] font-black uppercase', selectedSupplierId === s.id ? 'text-blue-100/60' : 'text-slate-500')}>
                    {s.totalOrders || 0} orders
                  </span>
                  <span className={cn(
                    'text-[9px] font-black px-1.5 py-0.5 rounded uppercase',
                    Number(s.outstandingBalance) > 0
                      ? (selectedSupplierId === s.id ? 'bg-white/20 text-white' : 'bg-red-500/15 text-red-400')
                      : (selectedSupplierId === s.id ? 'bg-white/20 text-white' : 'bg-green-500/15 text-green-400')
                  )}>
                    {Number(s.outstandingBalance) > 0 ? inr(s.outstandingBalance) : 'CLEAR'}
                  </span>
                </div>
              </button>
            ))}
            {!suppliersLoading && filteredSuppliers.length === 0 && (
              <p className="text-center py-6 text-xs text-slate-600 italic">No vendors found</p>
            )}
          </div>

          {selectedSupplier && (
            <div className="p-3 bg-bg-elevated border-t border-border space-y-2 flex-shrink-0">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Total purchases</span>
                <span className="font-bold text-slate-300">{inr(selectedSupplier.totalOrderAmount || 0)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500">Outstanding</span>
                <span className={cn('text-sm font-black', Number(selectedSupplier.outstandingBalance) > 0 ? 'text-red-400' : 'text-green-400')}>
                  {inr(selectedSupplier.outstandingBalance)}
                </span>
              </div>
            </div>
          )}
        </aside>

        {/* CENTER PANEL: ORDER WORKSPACE */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          {!selectedSupplierId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-4 opacity-40">
              <Truck className="w-16 h-16" />
              <p className="text-base font-bold">Select a supplier to begin purchasing</p>
              <p className="text-xs">Previously purchased items will auto-load</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">

              {/* TOOLBAR */}
              <div className="px-4 py-2.5 border-b border-border bg-bg-primary/50 flex items-center gap-3 flex-shrink-0">
                <h3 className="font-black text-xs uppercase text-blue-400 tracking-tighter flex-shrink-0">
                  {selectedSupplier?.name}
                </h3>
                <div className="h-3.5 w-px bg-slate-800" />
                <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800 flex-shrink-0">
                  <button
                    onClick={() => setShowAllItems(false)}
                    className={cn('px-3 py-1 text-[9px] font-black uppercase rounded-md transition-all', !showAllItems ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300')}
                  >Supplier Items</button>
                  <button
                    onClick={() => setShowAllItems(true)}
                    className={cn('px-3 py-1 text-[9px] font-black uppercase rounded-md transition-all', showAllItems ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300')}
                  >All Items</button>
                </div>
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search items..."
                    value={itemSearch}
                    onChange={e => setItemSearch(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-7 pr-3 py-1.5 text-xs text-white"
                  />
                </div>
                <Button onClick={addEmptyRow} variant="outline" size="sm" className="h-7 gap-1 border-slate-800 text-[9px] font-black uppercase flex-shrink-0 px-2.5">
                  <Plus className="w-3 h-3" /> Row
                </Button>
              </div>

              {/* ITEM CHIPS */}
              <div className="px-4 py-2.5 border-b border-border bg-bg-tertiary/30 flex flex-wrap gap-1.5 max-h-28 overflow-y-auto flex-shrink-0">
                {itemChips.length === 0 && !showAllItems && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 italic">
                    <AlertCircle className="w-3.5 h-3.5" />
                    No items assigned to this supplier yet.
                    <button onClick={() => setShowAssignItems(true)} className="text-blue-400 underline font-bold">Assign items</button>
                  </div>
                )}
                {(itemChips as InventoryItem[]).map(it => {
                  if (!it) return null;
                  const isLow = Number(it.currentStock) <= Number(it.thresholdQty);
                  const inCartQty = rows.filter(r => r.inventoryItemId === it.id).reduce((acc, r) => acc + Number(r.quantity), 0);
                  return (
                    <button
                      key={it.id}
                      onClick={() => handleChipClick(it)}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold transition-all',
                        inCartQty > 0
                          ? 'bg-blue-500/15 border-blue-500 text-blue-300'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-500'
                      )}
                    >
                      {isLow && <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse flex-shrink-0" />}
                      <span className="truncate max-w-[100px]">{it.name}</span>
                      <span className="text-[9px] text-slate-500">({Number(it.currentStock).toFixed(1)} {it.unit?.symbol || 'u'})</span>
                      {inCartQty > 0 && (
                        <span className="bg-blue-500 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0">{inCartQty}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* LATEST MRP DISPLAY */}
              {latestMRP && (
                <div className="px-4 py-2.5 border-b border-border bg-gradient-to-r from-purple-500/10 to-pink-500/10 flex-shrink-0">
                  <p className="text-[9px] font-black text-slate-500 uppercase mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" /> Latest MRP Added
                  </p>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-bold text-sm text-white">{latestMRP.inventoryItem?.name || 'Item'}</p>
                      <div className="flex items-center gap-4 mt-1 text-[10px]">
                        <span className="flex items-center gap-1">
                          <span className="text-slate-500">Purchase Rate:</span>
                          <span className="font-black text-green-400">{inr(latestMRP.purchaseRate)}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="text-slate-500">MRP:</span>
                          <span className="font-black text-blue-400">{inr(latestMRP.mrp)}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="text-slate-500">Selling:</span>
                          <span className="font-black text-green-400">{inr((latestMRP as any).sellingPrice ?? latestMRP.mrp)}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="text-slate-500">Profit:</span>
                          <span className="font-black text-orange-400">{latestMRP.profitPercent.toFixed(1)}%</span>
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setEditMRPId(latestMRP.id);
                        setEditMRPValue(latestMRP.mrp);
                        setEditProfitPercent(latestMRP.profitPercent);
                        setShowEditMRP(true);
                      }}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-[9px] font-black rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3 h-3" /> Edit
                    </button>
                  </div>
                </div>
              )}

              {/* ITEMS TABLE */}
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-bg-primary z-10 border-b border-slate-800">
                    <tr className="text-[9px] font-black uppercase text-slate-500">
                      <th className="px-3 py-2.5 min-w-[180px]">Item</th>
                      <th className="px-3 py-2.5 text-center w-24">Stock → New</th>
                      <th className="px-3 py-2.5 text-center w-20">Qty</th>
                      <th className="px-3 py-2.5 text-center w-16">GST%</th>
                      <th className="px-3 py-2.5 text-center w-16">Disc%</th>
                      <th className="px-3 py-2.5 text-right w-28">Purchase Rate</th>
                      <th className="px-3 py-2.5 text-right w-28">Amount</th>
                      <th className="px-3 py-2.5 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => {
                      const calc = rowCalcs[idx];
                      const isLow = row.item && Number(row.item.currentStock) <= Number(row.item.thresholdQty);
                      const newStock = row.item ? Number(row.item.currentStock) + Number(row.quantity) : null;
                      return (
                        <tr key={row.tempId} className="border-b border-slate-800/50 hover:bg-slate-800/20 group">
                          <td className="px-3 py-1.5">
                            <div className="space-y-1.5">
                              <select
                                value={row.inventoryItemId ?? ''}
                                onChange={e => updateRow(idx, { inventoryItemId: e.target.value ? Number(e.target.value) : undefined })}
                                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="">Select item...</option>
                                {supplierMRPs.length > 0 && (
                                  <optgroup label="── Supplier Items ──">
                                    {Array.from(new Map(supplierMRPs.filter(m => m.inventoryItem).map(m => [m.inventoryItemId, m.inventoryItem])).values()).map(it => (
                                      <option key={it.id} value={it.id}>{it.name}</option>
                                    ))}
                                  </optgroup>
                                )}
                                <optgroup label="── All Items ──">
                                  {allItems
                                    .filter(it => !supplierMRPs.some(m => m.inventoryItemId === it.id))
                                    .map(it => <option key={it.id} value={it.id}>{it.name}</option>)
                                  }
                                </optgroup>
                              </select>
                              {row.inventoryItemId && (
                                <div className="flex items-center gap-1">
                                  <select
                                    value={row.inventoryItemMRPId ?? ''}
                                    onChange={e => {
                                      const itemMRPs = row.availableMRPs ?? supplierMRPs.filter(m => m.inventoryItemId === row.inventoryItemId);
                                      const mrp = itemMRPs.find(m => m.id === Number(e.target.value));
                                      if (mrp) updateRow(idx, { unitCost: Number(mrp.purchaseRate), mrp: Number((mrp as any).sellingPrice ?? mrp.mrp), inventoryItemMRPId: mrp.id });
                                    }}
                                    className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[9px] text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                                  >
                                    <option value="">Select MRP...</option>
                                    {(row.availableMRPs ?? supplierMRPs.filter(m => m.inventoryItemId === row.inventoryItemId))
                                      .map(m => (
                                        <option key={m.id} value={m.id}>
                                          {inr((m as any).sellingPrice ?? m.mrp)} ({inr(m.purchaseRate)})
                                        </option>
                                      ))
                                    }
                                  </select>
                                  <button
                                    onClick={() => {
                                      const itemMRPs = row.availableMRPs ?? supplierMRPs.filter(m => m.inventoryItemId === row.inventoryItemId);
                                      if (itemMRPs.length > 0) {
                                        const last = itemMRPs[itemMRPs.length - 1];
                                        setEditMRPId(last.id);
                                        setEditMRPValue(last.mrp);
                                        setEditProfitPercent(last.profitPercent);
                                        setShowEditMRP(true);
                                      }
                                    }}
                                    className="p-1 text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                                    title="Edit MRP"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                  <div className="relative group/mrplist">
                                    <button className="p-1 text-slate-500 hover:text-red-500 transition-colors" title="Delete MRP">
                                      <X className="w-3 h-3" />
                                    </button>
                                    {(row.availableMRPs ?? supplierMRPs.filter(m => m.inventoryItemId === row.inventoryItemId)).length > 0 && (
                                      <div className="absolute right-0 top-full mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-lg hidden group-hover/mrplist:block z-50 min-w-max">
                                        {(row.availableMRPs ?? supplierMRPs.filter(m => m.inventoryItemId === row.inventoryItemId))
                                          .map(m => (
                                            <button
                                              key={m.id}
                                              onClick={() => deleteMRPMutation.mutate(m.id)}
                                              disabled={deleteMRPMutation.isPending}
                                              className="w-full text-left px-3 py-1.5 text-[9px] text-red-400 hover:bg-red-500/10 flex items-center gap-1.5 border-b border-slate-800 last:border-0"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                              Delete MRP {inr((m as any).sellingPrice ?? m.mrp)}
                                            </button>
                                          ))
                                        }
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>

                          <td className="px-3 py-1.5 text-center">
                            {row.item ? (
                              <div className="flex flex-col items-center leading-tight">
                                <span className={cn('text-[10px] font-bold', isLow ? 'text-red-400' : 'text-slate-400')}>
                                  {Number(row.item.currentStock).toFixed(1)} {row.item.unit?.symbol}
                                </span>
                                {row.quantity > 0 && newStock !== null && (
                                  <span className="text-[9px] text-green-400 font-black">→ {newStock.toFixed(1)}</span>
                                )}
                              </div>
                            ) : <span className="text-slate-600">—</span>}
                          </td>

                          <td className="px-3 py-1.5">
                            <input
                              type="number"
                              value={row.quantity || ''}
                              onChange={e => updateRow(idx, { quantity: Number(e.target.value) })}
                              placeholder="0"
                              min="0"
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-right font-black text-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                            />
                          </td>

                          <td className="px-3 py-1.5">
                            <input
                              type="number"
                              value={row.taxPercent}
                              onChange={e => updateRow(idx, { taxPercent: Number(e.target.value) })}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-center text-slate-400 focus:outline-none"
                            />
                          </td>

                          <td className="px-3 py-1.5">
                            <input
                              type="number"
                              value={row.discountPercent}
                              onChange={e => updateRow(idx, { discountPercent: Number(e.target.value) })}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-center text-slate-400 focus:outline-none"
                            />
                          </td>

                          <td className="px-3 py-1.5">
                            <div className="space-y-0.5">
                              <input
                                type="number"
                                value={row.unitCost || ''}
                                onChange={e => updateRow(idx, { unitCost: Number(e.target.value) })}
                                placeholder="0.00"
                                min="0"
                                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-right font-bold text-blue-400 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                              />
                              {row.lastPurchaseRate && row.lastPurchaseRate !== row.unitCost && (
                                <p className="text-[9px] text-slate-500 text-right">
                                  Last: {inr(row.lastPurchaseRate)}
                                </p>
                              )}
                              {row.mrp && row.mrp > 0 && (
                                <p className="text-[9px] text-green-500/70 text-right">Selling: {inr(row.mrp)}</p>
                              )}
                            </div>
                          </td>

                          <td className="px-3 py-1.5 text-right">
                            {row.quantity > 0 ? (
                              <div className="space-y-0.5">
                                <span className="font-bold text-white">{inr(calc.total)}</span>
                                {calc.gst > 0 && (
                                  <p className="text-[9px] text-slate-500">incl. GST {inr(calc.gst)}</p>
                                )}
                              </div>
                            ) : <span className="text-slate-700">—</span>}
                          </td>

                          <td className="px-3 py-1.5 text-center">
                            <button
                              onClick={() => removeRow(idx)}
                              className="p-1 text-slate-700 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={8} className="text-center py-10 text-slate-600 text-xs italic">
                          No items. Click chips above or "+ Row" to add.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* NOTES / DATES */}
              <div className="p-3 border-t border-border bg-bg-primary grid grid-cols-3 gap-3 flex-shrink-0">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase">Order Date</label>
                  <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-white" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase">Expected Delivery</label>
                  <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-white" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase">Note</label>
                  <input type="text" value={note} onChange={e => setNote(e.target.value)}
                    placeholder="Batch, quality, ref..." className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-white" />
                </div>
              </div>
            </div>
          )}
        </main>

        {/* RIGHT PANEL: INVOICE SUMMARY */}
        <aside className="w-56 border-l border-border bg-bg-primary flex flex-col flex-shrink-0 overflow-y-auto">
          {selectedSupplier ? (
            <div className="flex flex-col h-full">
              {/* Supplier balance */}
              <div className="p-3 border-b border-border">
                <p className="text-[9px] font-black text-slate-500 uppercase mb-2 flex items-center gap-1.5">
                  <User className="w-3 h-3" /> Previous Balance
                </p>
                <div className={cn('p-2.5 rounded-xl border text-center', Number(selectedSupplier.outstandingBalance) > 0 ? 'bg-red-500/5 border-red-500/20' : 'bg-green-500/5 border-green-500/20')}>
                  <span className={cn('font-black text-base', Number(selectedSupplier.outstandingBalance) > 0 ? 'text-red-400' : 'text-green-400')}>
                    {inr(selectedSupplier.outstandingBalance)}
                  </span>
                </div>
              </div>

              {/* Invoice breakdown */}
              <div className="p-3 flex-1 space-y-1.5 border-b border-border">
                <p className="text-[9px] font-black text-slate-500 uppercase mb-2 flex items-center gap-1.5">
                  <FileText className="w-3 h-3" /> Invoice
                </p>
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>Subtotal</span><span>{inr(invoice.subtotal)}</span>
                </div>
                {invoice.discount > 0 && (
                  <div className="flex justify-between text-[10px] text-red-400">
                    <span>Discount</span><span>- {inr(invoice.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>CGST</span><span>{inr(invoice.totalGst / 2)}</span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>SGST</span><span>{inr(invoice.totalGst / 2)}</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-slate-800">
                  <span className="text-xs font-black text-white">TOTAL</span>
                  <span className="text-sm font-black text-blue-400">{inr(invoice.grandTotal)}</span>
                </div>
              </div>

              {/* Stock preview */}
              {rows.some(r => r.quantity > 0) && (
                <div className="p-3 border-b border-border">
                  <p className="text-[9px] font-black text-slate-500 uppercase mb-2 flex items-center gap-1.5">
                    <TrendingUp className="w-3 h-3" /> Stock Update
                  </p>
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {rows.filter(r => r.quantity > 0 && r.item).map((r, i) => (
                      <div key={i} className="flex justify-between items-center text-[9px] py-0.5">
                        <span className="truncate pr-1 text-slate-300 font-bold">{r.item?.name}</span>
                        <span className="text-green-400 font-black flex-shrink-0">
                          +{r.quantity}→{(Number(r.item!.currentStock) + Number(r.quantity)).toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CTA */}
              <div className="p-3 mt-auto">
                <Button
                  disabled={!canPurchase || purchaseMutation.isPending}
                  onClick={() => { setPaidAmount(invoice.grandTotal); setShowPayment(true); }}
                  className="w-full h-14 rounded-2xl flex flex-col justify-center gap-0.5 bg-gradient-to-br from-blue-600 to-indigo-700 hover:scale-[1.02] shadow-xl shadow-blue-500/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="text-[9px] font-black uppercase tracking-tighter text-blue-100/70">
                    {rows.filter(r => r.quantity > 0).length} items
                  </div>
                  <div className="text-base font-black text-white flex items-center gap-1.5">
                    {inr(invoice.grandTotal)} <ArrowRight className="w-4 h-4" />
                  </div>
                </Button>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center p-4 text-center text-slate-600 text-xs font-bold italic opacity-40">
              Select a supplier to see billing summary
            </div>
          )}
        </aside>
      </div>

      {/* ════════════════════════════════════════════════════════
          PAYMENT MODAL
          ════════════════════════════════════════════════════════ */}
      <Modal isOpen={showPayment} onClose={() => setShowPayment(false)} title="Confirm Purchase & Payment">
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-bg-tertiary rounded-2xl border border-border flex flex-col gap-0.5">
              <span className="text-[9px] font-black uppercase text-slate-500">Prev. Balance</span>
              <span className={cn('text-sm font-black', Number(selectedSupplier?.outstandingBalance) > 0 ? 'text-red-400' : 'text-green-400')}>
                {inr(selectedSupplier?.outstandingBalance || 0)}
              </span>
            </div>
            <div className="p-3 bg-bg-tertiary rounded-2xl border border-border flex flex-col gap-0.5">
              <span className="text-[9px] font-black uppercase text-slate-500">Invoice</span>
              <span className="text-sm font-black text-white">{inr(invoice.grandTotal)}</span>
            </div>
            <div className="p-3 bg-blue-500/10 rounded-2xl border border-blue-500/30 flex flex-col gap-0.5">
              <span className="text-[9px] font-black uppercase text-blue-400">Total Payable</span>
              <span className="text-sm font-black text-blue-400">{inr(totalPayable)}</span>
            </div>
          </div>

          {/* GST info */}
          <div className="bg-bg-tertiary rounded-xl p-3 flex justify-between text-xs text-slate-400 border border-border">
            <span>CGST: {inr(invoice.totalGst / 2)}</span>
            <span>SGST: {inr(invoice.totalGst / 2)}</span>
            <span>Total GST: {inr(invoice.totalGst)}</span>
          </div>

          {/* Payment input */}
          <div className="space-y-1.5">
            <label className="text-xs font-black uppercase tracking-tight text-slate-400">Amount Paying Now (₹)</label>
            <Input
              type="number"
              value={paidAmount}
              onChange={e => setPaidAmount(Number(e.target.value))}
              className="h-14 text-2xl font-black bg-bg-elevated border-slate-800 text-blue-400 text-center rounded-2xl focus:ring-blue-500 select-all"
            />
          </div>

          {/* Balance preview */}
          <div className={cn(
            'p-4 rounded-2xl border flex flex-col items-center transition-all',
            netBalance > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-green-500/10 border-green-500/30'
          )}>
            <span className="text-[9px] font-black uppercase text-slate-500">Balance After Payment</span>
            <span className={cn('text-2xl font-black mt-1', netBalance > 0 ? 'text-red-400' : 'text-green-400')}>
              {inr(netBalance)}
            </span>
          </div>

          {/* Payment method */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase text-slate-500">Payment Method</label>
            <div className="grid grid-cols-5 gap-1.5">
              {(['Cash', 'UPI', 'Card', 'Credit', 'Multiple'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setPaymentMethod(m)}
                  className={cn(
                    'py-2 rounded-xl font-black text-[10px] uppercase transition-all border',
                    paymentMethod === m
                      ? 'bg-blue-600 border-blue-500 text-white shadow-lg'
                      : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
                  )}
                >
                  {m === 'Cash' && <Banknote className="w-3.5 h-3.5 mx-auto mb-0.5" />}
                  {m === 'UPI' && <Smartphone className="w-3.5 h-3.5 mx-auto mb-0.5" />}
                  {m === 'Card' && <CreditCard className="w-3.5 h-3.5 mx-auto mb-0.5" />}
                  {m === 'Credit' && <BadgeIndianRupee className="w-3.5 h-3.5 mx-auto mb-0.5" />}
                  {m === 'Multiple' && <IndianRupee className="w-3.5 h-3.5 mx-auto mb-0.5" />}
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Ref / notes */}
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Ref # / UTR / Txn ID" value={paymentRef} onChange={e => setPaymentRef(e.target.value)} className="h-10 bg-slate-900 text-xs" />
            <Input placeholder="Notes" value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} className="h-10 bg-slate-900 text-xs" />
          </div>

          <div className="flex gap-3 pt-1">
            <Button onClick={() => setShowPayment(false)} variant="outline" className="flex-1 h-12 rounded-2xl font-bold border-slate-800 text-sm">
              Cancel
            </Button>
            <Button
              onClick={() => purchaseMutation.mutate()}
              disabled={purchaseMutation.isPending}
              className="flex-[2] h-12 rounded-2xl font-black bg-blue-600 hover:bg-blue-700 shadow-xl text-sm"
            >
              {purchaseMutation.isPending ? 'Processing...' : 'Confirm Purchase ✓'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ════════════════════════════════════════════════════════
          PAYMENT HISTORY MODAL
          ════════════════════════════════════════════════════════ */}
      <Modal isOpen={showHistory} onClose={() => setShowHistory(false)} title={`Payment History · ${selectedSupplier?.name || ''}`}>
        <div className="space-y-4">
          {/* Print/Download buttons */}
          <div className="flex gap-2">
            <Button
              onClick={() => {
                const w = window.open('', '_blank', 'width=600,height=800');
                if (!w) return;
                const posHtml = (historyData?.purchaseOrders || []).map((po: PurchaseOrder) => {
                  const totalPaid = po.payments?.reduce((s: number, p: POPayment) => s + Number(p.amount || 0), 0) || 0;
                  const balance = Number(po.total || 0) - totalPaid;
                  return `
                    <tr>
                      <td style="padding:8px;border-bottom:1px solid #ddd;">${po.orderNumber}</td>
                      <td style="padding:8px;border-bottom:1px solid #ddd;">${formatDate(po.createdAt)}</td>
                      <td style="padding:8px;text-align:right;border-bottom:1px solid #ddd;">${inr(po.total)}</td>
                      <td style="padding:8px;text-align:right;border-bottom:1px solid #ddd;color:green;">${inr(totalPaid)}</td>
                      <td style="padding:8px;text-align:right;border-bottom:1px solid #ddd;color:${balance > 0 ? 'red' : 'green'};">${inr(balance)}</td>
                      <td style="padding:8px;text-align:center;border-bottom:1px solid #ddd;">${po.status}</td>
                    </tr>
                  `;
                }).join('');
                w.document.write(`
                  <html><head><title>Payment History Report</title>
                  <style>
                    body{font-family:Arial,sans-serif;padding:20px;color:#111;font-size:13px}
                    h2{text-align:center;margin:0 0 10px;font-size:18px}
                    .supplier{text-align:center;color:#666;margin-bottom:20px}
                    table{width:100%;border-collapse:collapse}
                    th{background:#f5f5f5;padding:10px;text-align:left;font-weight:bold;border-bottom:2px solid #333}
                    .summary{margin-top:20px;font-size:12px}
                    @media print{body{padding:0}}
                  </style></head>
                  <body onload="window.print();window.close()">
                    <h2>PAYMENT HISTORY REPORT</h2>
                    <div class="supplier"><strong>${selectedSupplier?.name}</strong><br/>Contact: ${selectedSupplier?.contactPerson || '—'} | Phone: ${selectedSupplier?.phone || '—'}</div>
                    <table>
                      <thead>
                        <tr>
                          <th>Invoice #</th>
                          <th>Date</th>
                          <th>Bill Amount</th>
                          <th>Amount Paid</th>
                          <th>Balance</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>${posHtml}</tbody>
                    </table>
                    <div class="summary">
                      <strong>Summary:</strong><br/>
                      Total Orders: ${historyData?.purchaseOrders?.length || 0}<br/>
                      Total Amount: ${inr(selectedSupplier?.totalOrderAmount || 0)}<br/>
                      Outstanding Balance: ${inr(selectedSupplier?.outstandingBalance || 0)}
                    </div>
                  </body></html>
                `);
                w.document.close();
              }}
              className="flex-1 h-10 rounded-lg font-bold bg-blue-600 hover:bg-blue-700 text-sm flex items-center justify-center gap-2"
            >
              <Printer className="w-4 h-4" /> Print
            </Button>
            <Button
              onClick={() => {
                const data = historyData?.purchaseOrders || [];
                const csv = [
                  ['Invoice #', 'Date', 'Bill Amount', 'Amount Paid', 'Balance', 'Status'].join(','),
                  ...data.map((po: PurchaseOrder) => {
                    const totalPaid = po.payments?.reduce((s: number, p: POPayment) => s + Number(p.amount || 0), 0) || 0;
                    const balance = Number(po.total || 0) - totalPaid;
                    return [
                      po.orderNumber,
                      formatDate(po.createdAt),
                      Number(po.total).toFixed(2),
                      totalPaid.toFixed(2),
                      balance.toFixed(2),
                      po.status
                    ].join(',');
                  })
                ].join('\n');
                
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Payment_History_${selectedSupplier?.name}_${new Date().toISOString().split('T')[0]}.csv`;
                a.click();
                window.URL.revokeObjectURL(url);
              }}
              className="flex-1 h-10 rounded-lg font-bold bg-green-600 hover:bg-green-700 text-sm flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" /> Download CSV
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-bg-tertiary rounded-2xl border border-border flex flex-col gap-0.5">
              <span className="text-[9px] font-black text-slate-500 uppercase">Orders</span>
              <span className="text-lg font-black">{selectedSupplier?.totalOrders || 0}</span>
            </div>
            <div className="p-3 bg-bg-tertiary rounded-2xl border border-border flex flex-col gap-0.5">
              <span className="text-[9px] font-black text-slate-500 uppercase">Total Purchased</span>
              <span className="text-lg font-black text-blue-400">{inr(selectedSupplier?.totalOrderAmount || 0)}</span>
            </div>
            <div className="p-3 bg-red-500/5 rounded-2xl border border-red-500/20 flex flex-col gap-0.5">
              <span className="text-[9px] font-black text-red-500/60 uppercase">Outstanding</span>
              <span className="text-lg font-black text-red-400">{inr(selectedSupplier?.outstandingBalance || 0)}</span>
            </div>
          </div>

          {historyLoading && (
            <div className="py-8 text-center text-slate-500 text-xs animate-pulse">Loading history...</div>
          )}

          <div className="max-h-[500px] overflow-y-auto space-y-2 pr-1">
            {historyData?.purchaseOrders?.map((po: PurchaseOrder) => (
              <POHistoryCard
                key={po.id}
                po={po}
                expanded={expandedPOId === po.id}
                onToggle={() => setExpandedPOId(expandedPOId === po.id ? null : po.id)}
                onDuplicate={() => handleDuplicatePO(po)}
              />
            ))}
            {historyData?.purchaseOrders?.length === 0 && (
              <p className="text-center py-8 text-slate-600 text-xs italic">No purchase orders yet for this supplier</p>
            )}
          </div>
        </div>
      </Modal>

      {/* ════════════════════════════════════════════════════════
          ASSIGN ITEMS MODAL
          ════════════════════════════════════════════════════════ */}
      <Modal isOpen={showAssignItems} onClose={() => setShowAssignItems(false)} title={`Assign Items to ${selectedSupplier?.name || 'Supplier'}`}>
        <AssignItemsPanel
          supplierId={selectedSupplierId!}
          restaurantItems={allItems}
          supplierMRPs={supplierMRPs}
          search={assignSearch}
          onSearchChange={setAssignSearch}
          assignRates={assignRates}
          onAssignRatesChange={setAssignRates}
          onSaved={() => {
            // Reload supplier MRPs
            if (selectedSupplierId) {
              api.get(`/restaurant/inventory/suppliers/${selectedSupplierId}/items`).then(res => {
                setSupplierMRPs(res.data.data || []);
              });
            }
            toast({ title: 'Items assigned successfully' });
          }}
        />
      </Modal>

      {/* ════════════════════════════════════════════════════════
          EDIT MRP MODAL
          ════════════════════════════════════════════════════════ */}
      <Modal isOpen={showEditMRP} onClose={() => setShowEditMRP(false)} title="Edit MRP">
        <div className="space-y-4">
          {editMRPId && supplierMRPs.find(m => m.id === editMRPId) && (() => {
            const mrpItem = supplierMRPs.find(m => m.id === editMRPId);
            if (!mrpItem) return null;
            return (
              <div className="space-y-4">
                <div className="p-4 bg-bg-tertiary rounded-2xl border border-border">
                  <h3 className="font-bold text-sm text-white mb-2">{mrpItem.inventoryItem?.name}</h3>
                  <p className="text-[9px] text-slate-500">Current Stock: {Number(mrpItem.inventoryItem?.currentStock || 0).toFixed(1)} {mrpItem.inventoryItem?.unit?.symbol}</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-slate-400">Selling Rate (MRP) · ₹</label>
                  <Input
                    type="number"
                    value={editMRPValue}
                    onChange={e => {
                      const newMRP = Number(e.target.value);
                      setEditMRPValue(newMRP);
                      // Auto-calculate profit percent
                      if (mrpItem && newMRP > 0) {
                        const purchaseRate = mrpItem.purchaseRate;
                        const profitPercent = ((newMRP - purchaseRate) / purchaseRate) * 100;
                        setEditProfitPercent(Math.round(profitPercent * 10) / 10);
                      }
                    }}
                    className="h-12 text-2xl font-black bg-bg-elevated border-slate-800 text-green-400 text-center rounded-2xl focus:ring-green-500"
                  />
                  <p className="text-[9px] text-slate-500">Purchase Rate: {inr(mrpItem.purchaseRate)}</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-slate-400">Profit Percentage · %</label>
                  <Input
                    type="number"
                    value={editProfitPercent}
                    onChange={e => {
                      const newPercent = Number(e.target.value);
                      setEditProfitPercent(newPercent);
                      // Auto-calculate MRP
                      if (mrpItem && newPercent >= 0) {
                        const purchaseRate = mrpItem.purchaseRate;
                        const newMRP = purchaseRate * (1 + newPercent / 100);
                        setEditMRPValue(Math.round(newMRP * 100) / 100);
                      }
                    }}
                    className="h-12 text-2xl font-black bg-bg-elevated border-slate-800 text-orange-400 text-center rounded-2xl focus:ring-orange-500"
                  />
                </div>

                <div className="bg-blue-500/10 rounded-2xl p-3 border border-blue-500/20">
                  <p className="text-[10px] text-blue-400 font-bold">
                    <span className="block">Purchase Rate: {inr(mrpItem.purchaseRate)}</span>
                    <span className="block">Selling Rate (MRP): {inr(editMRPValue)}</span>
                    <span className="block">Profit: {inr(editMRPValue - mrpItem.purchaseRate)} ({editProfitPercent.toFixed(1)}%)</span>
                  </p>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button onClick={() => setShowEditMRP(false)} variant="outline" className="flex-1 h-12 rounded-2xl font-bold border-slate-800 text-sm">
                    Cancel
                  </Button>
                  <Button
                    onClick={() => editMRPMutation.mutate()}
                    disabled={editMRPMutation.isPending}
                    className="flex-[2] h-12 rounded-2xl font-black bg-green-600 hover:bg-green-700 shadow-xl text-sm"
                  >
                    {editMRPMutation.isPending ? 'Updating...' : 'Update MRP ✓'}
                  </Button>
                </div>
              </div>
            );
          })()}
        </div>
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PO HISTORY CARD
// ═══════════════════════════════════════════════════════════════

function POHistoryCard({ po, expanded, onToggle, onDuplicate }: {
  po: PurchaseOrder;
  expanded: boolean;
  onToggle: () => void;
  onDuplicate: () => void;
}) {
  const totalPaid = po.payments?.reduce((s, p) => s + Number(p.amount || 0), 0) || 0;
  const balance = Number(po.total || 0) - totalPaid;

  return (
    <div className="bg-bg-tertiary border border-border rounded-2xl overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between p-3.5 hover:bg-bg-hover transition-colors">
        <div className="flex items-center gap-3">
          <div className={cn('w-2.5 h-2.5 rounded-full', po.status === 'received' ? 'bg-green-500' : 'bg-orange-400')} />
          <div className="text-left">
            <p className="font-black text-xs uppercase">{po.orderNumber}</p>
            <p className="text-[9px] text-slate-500">{formatDate(po.createdAt)} · {po.items?.length} items</p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <p className="text-[9px] text-slate-500 uppercase font-bold">Bill</p>
            <p className="font-black text-xs">{inr(po.total)}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-slate-500 uppercase font-bold">Paid</p>
            <p className="font-black text-xs text-green-400">{inr(totalPaid)}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-slate-500 uppercase font-bold">Due</p>
            <p className={cn('font-black text-xs', balance > 0 ? 'text-red-400' : 'text-green-400')}>{inr(balance)}</p>
          </div>
          <ChevronRight className={cn('w-4 h-4 text-slate-600 transition-transform', expanded ? 'rotate-90' : '')} />
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-slate-800"
          >
            <div className="p-4 bg-bg-elevated">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[9px] font-black uppercase text-slate-500 pl-2 border-l-2 border-blue-600">Items Purchased</p>
                <div className="flex gap-1.5">
                  <button
                    onClick={onDuplicate}
                    className="px-2.5 py-1 bg-violet-600 text-white rounded text-[9px] font-black flex items-center gap-1"
                  >
                    <Copy className="w-2.5 h-2.5" /> Duplicate
                  </button>
                </div>
              </div>

              <div className="space-y-1 mb-4">
                {po.items?.map((it, k) => (
                  <div key={k} className="flex justify-between items-center text-[10px] py-1 px-2 rounded-lg bg-bg-tertiary">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-300">{it.inventoryItem?.name || `Item #${it.inventoryItemId}`}</span>
                      <span className="text-slate-500">× {it.quantity} {it.inventoryItem?.unit?.symbol || ''}</span>
                      {it.taxPercent && Number(it.taxPercent) > 0 && (
                        <span className="text-[8px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">GST {it.taxPercent}%</span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="font-bold">{inr(it.total)}</span>
                      <p className="text-[9px] text-slate-500">@ {inr(it.unitCost)}</p>
                    </div>
                  </div>
                ))}
              </div>

              {po.payments && po.payments.length > 0 && (
                <>
                  <p className="text-[9px] font-black uppercase text-slate-500 pl-2 border-l-2 border-purple-600 mb-2">Payments</p>
                  <div className="space-y-1">
                    {po.payments.map((p) => (
                      <div key={p.id} className="flex justify-between items-center bg-bg-tertiary p-2.5 rounded-xl border border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            'px-1.5 py-0.5 rounded text-[8px] font-black uppercase',
                            p.method === 'Cash' ? 'bg-green-500/20 text-green-400' :
                            p.method === 'UPI' ? 'bg-purple-500/20 text-purple-400' :
                            p.method === 'Card' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-orange-500/20 text-orange-400'
                          )}>{p.method || 'Cash'}</span>
                          <div>
                            <p className="text-[9px] font-bold text-slate-300">{formatDate(p.paymentDate || p.createdAt)}</p>
                            {p.reference && <p className="text-[8px] text-slate-500">#{p.reference}</p>}
                          </div>
                        </div>
                        <span className="font-black text-xs text-white">{inr(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {(!po.payments || po.payments.length === 0) && (
                <p className="text-[9px] text-slate-600 italic px-2">No payments recorded for this order</p>
              )}

              {po.note && (
                <div className="mt-3 p-2 bg-bg-tertiary rounded-lg border border-slate-800">
                  <p className="text-[9px] text-slate-500">Note: {po.note}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ASSIGN ITEMS PANEL
// ═══════════════════════════════════════════════════════════════

function AssignItemsPanel({
  supplierId, restaurantItems, supplierMRPs, search, onSearchChange,
  assignRates, onAssignRatesChange, onSaved
}: {
  supplierId: number;
  restaurantItems: InventoryItem[];
  supplierMRPs: SupplierMRPItem[];
  search: string;
  onSearchChange: (s: string) => void;
  assignRates: Record<number, { purchaseRate: string; mrp: string }>;
  onAssignRatesChange: (r: Record<number, { purchaseRate: string; mrp: string }>) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState<number | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);

  const assignedIds = new Set(supplierMRPs.map(m => m.inventoryItemId));
  const filtered = restaurantItems.filter(it => it.name.toLowerCase().includes(search.toLowerCase()));
  const assignedItems = filtered.filter(it => assignedIds.has(it.id));
  const unassignedItems = filtered.filter(it => !assignedIds.has(it.id));

  const handleAssign = async (item: InventoryItem) => {
    const rates = assignRates[item.id];
    const purchaseRate = Number(rates?.purchaseRate || item.costPerUnit || 0);
    const mrp = Number(rates?.mrp || 0) || Math.round(purchaseRate * 1.2 * 100) / 100;
    setSaving(item.id);
    try {
      await api.post(`/restaurant/inventory/suppliers/${supplierId}/items`, {
        inventoryItemId: item.id,
        purchaseRate,
        mrp
      });
      onSaved();
    } catch (err: any) {
      toast({ title: 'Failed to assign item', description: err.response?.data?.error || err.message, variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const handleRemove = async (itemId: number) => {
    setRemoving(itemId);
    try {
      await api.delete(`/restaurant/inventory/suppliers/${supplierId}/items/${itemId}`);
      onSaved();
    } catch (err: any) {
      toast({ title: 'Failed to remove item', description: err.response?.data?.error || err.message, variant: 'destructive' });
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
        <input
          type="text"
          placeholder="Search items..."
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white"
        />
      </div>

      <div className="max-h-[460px] overflow-y-auto space-y-1.5 pr-1">
        {assignedItems.length > 0 && (
          <>
            <p className="text-[9px] font-black uppercase text-green-400/70 pl-1 sticky top-0 bg-bg-base py-1">
              ✓ Assigned ({assignedItems.length})
            </p>
            {assignedItems.map(item => {
              const mrpEntry = supplierMRPs.find((m: any) => m.inventoryItemId === item.id);
              const purchaseRate = Number(mrpEntry?.purchaseRate || 0);
              const sellingPrice = Number(((mrpEntry as any)?.sellingPrice ?? mrpEntry?.mrp) || 0);
              return (
                <div key={item.id} className="flex items-center justify-between p-2.5 rounded-xl bg-green-500/5 border border-green-500/20 gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xs text-slate-200 truncate">{item.name}</p>
                    <p className="text-[9px] text-slate-500">
                      Stock: {Number(item.currentStock).toFixed(1)} {item.unit?.symbol} ·
                      Rate: {inr(purchaseRate)} · Selling: {inr(sellingPrice)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemove(item.id)}
                    disabled={removing === item.id}
                    className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {removing === item.id ? <div className="w-3.5 h-3.5 border border-red-500 border-t-transparent rounded-full animate-spin" /> : <X className="w-3.5 h-3.5" />}
                  </button>
                </div>
              );
            })}
          </>
        )}

        {unassignedItems.length > 0 && (
          <>
            <p className="text-[9px] font-black uppercase text-slate-500 pl-1 sticky top-6 bg-bg-base py-1 mt-2">
              Not assigned ({unassignedItems.length})
            </p>
            {unassignedItems.map(item => (
              <div key={item.id} className="p-2.5 rounded-xl bg-bg-tertiary border border-border space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xs text-slate-300 truncate">{item.name}</p>
                    <p className="text-[9px] text-slate-500">
                      Stock: {Number(item.currentStock).toFixed(1)} {item.unit?.symbol} · Category: {item.category?.name || '—'}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-0.5">
                    <label className="text-[8px] text-slate-500 uppercase font-bold">Purchase Rate</label>
                    <input
                      type="number"
                      placeholder={String(item.costPerUnit || '0')}
                      value={assignRates[item.id]?.purchaseRate || ''}
                      onChange={e => onAssignRatesChange({ ...assignRates, [item.id]: { purchaseRate: e.target.value, mrp: assignRates[item.id]?.mrp || '' } })}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-blue-400 font-bold focus:outline-none"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <label className="text-[8px] text-slate-500 uppercase font-bold">MRP (Selling)</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={assignRates[item.id]?.mrp || ''}
                      onChange={e => onAssignRatesChange({ ...assignRates, [item.id]: { purchaseRate: assignRates[item.id]?.purchaseRate || '', mrp: e.target.value } })}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-green-400 font-bold focus:outline-none"
                    />
                  </div>
                </div>
                <button
                  onClick={() => handleAssign(item)}
                  disabled={saving === item.id}
                  className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {saving === item.id
                    ? <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> Assigning...</>
                    : <><Plus className="w-3 h-3" /> Assign to Supplier</>
                  }
                </button>
              </div>
            ))}
          </>
        )}

        {filtered.length === 0 && (
          <p className="text-center py-8 text-slate-600 text-xs italic">No items match your search</p>
        )}
      </div>
    </div>
  );
}