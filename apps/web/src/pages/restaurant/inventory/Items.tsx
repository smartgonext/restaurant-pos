import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, useEffect } from 'react';
import api from '@/lib/api';
import { resolveImageUrl } from '@/lib/utils';
import { API_BASE_URL } from '@/lib/config';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useSocket } from '@/hooks/useSocket';

import { FilterBar } from '@/components/ui/FilterBar';

export default function Items() {
  const queryClient = useQueryClient();
  const { socket } = useSocket();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [mrpModalItem, setMrpModalItem] = useState<any | null>(null);
  const [mrpLoading, setMrpLoading] = useState(false);
  const [mrps, setMrps] = useState<any[]>([]);
  const [newMrp, setNewMrp] = useState<{ mrp?: number; purchaseRate?: number; supplierId?: number }>({});
  const [stockModalItem, setStockModalItem] = useState<any | null>(null);
  const [stockQty, setStockQty] = useState<number | ''>('');

  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState<any>({ name: '', categoryId: undefined, unitId: undefined, thresholdQty: 0, costPerUnit: 0 });
  const [editItem, setEditItem] = useState<any | null>(null);

  const { data: categories = [] } = useQuery({ queryKey: ['inventory-categories'], queryFn: () => api.get('/restaurant/inventory/categories').then(r => r.data.data) });
  const { data: units = [] } = useQuery({ queryKey: ['inventory-units'], queryFn: () => api.get('/restaurant/inventory/units').then(r => r.data.data) });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: () => api.get('/restaurant/inventory/items').then(r => r.data.data),
  });

  const handleFile = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setUploading(true);
    try {
      const res = await api.post('/restaurant/inventory/bulk-upload', fd);
      const d = res.data?.data;
      alert(`Bulk upload completed. Created: ${d?.created || 0}, Updated: ${d?.updated || 0}, Errors: ${d?.errors?.length || 0}`);
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
    } catch (err: any) {
      alert('Upload failed: ' + (err?.response?.data?.error || err?.message || String(err)));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const openMrpModal = async (item: any) => {
    setMrpModalItem(item);
    setMrpLoading(true);
    try {
      const res = await api.get(`/restaurant/inventory/items/${item.id}`);
      setMrps(res.data.data.inventoryMRPs || []);
    } catch (err) {
      alert('Failed to load MRPs');
    } finally {
      setMrpLoading(false);
    }
  };

  const createItem = async () => {
    try {
      if (!newItem.name || !newItem.categoryId || !newItem.unitId) return alert('Please fill name, category and unit');
      await api.post('/restaurant/inventory/items', { name: newItem.name, categoryId: Number(newItem.categoryId), unitId: Number(newItem.unitId), thresholdQty: Number(newItem.thresholdQty || 0), costPerUnit: Number(newItem.costPerUnit || 0) });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      setShowAdd(false);
      setNewItem({ name: '', categoryId: undefined, unitId: undefined, thresholdQty: 0, costPerUnit: 0 });
    } catch (err: any) {
      alert('Failed to create item: ' + (err?.response?.data?.error || err?.message || String(err)));
    }
  };

  const updateItem = async () => {
    if (!editItem) return;
    try {
      await api.put(`/restaurant/inventory/items/${editItem.id}`, { name: editItem.name, categoryId: Number(editItem.categoryId), unitId: Number(editItem.unitId), thresholdQty: Number(editItem.thresholdQty || 0), costPerUnit: Number(editItem.costPerUnit || 0) });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      setEditItem(null);
    } catch (err: any) {
      alert('Failed to update item: ' + (err?.response?.data?.error || err?.message || String(err)));
    }
  };

  const deleteItem = async (id: number) => {
    if (!confirm('Delete this item? This cannot be undone if there are no references.')) return;
    try {
      await api.delete(`/restaurant/inventory/items/${id}`);
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
    } catch (err: any) {
      alert('Delete failed: ' + (err?.response?.data?.error || err?.message || String(err)));
    }
  };

  const createMrp = async () => {
    if (!mrpModalItem) return;
    try {
      const pr = newMrp.purchaseRate !== undefined ? Number(newMrp.purchaseRate) : undefined;
      const mrpVal = newMrp.mrp !== undefined ? Number(newMrp.mrp) : undefined;
      let profitPct: number | undefined;
      if (pr !== undefined && mrpVal !== undefined && pr > 0) {
        profitPct = Math.round(((mrpVal - pr) / pr) * 10000) / 100;
      }
      await api.post('/restaurant/inventory/mrps', { inventoryItemId: mrpModalItem.id, mrp: mrpVal ?? 0, purchaseRate: pr ?? 0, supplierId: newMrp.supplierId, profitPercent: profitPct ?? 0 });
      await openMrpModal(mrpModalItem);
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      setNewMrp({});
    } catch (err: any) {
      alert('Failed to create MRP: ' + (err?.response?.data?.error || err?.message || String(err)));
    }
  };

  useEffect(() => {
    if (!socket) return;
    const onUpdated = () => queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
    socket.on('inventory.item.updated', onUpdated);
    socket.on('inventory.movement.created', onUpdated);
    socket.on('purchaseOrder.received', onUpdated);
    socket.on('purchaseOrder.created', onUpdated);
    return () => {
      socket.off('inventory.item.updated', onUpdated);
      socket.off('inventory.movement.created', onUpdated);
      socket.off('purchaseOrder.received', onUpdated);
      socket.off('purchaseOrder.created', onUpdated);
    };
  }, [socket, queryClient]);

  if (isLoading) return <div className="p-8 text-center text-text-muted">Loading items...</div>;

  const availableCount = items.filter((i: any) => Number(i.currentStock) > 0).length;
  const lowCount = items.filter((i: any) => Number(i.currentStock) <= Number(i.thresholdQty)).length;
  const outCount = items.filter((i: any) => Number(i.currentStock) === 0).length;
  const filteredItems = items.filter((it: any) => {
    const q = String(search || '').toLowerCase().trim();
    const catMatch = !selectedCategory || String(it.categoryId) === selectedCategory;
    if (!catMatch) return false;
    if (!q) return true;
    return (
      String(it.name || '').toLowerCase().includes(q) ||
      String(it.category?.name || '').toLowerCase().includes(q) ||
      String(it.barcode || '').toLowerCase().includes(q) ||
      String(it.sku || '').toLowerCase().includes(q) ||
      String(it.id || '') === q
    );
  });

  return (
    <div className="space-y-4 animate-in">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h1 className="text-2xl font-black text-text-primary">Inventory Items</h1>
          <p className="text-xs text-text-muted mt-1">Manage raw materials and stocked items</p>

          <div className="mt-4 grid grid-cols-4 gap-4">
            <div className="p-4 bg-bg-tertiary rounded-lg border border-border/50">
              <div className="text-sm text-text-muted">Available Items</div>
              <div className="text-xl font-black">{availableCount}</div>
            </div>
            <div className="p-4 bg-bg-tertiary rounded-lg border border-border/50">
              <div className="text-sm text-text-muted">Low Stock Items</div>
              <div className="text-xl font-black">{lowCount}</div>
            </div>
            <div className="p-4 bg-bg-tertiary rounded-lg border border-border/50">
              <div className="text-sm text-text-muted">Out of Stock</div>
              <div className="text-xl font-black">{outCount}</div>
            </div>
            <div className="p-4 bg-bg-tertiary rounded-lg border border-border/50">
              <div className="text-sm text-text-muted">Total Cost</div>
              <div className="text-xl font-black">₹{items.reduce((s: number, it: any) => s + (Number(it.currentStock || 0) * Number(it.costPerUnit || 0)), 0).toFixed(2)}</div>
            </div>
          </div>
        </div>
      </div>

      <FilterBar
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search inventory by name, barcode, SKU..."
        category={selectedCategory}
        categoryOptions={categories.map((c: any) => ({ label: c.name, value: String(c.id) }))}
        onCategoryChange={setSelectedCategory}
        onExport={(fmt) => window.open(`${API_BASE_URL}/restaurant/inventory/export?format=${fmt}`, '_blank')}
        onAdd={() => setShowAdd(true)}
        addLabel="Add Raw Material"
        onReset={() => { setSearch(''); setSelectedCategory(''); }}
      />

      <Card padding={false}>
        <div className="overflow-x-auto text-[11px]">
          <table className="w-full">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border text-left">
                <th className="py-2.5 px-4 font-medium text-text-secondary">Item</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary text-center">Category</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary text-center">Unit</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary text-center">Stock</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredItems.map((it: any) => (
                <tr key={it.id} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-3 px-4 font-medium text-text-primary flex items-center gap-3">
                    {it.image ? (
                      <img
                        src={resolveImageUrl(typeof it.image === 'string' ? it.image : String(it.image || '')) || `https://ui-avatars.com/api/?name=${encodeURIComponent((it.name || '').charAt(0) || 'A')}&background=1a1c23&color=fff`}
                        alt={it.name}
                        className="w-12 h-12 object-cover rounded"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent((it.name || '').charAt(0) || 'A')}&background=1a1c23&color=fff`; }}
                      />
                    ) : (
                      <div className="w-12 h-12 rounded bg-gray-800 flex items-center justify-center text-xs text-gray-400">{(it.name || '').slice(0,1)}</div>
                    )}
                    <div>
                      <div className="font-medium">{it.name}</div>
                      <div className="text-xs text-text-muted">{it.costPerUnit ? `Cost ₹${Number(it.costPerUnit).toFixed(2)}` : ''}</div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-text-muted text-center">{it.category?.name}</td>
                  <td className="py-3 px-4 text-text-muted text-center">{it.unit?.name} ({it.unit?.symbol})</td>
                  <td className="py-3 px-4 font-mono text-text-primary font-medium text-center">{it.currentStock}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openMrpModal(it)} className="text-yellow-300 text-[10px] font-bold">MRPs</button>
                      <button onClick={() => { setStockModalItem(it); setStockQty(''); }} className="text-green-300 text-[10px] font-bold">Add Stock</button>
                      <button onClick={() => setEditItem(it)} className="text-blue-400 text-[10px] font-bold">Edit</button>
                      <button onClick={() => deleteItem(it.id)} className="text-red-400 text-[10px] font-bold">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-text-muted italic">No items found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {mrpModalItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1c23] rounded-2xl p-6 w-full max-w-2xl mx-4 border border-gray-800 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold">MRPs for {mrpModalItem.name}</h3>
              <button onClick={() => setMrpModalItem(null)} className="text-gray-400">Close</button>
            </div>
            <div className="mb-4">
              {mrpLoading ? <div className="text-sm text-gray-400">Loading...</div> : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {mrps.map(m => (
                    <div key={m.id} className="p-2 rounded bg-[#0f1014] flex items-center justify-between">
                      <div>
                        <div className="font-bold">₹{Number(m.sellingPrice ?? m.mrp).toFixed(2)}</div>
                        <div className="text-xs text-gray-400">Purchase ₹{Number(m.purchaseRate).toFixed(2)}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-xs text-gray-400">{new Date(m.createdAt).toLocaleDateString()}</div>
                        <button onClick={async () => {
                          if (!confirm('Deactivate this MRP? It will be hidden in POS.')) return;
                          try {
                            await api.delete(`/restaurant/inventory/mrps/${m.id}`);
                            await openMrpModal(mrpModalItem);
                            queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
                          } catch (err: any) {
                            alert('Failed to deactivate MRP');
                          }
                        }} className="text-red-400 text-xs">Delete</button>
                      </div>
                    </div>
                  ))}
                  {mrps.length === 0 && <div className="text-sm text-gray-400">No MRPs found.</div>}
                </div>
              )}
            </div>
            <div className="border-t border-gray-800 pt-4">
              <h4 className="text-sm text-gray-300 font-medium mb-2">Create new MRP</h4>
              <div className="grid grid-cols-3 gap-2">
                <input type="number" placeholder="Selling MRP" value={newMrp.mrp ?? ''} onChange={(e) => setNewMrp(s => ({ ...s, mrp: Number(e.target.value) }))} className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded" />
                <input type="number" placeholder="Purchase Rate" value={newMrp.purchaseRate ?? ''} onChange={(e) => setNewMrp(s => ({ ...s, purchaseRate: Number(e.target.value) }))} className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded" />
                <input type="number" placeholder="Supplier ID (optional)" value={newMrp.supplierId ?? ''} onChange={(e) => setNewMrp(s => ({ ...s, supplierId: Number(e.target.value) }))} className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded" />
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button onClick={() => setMrpModalItem(null)} className="px-3 py-2 border border-gray-700 text-gray-400 rounded">Cancel</button>
                <button onClick={createMrp} className="px-3 py-2 bg-purple-600 text-white rounded">Create MRP</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {stockModalItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1c23] rounded-2xl p-6 w-full max-w-md mx-4 border border-gray-800 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold">Add Stock - {stockModalItem.name}</h3>
              <button onClick={() => setStockModalItem(null)} className="text-gray-400">Close</button>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <input type="number" placeholder="Quantity to add" value={stockQty ?? ''} onChange={(e) => setStockQty(e.target.value === '' ? '' : Number(e.target.value))} className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded" />
              <textarea placeholder="Note (optional)" id="stock-note" className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded h-20" />
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setStockModalItem(null)} className="px-3 py-2 border border-gray-700 text-gray-400 rounded">Cancel</button>
              <button onClick={async () => {
                if (!stockModalItem) return; const qty = Number(stockQty); if (!qty || qty <= 0) { alert('Enter positive quantity'); return; }
                try {
                  const note = (document.getElementById('stock-note') as HTMLTextAreaElement)?.value || undefined;
                  await api.post(`/restaurant/inventory/items/${stockModalItem.id}/movements`, { type: 'purchase', quantity: qty, note });
                  queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
                  setStockModalItem(null);
                  alert('Stock updated');
                } catch (err: any) {
                  alert('Failed to update stock: ' + (err?.response?.data?.error || err?.message || String(err)));
                }
              }} className="px-3 py-2 bg-green-600 text-white rounded">Add Stock</button>
            </div>
          </div>
        </div>
      )}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1c23] rounded-2xl p-6 w-full max-w-2xl mx-4 border border-gray-800 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold">Create Inventory Item</h3>
              <button onClick={() => setShowAdd(false)} className="text-gray-400">Close</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Name" value={newItem.name} onChange={(e) => setNewItem((s: any) => ({ ...s, name: e.target.value }))} className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded" />
              <select value={newItem.categoryId ?? ''} onChange={(e) => setNewItem((s: any) => ({ ...s, categoryId: Number(e.target.value) }))} className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded">
                <option value="">Select category</option>
                {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={newItem.unitId ?? ''} onChange={(e) => setNewItem((s: any) => ({ ...s, unitId: Number(e.target.value) }))} className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded">
                <option value="">Select unit</option>
                {units.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
              </select>
              <input type="number" placeholder="Threshold Qty" value={newItem.thresholdQty ?? ''} onChange={(e) => setNewItem((s: any) => ({ ...s, thresholdQty: Number(e.target.value) }))} className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded" />
              <input type="number" placeholder="Cost Per Unit" value={newItem.costPerUnit ?? ''} onChange={(e) => setNewItem((s: any) => ({ ...s, costPerUnit: Number(e.target.value) }))} className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded" />
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="px-3 py-2 border border-gray-700 text-gray-400 rounded">Cancel</button>
              <button onClick={createItem} className="px-3 py-2 bg-purple-600 text-white rounded">Create</button>
            </div>
          </div>
        </div>
      )}

      {editItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1c23] rounded-2xl p-6 w-full max-w-2xl mx-4 border border-gray-800 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold">Edit Inventory Item</h3>
              <button onClick={() => setEditItem(null)} className="text-gray-400">Close</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Name" value={editItem.name ?? ''} onChange={(e) => setEditItem((s: any) => ({ ...s, name: e.target.value }))} className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded" />
              <select value={editItem.categoryId ?? ''} onChange={(e) => setEditItem((s: any) => ({ ...s, categoryId: Number(e.target.value) }))} className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded">
                <option value="">Select category</option>
                {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={editItem.unitId ?? ''} onChange={(e) => setEditItem((s: any) => ({ ...s, unitId: Number(e.target.value) }))} className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded">
                <option value="">Select unit</option>
                {units.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
              </select>
              <input type="number" placeholder="Threshold Qty" value={editItem.thresholdQty ?? ''} onChange={(e) => setEditItem((s: any) => ({ ...s, thresholdQty: Number(e.target.value) }))} className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded" />
              <input type="number" placeholder="Cost Per Unit" value={editItem.costPerUnit ?? ''} onChange={(e) => setEditItem((s: any) => ({ ...s, costPerUnit: Number(e.target.value) }))} className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded" />
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setEditItem(null)} className="px-3 py-2 border border-gray-700 text-gray-400 rounded">Cancel</button>
              <button onClick={updateItem} className="px-3 py-2 bg-purple-600 text-white rounded">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
