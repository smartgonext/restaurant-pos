import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import api from '@/lib/api';
import { API_BASE_URL } from '@/lib/config';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export default function Stocks() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showStockModal, setShowStockModal] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [stockQty, setStockQty] = useState<number | ''>('');
  const [stockType, setStockType] = useState<'purchase' | 'sale' | 'waste' | 'transfer'>('purchase');

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['inventory-items-stocks'],
    queryFn: () => api.get('/restaurant/inventory/items').then(r => r.data.data),
  });

  if (isLoading) return <div className="p-8 text-center text-text-muted">Loading stocks...</div>;

  return (
    <div className="space-y-4 animate-in">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-text-primary">Stock Inventory</h1>
          </div>
          <p className="text-xs text-text-muted mt-1">Manage and monitor your restaurant's inventory items</p>

          <div className="mt-4 grid grid-cols-4 gap-4">
            <div className="p-4 bg-bg-tertiary rounded-lg border border-border/50">
              <div className="text-sm text-text-muted">Available Items</div>
              <div className="text-xl font-black">{items.filter((i: any) => Number(i.currentStock) > 0).length}</div>
            </div>
            <div className="p-4 bg-bg-tertiary rounded-lg border border-border/50">
              <div className="text-sm text-text-muted">Low Stock Items</div>
              <div className="text-xl font-black">{items.filter((i: any) => Number(i.currentStock) <= Number(i.thresholdQty)).length}</div>
            </div>
            <div className="p-4 bg-bg-tertiary rounded-lg border border-border/50">
              <div className="text-sm text-text-muted">Out of Stock</div>
              <div className="text-xl font-black">{items.filter((i: any) => Number(i.currentStock) === 0).length}</div>
            </div>
            <div className="p-4 bg-bg-tertiary rounded-lg border border-border/50">
              <div className="text-sm text-text-muted">Total Cost</div>
              <div className="text-xl font-black">₹{items.reduce((s: number, it: any) => s + (Number(it.currentStock || 0) * Number(it.costPerUnit || 0)), 0).toFixed(2)}</div>
            </div>
          </div>

          <div className="mt-4">
            <div className="relative w-full max-w-2xl">
              <input value={search} onChange={(e) => setSearch(e.target.value)} className="glass-input w-full pl-4 h-11 text-sm" placeholder="Search items..." />
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => window.open(`${API_BASE_URL}/restaurant/inventory/export?format=csv`, '_blank')}>Export CSV</Button>
            <Button size="sm" onClick={() => window.open(`${API_BASE_URL}/restaurant/inventory/export?format=xlsx`, '_blank')}>Export XLSX</Button>
          </div>
          <Button className="bg-purple-600" onClick={() => setShowStockModal(true)}>Add Stock Entry</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Card>
          <div className="overflow-x-auto text-[11px]">
            <table className="w-full">
              <thead>
                <tr className="bg-bg-tertiary/50 border-b border-border text-left">
                  <th className="py-2.5 px-4 font-medium text-text-secondary">ITEM NAME</th>
                  <th className="py-2.5 px-4 font-medium text-text-secondary">CATEGORY</th>
                  <th className="py-2.5 px-4 font-medium text-text-secondary">UNIT</th>
                  <th className="py-2.5 px-4 font-medium text-text-secondary">CURRENT STOCK</th>
                  <th className="py-2.5 px-4 font-medium text-text-secondary text-right">COST</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {items.filter((it: any) => it.name.toLowerCase().includes(search.toLowerCase())).map((it: any) => (
                  <tr key={it.id} className="hover:bg-bg-hover/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-text-primary">{it.name}</td>
                    <td className="py-3 px-4 text-text-muted">{it.category?.name}</td>
                    <td className="py-3 px-4 text-text-muted">{it.unit?.name} ({it.unit?.symbol})</td>
                    <td className="py-3 px-4 font-mono text-text-primary font-medium">{it.currentStock} {it.unit?.symbol}</td>
                    <td className="py-3 px-4 text-right font-mono">₹{(Number(it.currentStock || 0) * Number(it.costPerUnit || 0)).toFixed(2)}</td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-text-muted italic">No stock data available.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {showStockModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1c23] rounded-2xl p-6 w-full max-w-md mx-4 border border-gray-800 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold">Add Stock Entry</h3>
              <button onClick={() => setShowStockModal(false)} className="text-gray-400">Close</button>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <div className="flex gap-2">
                <button className={stockType === 'purchase' ? 'px-3 py-2 bg-indigo-700 rounded' : 'px-3 py-2 border rounded'} onClick={() => setStockType('purchase')}>Stock In</button>
                <button className={stockType === 'sale' ? 'px-3 py-2 bg-red-700 rounded' : 'px-3 py-2 border rounded'} onClick={() => setStockType('sale')}>Stock Out</button>
                <button className={stockType === 'waste' ? 'px-3 py-2 bg-yellow-700 rounded' : 'px-3 py-2 border rounded'} onClick={() => setStockType('waste')}>Waste</button>
                <button className={stockType === 'transfer' ? 'px-3 py-2 bg-blue-700 rounded' : 'px-3 py-2 border rounded'} onClick={() => setStockType('transfer')}>Transfer</button>
              </div>
              <select value={selectedItemId ?? ''} onChange={(e) => setSelectedItemId(Number(e.target.value))} className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded">
                <option value="">Select item to update</option>
                {items.map((it: any) => <option key={it.id} value={it.id}>{it.name} · {it.currentStock} {it.unit?.symbol}</option>)}
              </select>
              <input type="number" placeholder="Quantity" value={stockQty ?? ''} onChange={(e) => setStockQty(e.target.value === '' ? '' : Number(e.target.value))} className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded" />
              <textarea placeholder="Note (optional)" id="stock-note" className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded h-20" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowStockModal(false)} className="px-3 py-2 border border-gray-700 text-gray-400 rounded">Cancel</button>
              <button onClick={async () => {
                if (!selectedItemId) return alert('Select an item');
                const qty = Number(stockQty);
                if (!qty || qty <= 0) return alert('Enter positive quantity');
                try {
                  const note = (document.getElementById('stock-note') as HTMLTextAreaElement)?.value || undefined;
                  await api.post(`/restaurant/inventory/items/${selectedItemId}/movements`, { type: stockType, quantity: qty, note });
                  qc.invalidateQueries({ queryKey: ['inventory-items-stocks'] });
                  qc.invalidateQueries({ queryKey: ['inventory-items'] });
                  setShowStockModal(false);
                  alert('Stock updated');
                } catch (err: any) {
                  alert('Failed to update stock: ' + (err?.response?.data?.error || err?.message || String(err)));
                }
              }} className="px-3 py-2 bg-green-600 text-white rounded">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
