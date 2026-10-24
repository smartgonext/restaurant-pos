import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useState } from 'react';

export default function Categories() {
  const qc = useQueryClient();
  const { data: cats = [], isLoading } = useQuery({
    queryKey: ['inventory-categories'],
    queryFn: () => api.get('/restaurant/inventory/categories').then(r => r.data.data),
  });
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<any | null>(null);

  if (isLoading) return <div className="p-8 text-center text-text-muted">Loading categories...</div>;

  return (
    <div className="space-y-4 animate-in">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h1 className="text-2xl font-black text-text-primary">Inventory Item Categories</h1>
          <p className="text-xs text-text-muted mt-1">Organize inventory items into categories</p>
          <div className="mt-4 max-w-2xl">
            <input className="glass-input w-full pl-4 h-11 text-sm" placeholder="Search categories..." />
          </div>
        </div>
        <div>
          <Button size="sm" onClick={() => setShowAdd(true)}>Add Category</Button>
        </div>
      </div>

      <Card padding={false}>
        <div className="overflow-x-auto text-[11px]">
          <table className="w-full">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border text-left">
                <th className="py-2.5 px-4 font-medium text-text-secondary">Category Name</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {cats.map((c: any) => (
                <tr key={c.id} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-3 px-4 font-medium text-text-primary">{c.name}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditing(c)} className="text-blue-400 text-[10px] font-bold">Edit</button>
                      <button onClick={async () => {
                        if (!confirm('Delete this category?')) return;
                        try {
                          await api.delete(`/restaurant/inventory/categories/${c.id}`);
                          qc.invalidateQueries({ queryKey: ['inventory-categories'] });
                          qc.invalidateQueries({ queryKey: ['inventory-items'] });
                        } catch (err: any) {
                          alert('Delete failed: ' + (err?.response?.data?.error || err?.message || String(err)));
                        }
                      }} className="text-red-400 text-[10px] font-bold">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {cats.length === 0 && (
                <tr>
                  <td colSpan={2} className="p-8 text-center text-text-muted italic">No categories found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1c23] rounded p-4 w-full max-w-sm">
            <h3 className="text-white font-bold mb-2">Add Category</h3>
            <input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full mb-2 px-3 py-2 bg-[#0f1014] border border-gray-800 rounded" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="px-3 py-2 border border-gray-700 text-gray-400 rounded">Cancel</button>
              <button onClick={async () => {
                try {
                  await api.post('/restaurant/inventory/categories', { name: newName });
                  qc.invalidateQueries({ queryKey: ['inventory-categories'] });
                  setShowAdd(false);
                  setNewName('');
                } catch (err: any) {
                  alert('Create failed: ' + (err?.response?.data?.error || err?.message || String(err)));
                }
              }} className="px-3 py-2 bg-purple-600 text-white rounded">Create</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1c23] rounded p-4 w-full max-w-sm">
            <h3 className="text-white font-bold mb-2">Edit Category</h3>
            <input placeholder="Name" value={editing.name} onChange={(e) => setEditing((s: any) => ({ ...s, name: e.target.value }))} className="w-full mb-2 px-3 py-2 bg-[#0f1014] border border-gray-800 rounded" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="px-3 py-2 border border-gray-700 text-gray-400 rounded">Cancel</button>
              <button onClick={async () => {
                try {
                  await api.put(`/restaurant/inventory/categories/${editing.id}`, { name: editing.name });
                  qc.invalidateQueries({ queryKey: ['inventory-categories'] });
                  setEditing(null);
                } catch (err: any) {
                  alert('Update failed: ' + (err?.response?.data?.error || err?.message || String(err)));
                }
              }} className="px-3 py-2 bg-purple-600 text-white rounded">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
