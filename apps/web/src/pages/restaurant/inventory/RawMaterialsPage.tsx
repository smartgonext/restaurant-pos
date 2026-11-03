import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import {
  Search, Grid, List, Download, Upload, Plus, Edit2, PlusCircle, DollarSign,
  History, Trash2, Eye, EyeOff, LayoutGrid, AlertTriangle, ArrowUpDown, Package
} from 'lucide-react';
import { resolveImageUrl } from '@/lib/utils';
import ItemFormModal from '@/components/inventory/ItemFormModal';
import AddStockModal from '@/components/inventory/AddStockModal';
import ImportModal from '@/components/inventory/ImportModal';
import { useToast } from '@/components/inventory/ToastProvider';

interface Props {
  quickAction?: string | null;
  onClearQuickAction?: () => void;
}

export default function RawMaterialsPage({ quickAction, onClearQuickAction }: Props) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedUnit, setSelectedUnit] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  
  // Selection states for bulk actions
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  
  // Modal states
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    if (quickAction === 'add-item') {
      setEditItem(null);
      setFormOpen(true);
      onClearQuickAction?.();
    }
  }, [quickAction]);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [stockOpen, setStockOpen] = useState(false);
  const [stockItem, setStockItem] = useState<any | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // Pagination states
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  // Queries
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: () => api.get('/restaurant/inventory/items').then(r => r.data.data)
  });
  const { data: categories = [] } = useQuery({ queryKey: ['inventory-categories'], queryFn: () => api.get('/restaurant/inventory/categories').then(r => r.data.data) });
  const { data: units = [] } = useQuery({ queryKey: ['inventory-units'], queryFn: () => api.get('/restaurant/inventory/units').then(r => r.data.data) });

  // Soft Delete / Toggle Active Mutation
  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      api.put(`/restaurant/inventory/items/${id}`, { isActive }),
    onSuccess: (_, variables) => {
      showToast('success', 'Status Updated', `Item was successfully ${variables.isActive ? 'activated' : 'deactivated'}.`);
      qc.invalidateQueries({ queryKey: ['inventory-items'] });
    },
    onError: (err: any) => {
      showToast('error', 'Action Failed', err?.response?.data?.error || 'Failed to update item status.');
    }
  });

  const getStatusBadge = (stock: number, threshold: number) => {
    if (stock < 0) return { label: 'Alert (Negative)', bg: 'rgba(239,68,68,0.22)', color: '#f87171', border: 'rgba(239,68,68,0.5)' };
    if (stock === 0) return { label: 'Out of Stock', bg: 'rgba(239,68,68,0.2)', color: '#f87171', border: 'rgba(239,68,68,0.4)' };
    if (stock <= threshold) return { label: 'Low Stock', bg: 'rgba(245,158,11,0.22)', color: '#fbbf24', border: 'rgba(245,158,11,0.5)' };
    return { label: 'In Stock', bg: 'rgba(16,185,129,0.2)', color: '#34d399', border: 'rgba(16,185,129,0.5)' };
  };

  const filteredItems = items.filter((it: any) => {
    const sTerm = search.toLowerCase().trim();
    const nameMatch = !sTerm ||
      it.name?.toLowerCase().includes(sTerm) ||
      it.sku?.toLowerCase().includes(sTerm) ||
      it.barcode?.toLowerCase().includes(sTerm);

    const catMatch = selectedCategory === 'All' || String(it.categoryId) === selectedCategory;
    const unitMatch = selectedUnit === 'All' || String(it.unitId) === selectedUnit;

    let statMatch = true;
    if (selectedStatus === 'Low Stock') statMatch = Number(it.currentStock) <= Number(it.thresholdQty) && Number(it.currentStock) > 0;
    else if (selectedStatus === 'Out of Stock') statMatch = Number(it.currentStock) === 0;
    else if (selectedStatus === 'Active') statMatch = !!it.isActive;
    else if (selectedStatus === 'Inactive') statMatch = !it.isActive;

    return nameMatch && catMatch && unitMatch && statMatch;
  });

  // Pagination calculation
  const totalPages = Math.ceil(filteredItems.length / pageSize);
  const paginatedItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSelectAll = () => {
    if (selectedIds.length === paginatedItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginatedItems.map((it: any) => it.id));
    }
  };

  const toggleSelectItem = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(x => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleBulkDeactivate = async () => {
    if (!confirm(`Deactivate ${selectedIds.length} selected items?`)) return;
    try {
      await Promise.all(selectedIds.map(id => api.put(`/restaurant/inventory/items/${id}`, { isActive: false })));
      showToast('success', 'Bulk Action Complete', `Successfully deactivated ${selectedIds.length} items.`);
      setSelectedIds([]);
      qc.invalidateQueries({ queryKey: ['inventory-items'] });
    } catch (err: any) {
      showToast('error', 'Bulk Action Failed', 'Failed to deactivate some selected items.');
    }
  };

  const handleExportSelected = () => {
    const list = items.filter((it: any) => selectedIds.includes(it.id));
    const csvContent = "data:text/csv;charset=utf-8," 
      + ["Name,SKU,Category,Current Stock,Unit,Cost,Threshold,Status"].join(",") + "\n"
      + list.map((it: any) => {
          const stat = getStatusBadge(Number(it.currentStock), Number(it.thresholdQty)).label;
          return `"${it.name}","${it.sku || ''}","${it.category?.name || ''}",${it.currentStock},"${it.unit?.symbol || ''}",${it.costPerUnit},${it.thresholdQty},"${stat}"`;
        }).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `inventory_selected_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Page Title Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: '#ffffff', margin: 0, letterSpacing: '-0.02em' }}>Raw Materials Directory</h1>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0 0' }}>Manage ingredients, stock alerts, barcodes and supplier costs</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setImportOpen(true)}
            style={{
              height: 36, padding: '0 14px', background: '#1e2337', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8, color: '#cbd5e1', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6
            }}>
            <Upload size={14} /> Import File
          </button>
          <button onClick={() => { setEditItem(null); setFormOpen(true); }}
            style={{
              height: 36, padding: '0 16px', background: '#7c3aed', border: 'none',
              borderRadius: 8, color: '#ffffff', fontSize: 12, fontWeight: 800, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 10px rgba(124,58,237,0.3)'
            }}>
            <Plus size={15} /> Add Item
          </button>
        </div>
      </div>

      {/* FILTER TOOLBAR */}
      <div style={{
        background: '#151928', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
        padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, SKU, barcode..."
            style={{ width: '100%', height: 34, paddingLeft: 32, paddingRight: 10, background: '#1e2337', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#ffffff', fontSize: 12, outline: 'none' }} />
        </div>

        {/* Category Filter */}
        <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}
          style={{ height: 34, background: '#1e2337', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '0 10px', color: '#f8fafc', fontSize: 12, outline: 'none' }}>
          <option value="All">All Categories</option>
          {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {/* Unit Filter */}
        <select value={selectedUnit} onChange={e => setSelectedUnit(e.target.value)}
          style={{ height: 34, background: '#1e2337', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '0 10px', color: '#f8fafc', fontSize: 12, outline: 'none' }}>
          <option value="All">All Units</option>
          {units.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
        </select>

        {/* Status Filter */}
        <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}
          style={{ height: 34, background: '#1e2337', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '0 10px', color: '#f8fafc', fontSize: 12, outline: 'none' }}>
          <option value="All">All Statuses</option>
          <option value="Low Stock">Needs Reorder (Low)</option>
          <option value="Out of Stock">Out of Stock</option>
          <option value="Active">Active Only</option>
          <option value="Inactive">Deactivated Only</option>
        </select>

        {/* View Toggle */}
        <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, overflow: 'hidden' }}>
          <button onClick={() => setViewMode('table')} style={{ height: 34, width: 36, background: viewMode === 'table' ? '#7c3aed' : '#1e2337', border: 'none', color: '#ffffff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <List size={15} />
          </button>
          <button onClick={() => setViewMode('grid')} style={{ height: 34, width: 36, background: viewMode === 'grid' ? '#7c3aed' : '#1e2337', border: 'none', color: '#ffffff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Grid size={15} />
          </button>
        </div>
      </div>

      {/* BULK ACTIONS BANNER (Displays when items are checked) */}
      {selectedIds.length > 0 && (
        <div style={{
          background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.5)', borderRadius: 8,
          padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          animation: 'fadeIn 200ms ease'
        }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#c4b5fd' }}>
            {selectedIds.length} items selected in current page
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleExportSelected}
              style={{ height: 30, padding: '0 14px', background: '#1e2337', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#ffffff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              Export Selected (.csv)
            </button>
            <button onClick={handleBulkDeactivate}
              style={{ height: 30, padding: '0 14px', background: '#ef4444', border: 'none', borderRadius: 6, color: '#ffffff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              Deactivate Selected
            </button>
          </div>
        </div>
      )}

      {/* DATA LAYOUT VIEW */}
      {isLoading ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 13, background: '#151928', borderRadius: 10 }}>
          Loading raw materials list...
        </div>
      ) : filteredItems.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 13, background: '#151928', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 10 }}>
          No inventory items matched your filter query.
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW */
        <div style={{
          background: '#151928', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, overflowX: 'auto', maxHeight: 'calc(100vh - 280px)', overflowY: 'auto',
          boxShadow: '0 6px 24px rgba(0,0,0,0.3)'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#1e2337', borderBottom: '2px solid rgba(255,255,255,0.12)' }}>
                  <th style={{ padding: '12px 14px', width: 34 }}>
                    <input type="checkbox" checked={paginatedItems.length > 0 && selectedIds.length === paginatedItems.length} onChange={toggleSelectAll} style={{ cursor: 'pointer', accentColor: '#7c3aed' }} />
                  </th>
                  {['Image', 'Item Details', 'Category', 'Unit', 'On Hand', 'Threshold', 'Cost/Unit', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 800, color: '#e2e8f0', fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((it: any) => {
                  const stock = Number(it.currentStock);
                  const threshold = Number(it.thresholdQty);
                  const badge = getStatusBadge(stock, threshold);
                  const isOutOfStock = stock <= 0;
                  const isLow = stock > 0 && stock <= threshold;
                  return (
                    <tr key={it.id} style={{
                      borderBottom: '1px solid rgba(255,255,255,0.06)', background: !it.isActive ? 'rgba(0,0,0,0.25)' : 'transparent',
                      opacity: !it.isActive ? 0.6 : 1, transition: 'background 150ms'
                    }} className="hover:bg-white/[0.04]">
                      <td style={{ padding: '12px 14px' }}>
                        <input type="checkbox" checked={selectedIds.includes(it.id)} onChange={() => toggleSelectItem(it.id)} style={{ cursor: 'pointer', accentColor: '#7c3aed' }} />
                      </td>
                      <td style={{ padding: '12px 14px', width: 44 }}>
                        {it.image ? (
                          <img
                            src={resolveImageUrl(it.image)}
                            alt={it.name}
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = 'none';
                              const fallback = (e.currentTarget.parentElement?.querySelector('.img-fallback') as HTMLElement);
                              if (fallback) fallback.style.display = 'flex';
                            }}
                            style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }}
                          />
                        ) : null}
                        <div
                          className="img-fallback"
                          style={{
                            width: 36, height: 36, borderRadius: 8,
                            display: it.image ? 'none' : 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            background: 'linear-gradient(135deg, rgba(124,58,237,0.25) 0%, rgba(59,130,246,0.25) 100%)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            color: '#a78bfa'
                          }}
                        >
                          <Package size={18} />
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 800, color: '#ffffff', fontSize: 13 }}>{it.name}</div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3, display: 'flex', gap: 8, fontFamily: 'monospace' }}>
                          {it.sku && <span>SKU: <strong style={{ color: '#cbd5e1' }}>{it.sku}</strong></span>}
                          {it.barcode && <span>Barcode: <strong style={{ color: '#cbd5e1' }}>{it.barcode}</strong></span>}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', color: '#60a5fa', fontWeight: 600 }}>{it.category?.name || '—'}</td>
                      <td style={{ padding: '12px 14px', color: '#cbd5e1', fontWeight: 600 }}>{it.unit?.name || '—'} {it.unit?.symbol ? `(${it.unit.symbol})` : ''}</td>
                      <td style={{
                        padding: '12px 14px', fontWeight: 800, fontSize: 13,
                        color: isOutOfStock ? '#f87171' : isLow ? '#fbbf24' : '#34d399',
                        fontFamily: 'monospace'
                      }}>
                        {stock.toFixed(2)}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#cbd5e1', fontWeight: 600, fontFamily: 'monospace' }}>{threshold.toFixed(2)}</td>
                      <td style={{ padding: '12px 14px', color: '#f8fafc', fontWeight: 700, fontFamily: 'monospace' }}>₹{Number(it.costPerUnit || 0).toFixed(2)}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          display: 'inline-flex', padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 800,
                          background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`
                        }}>{badge.label}</span>
                      </td>
                      <td style={{ padding: '12px 14px', width: 140 }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => { setEditItem(it); setFormOpen(true); }}
                            style={{ height: 28, width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 6, cursor: 'pointer', color: '#60a5fa' }} title="Edit">
                            <Edit2 size={12} />
                          </button>
                          <button onClick={() => { setStockItem(it); setStockOpen(true); }}
                            style={{ height: 28, width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, cursor: 'pointer', color: '#34d399' }} title="Add Stock">
                            <PlusCircle size={12} />
                          </button>
                          <button onClick={() => toggleMutation.mutate({ id: it.id, isActive: !it.isActive })}
                            style={{ height: 28, width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: it.isActive ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)', border: it.isActive ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(16,185,129,0.3)', borderRadius: 6, cursor: 'pointer', color: it.isActive ? '#f87171' : '#34d399' }} title={it.isActive ? 'Deactivate' : 'Activate'}>
                            {it.isActive ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        </div>
      ) : (
        /* CARD GRID VIEW */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {paginatedItems.map((it: any) => {
            const stock = Number(it.currentStock);
            const threshold = Number(it.thresholdQty);
            const badge = getStatusBadge(stock, threshold);
            const isOutOfStock = stock <= 0;
            const isLow = stock > 0 && stock <= threshold;
            return (
              <div key={it.id} style={{
                background: '#151928',
                border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: 14,
                display: 'flex', flexDirection: 'column', gap: 10,
                boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                opacity: !it.isActive ? 0.6 : 1
              }}>
                <div style={{ position: 'relative', width: '100%', height: 110, borderRadius: 8, overflow: 'hidden', background: '#1e2337', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {it.image ? (
                    <img
                      src={resolveImageUrl(it.image)}
                      alt={it.name}
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                        const fallback = (e.currentTarget.parentElement?.querySelector('.grid-img-fallback') as HTMLElement);
                        if (fallback) fallback.style.display = 'flex';
                      }}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : null}
                  <div
                    className="grid-img-fallback"
                    style={{
                      width: '100%', height: '100%',
                      display: it.image ? 'none' : 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      background: 'linear-gradient(135deg, rgba(124,58,237,0.25) 0%, rgba(59,130,246,0.25) 100%)',
                      color: '#a78bfa'
                    }}
                  >
                    <Package size={32} />
                  </div>
                  <span style={{
                    position: 'absolute', top: 8, right: 8, padding: '3px 10px', borderRadius: 20, fontSize: 9, fontWeight: 800,
                    background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, backdropFilter: 'blur(6px)'
                  }}>{badge.label}</span>
                </div>

                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#ffffff' }}>{it.name}</div>
                  <div style={{ fontSize: 10, color: '#60a5fa', fontWeight: 600, marginTop: 2 }}>{it.category?.name || 'Category'}</div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
                  <div>
                    <span style={{ fontSize: 16, fontWeight: 900, color: isOutOfStock ? '#f87171' : isLow ? '#fbbf24' : '#34d399', fontFamily: 'monospace' }}>
                      {stock.toFixed(1)}
                    </span>
                    <span style={{ fontSize: 10, color: '#cbd5e1', marginLeft: 4, fontWeight: 600 }}>{it.unit?.symbol || ''}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#f8fafc', fontWeight: 700, fontFamily: 'monospace' }}>
                    Cost: ₹{Number(it.costPerUnit || 0).toFixed(0)}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10, marginTop: 4 }}>
                  <button onClick={() => { setEditItem(it); setFormOpen(true); }}
                    style={{ flex: 1, height: 30, background: '#1e2337', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#ffffff', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Edit2 size={11} /> Edit
                  </button>
                  <button onClick={() => { setStockItem(it); setStockOpen(true); }}
                    style={{ flex: 1, height: 30, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, color: '#34d399', fontSize: 11, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <PlusCircle size={11} /> + Stock
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PAGINATION BAR */}
      {!isLoading && filteredItems.length > 0 && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontSize: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
            <span>Page Size:</span>
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 4px', color: 'var(--text)', outline: 'none' }}>
              {[10, 25, 50, 100].map(sz => <option key={sz} value={sz}>{sz}</option>)}
            </select>
            <span>Showing {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredItems.length)} of {filteredItems.length} items</span>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              style={{ height: 24, padding: '0 10px', background: currentPage === 1 ? 'transparent' : 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 6, color: currentPage === 1 ? 'var(--text-disabled)' : '#fff', cursor: currentPage === 1 ? 'default' : 'pointer' }}>
              Previous
            </button>
            <span style={{ alignSelf: 'center', color: 'var(--text-secondary)', padding: '0 8px' }}>Page {currentPage} of {totalPages}</span>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
              style={{ height: 24, padding: '0 10px', background: currentPage === totalPages ? 'transparent' : 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 6, color: currentPage === totalPages ? 'var(--text-disabled)' : '#fff', cursor: currentPage === totalPages ? 'default' : 'pointer' }}>
              Next
            </button>
          </div>
        </div>
      )}

      {/* Item Add/Edit Slide Panel */}
      <ItemFormModal isOpen={formOpen} onClose={() => setFormOpen(false)} editItem={editItem} />

      {/* Adjust Stock Entry Modal */}
      <AddStockModal isOpen={stockOpen} onClose={() => setStockOpen(false)} item={stockItem} />

      {/* Bulk Upload Modal */}
      <ImportModal isOpen={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
