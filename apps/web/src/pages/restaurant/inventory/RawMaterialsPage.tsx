import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import {
  Search, Grid, List, Download, Upload, Plus, Edit2, PlusCircle, DollarSign,
  History, Trash2, Eye, EyeOff, LayoutGrid, AlertTriangle, ArrowUpDown
} from 'lucide-react';
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
    if (stock === 0) return { label: 'Out of Stock', bg: 'rgba(239,68,68,0.12)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' };
    if (stock <= threshold) return { label: 'Low Stock', bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' };
    return { label: 'In Stock', bg: 'rgba(16,185,129,0.12)', color: '#10b981', border: 'rgba(16,185,129,0.3)' };
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
          <h1 style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Raw Materials Directory</h1>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>Manage ingredients, stock alerts, barcodes and supplier costs</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setImportOpen(true)}
            style={{
              height: 34, padding: '0 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6
            }}>
            <Upload size={14} /> Import File
          </button>
          <button onClick={() => { setEditItem(null); setFormOpen(true); }}
            style={{
              height: 34, padding: '0 14px', background: '#7c3aed', border: 'none',
              borderRadius: 8, color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6
            }}>
            <Plus size={14} /> Add Item
          </button>
        </div>
      </div>

      {/* FILTER TOOLBAR */}
      <div style={{
        background: 'rgba(var(--bg-secondary-rgb), 0.5)', border: '1px solid var(--border)', borderRadius: 10,
        padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center'
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, SKU, barcode..."
            style={{ width: '100%', height: 32, paddingLeft: 30, paddingRight: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 11, outline: 'none' }} />
        </div>

        {/* Category Filter */}
        <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}
          style={{ height: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', color: 'var(--text)', fontSize: 11, outline: 'none' }}>
          <option value="All">All Categories</option>
          {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {/* Unit Filter */}
        <select value={selectedUnit} onChange={e => setSelectedUnit(e.target.value)}
          style={{ height: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', color: 'var(--text)', fontSize: 11, outline: 'none' }}>
          <option value="All">All Units</option>
          {units.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
        </select>

        {/* Status Filter */}
        <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}
          style={{ height: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', color: 'var(--text)', fontSize: 11, outline: 'none' }}>
          <option value="All">All Statuses</option>
          <option value="Low Stock">Needs Reorder (Low)</option>
          <option value="Out of Stock">Out of Stock</option>
          <option value="Active">Active Only</option>
          <option value="Inactive">Deactivated Only</option>
        </select>

        {/* View Toggle */}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <button onClick={() => setViewMode('table')} style={{ height: 30, width: 34, background: viewMode === 'table' ? '#7c3aed' : 'rgba(0,0,0,0.2)', border: 'none', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <List size={14} />
          </button>
          <button onClick={() => setViewMode('grid')} style={{ height: 30, width: 34, background: viewMode === 'grid' ? '#7c3aed' : 'rgba(0,0,0,0.2)', border: 'none', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Grid size={14} />
          </button>
        </div>
      </div>

      {/* BULK ACTIONS BANNER (Displays when items are checked) */}
      {selectedIds.length > 0 && (
        <div style={{
          background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.4)', borderRadius: 8,
          padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          animation: 'fadeIn 200ms ease'
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa' }}>
            {selectedIds.length} items selected in current page
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleExportSelected}
              style={{ height: 28, padding: '0 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
              Export Selected (.csv)
            </button>
            <button onClick={handleBulkDeactivate}
              style={{ height: 28, padding: '0 12px', background: '#ef4444', border: 'none', borderRadius: 6, color: 'var(--text)', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
              Deactivate Selected
            </button>
          </div>
        </div>
      )}

      {/* DATA LAYOUT VIEW */}
      {isLoading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
          Loading raw materials list...
        </div>
      ) : filteredItems.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, border: '1px dashed var(--border)', borderRadius: 10 }}>
          No inventory items matched your filter query.
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW */
        <div style={{
          background: 'rgba(var(--bg-secondary-rgb), 0.3)', border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto', maxHeight: 'calc(100vh - 280px)', overflowY: 'auto'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '10px 14px', width: 30 }}>
                    <input type="checkbox" checked={paginatedItems.length > 0 && selectedIds.length === paginatedItems.length} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                  </th>
                  {['Image', 'Item Details', 'Category', 'Unit', 'On Hand', 'Threshold', 'Cost/Unit', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 10 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((it: any) => {
                  const badge = getStatusBadge(Number(it.currentStock), Number(it.thresholdQty));
                  return (
                    <tr key={it.id} style={{
                      borderBottom: '1px solid rgba(42,45,62,0.5)', background: !it.isActive ? 'rgba(0,0,0,0.1)' : 'transparent',
                      opacity: !it.isActive ? 0.6 : 1, transition: 'background 200ms'
                    }} className="table-row">
                      <td style={{ padding: '10px 14px' }}>
                        <input type="checkbox" checked={selectedIds.includes(it.id)} onChange={() => toggleSelectItem(it.id)} style={{ cursor: 'pointer' }} />
                      </td>
                      <td style={{ padding: '10px 14px', width: 44 }}>
                        <img src={it.image || `https://loremflickr.com/100/100/food?lock=${it.id}`}
                          style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover', background: 'rgba(0,0,0,0.1)' }} />
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 11 }}>{it.name}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 6 }}>
                          {it.sku && <span>SKU: {it.sku}</span>}
                          {it.barcode && <span>Barcode: {it.barcode}</span>}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{it.category?.name || '—'}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{it.unit?.name || '—'} ({it.unit?.symbol || ''})</td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: Number(it.currentStock) === 0 ? '#ef4444' : '#fff', fontFamily: 'monospace' }}>
                        {Number(it.currentStock).toFixed(2)}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{Number(it.thresholdQty).toFixed(2)}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>₹{Number(it.costPerUnit || 0).toFixed(2)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          display: 'inline-flex', padding: '2px 8px', borderRadius: 20, fontSize: 9, fontWeight: 700,
                          background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`
                        }}>{badge.label}</span>
                      </td>
                      <td style={{ padding: '10px 14px', width: 140 }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => { setEditItem(it); setFormOpen(true); }}
                            style={{ height: 24, width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: '#3b82f6' }} title="Edit">
                            <Edit2 size={11} />
                          </button>
                          <button onClick={() => { setStockItem(it); setStockOpen(true); }}
                            style={{ height: 24, width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 6, cursor: 'pointer', color: '#10b981' }} title="Add Stock">
                            <PlusCircle size={11} />
                          </button>
                          <button onClick={() => toggleMutation.mutate({ id: it.id, isActive: !it.isActive })}
                            style={{ height: 24, width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: it.isActive ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', border: it.isActive ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(16,185,129,0.2)', borderRadius: 6, cursor: 'pointer', color: it.isActive ? '#ef4444' : '#10b981' }} title={it.isActive ? 'Deactivate' : 'Activate'}>
                            {it.isActive ? <EyeOff size={11} /> : <Eye size={11} />}
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
            const badge = getStatusBadge(Number(it.currentStock), Number(it.thresholdQty));
            return (
              <div key={it.id} style={{
                background: 'rgba(var(--bg-secondary-rgb), 0.8)', backdropFilter: 'blur(12px)',
                border: '1px solid var(--border)', borderRadius: 12, padding: 12,
                display: 'flex', flexDirection: 'column', gap: 10,
                opacity: !it.isActive ? 0.6 : 1
              }}>
                <div style={{ position: 'relative', width: '100%', height: 110, borderRadius: 8, overflow: 'hidden', background: 'rgba(0,0,0,0.2)' }}>
                  <img src={it.image || `https://loremflickr.com/200/200/food?lock=${it.id}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <span style={{
                    position: 'absolute', top: 8, right: 8, padding: '2px 8px', borderRadius: 20, fontSize: 8, fontWeight: 800,
                    background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, backdropFilter: 'blur(4px)'
                  }}>{badge.label}</span>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>{it.name}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{it.category?.name || 'Category'}</div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
                  <div>
                    <span style={{ fontSize: 16, fontWeight: 900, color: Number(it.currentStock) === 0 ? '#ef4444' : '#fff', fontFamily: 'monospace' }}>
                      {Number(it.currentStock).toFixed(1)}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 3 }}>{it.unit?.symbol}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                    Cost: ₹{Number(it.costPerUnit || 0).toFixed(0)}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 10, marginTop: 4 }}>
                  <button onClick={() => { setEditItem(it); setFormOpen(true); }}
                    style={{ flex: 1, height: 28, background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 10, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Edit2 size={10} /> Edit
                  </button>
                  <button onClick={() => { setStockItem(it); setStockOpen(true); }}
                    style={{ flex: 1, height: 28, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 6, color: '#10b981', fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <PlusCircle size={10} /> + Stock
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
