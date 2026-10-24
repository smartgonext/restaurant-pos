import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useState } from 'react';

export default function Suppliers() {
  const qc = useQueryClient();
  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['inventory-suppliers'],
    queryFn: () => api.get('/restaurant/inventory/suppliers').then(r => r.data.data),
  });
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [editing, setEditing] = useState<any | null>(null);

  if (isLoading) return <div className="p-8 text-center text-text-muted">Loading suppliers...</div>;

  return (
    <div className="space-y-4 animate-in">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h1 className="text-2xl font-black text-text-primary">Suppliers</h1>
          <p className="text-xs text-text-muted mt-1">Manage suppliers and contacts</p>
          <div className="mt-4 max-w-2xl">
            <input className="glass-input w-full pl-4 h-11 text-sm" placeholder="Search suppliers..." />
          </div>
        </div>
        <div>
          <Button size="sm" onClick={() => setShowAdd(true)}>Add Supplier</Button>
        </div>
      </div>

      <Card padding={false}>
        <div className="overflow-x-auto text-[11px]">
          <table className="w-full">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border text-left">
                <th className="py-2.5 px-4 font-medium text-text-secondary">Name</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary">Contact</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary">Phone</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {suppliers.map((s: any) => (
                <tr key={s.id} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-3 px-4 font-medium text-text-primary">{s.name}</td>
                  <td className="py-3 px-4 text-text-muted">{s.contactPerson}</td>
                  <td className="py-3 px-4 text-text-muted">{s.phone}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditing(s)} className="text-blue-400 text-[10px] font-bold">Edit</button>
                      <button onClick={async () => {
                        if (!confirm('Delete this supplier?')) return;
                        try {
                          await api.delete(`/restaurant/inventory/suppliers/${s.id}`);
                          qc.invalidateQueries({ queryKey: ['inventory-suppliers'] });
                        } catch (err: any) {
                          alert('Delete failed: ' + (err?.response?.data?.error || err?.message || String(err)));
                        }
                      }} className="text-red-400 text-[10px] font-bold">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {suppliers.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-text-muted italic">No suppliers found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1c23] rounded p-4 w-full max-w-sm">
            <h3 className="text-white font-bold mb-2">Add Supplier</h3>
            <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="w-full mb-2 px-3 py-2 bg-[#0f1014] border border-gray-800 rounded" />
            <input placeholder="Contact Person" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="w-full mb-2 px-3 py-2 bg-[#0f1014] border border-gray-800 rounded" />
            <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full mb-3 px-3 py-2 bg-[#0f1014] border border-gray-800 rounded" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="px-3 py-2 border border-gray-700 text-gray-400 rounded">Cancel</button>
              <button onClick={async () => {
                try {
                  await api.post('/restaurant/inventory/suppliers', { name, contactPerson, phone });
                  qc.invalidateQueries({ queryKey: ['inventory-suppliers'] });
                  setShowAdd(false);
                  setName(''); setContactPerson(''); setPhone('');
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
            <h3 className="text-white font-bold mb-2">Edit Supplier</h3>
            <input placeholder="Name" value={editing.name ?? ''} onChange={(e) => setEditing((s: any) => ({ ...s, name: e.target.value }))} className="w-full mb-2 px-3 py-2 bg-[#0f1014] border border-gray-800 rounded" />
            <input placeholder="Contact Person" value={editing.contactPerson ?? ''} onChange={(e) => setEditing((s: any) => ({ ...s, contactPerson: e.target.value }))} className="w-full mb-2 px-3 py-2 bg-[#0f1014] border border-gray-800 rounded" />
            <input placeholder="Phone" value={editing.phone ?? ''} onChange={(e) => setEditing((s: any) => ({ ...s, phone: e.target.value }))} className="w-full mb-3 px-3 py-2 bg-[#0f1014] border border-gray-800 rounded" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="px-3 py-2 border border-gray-700 text-gray-400 rounded">Cancel</button>
              <button onClick={async () => {
                try {
                  await api.put(`/restaurant/inventory/suppliers/${editing.id}`, { name: editing.name, contactPerson: editing.contactPerson, phone: editing.phone });
                  qc.invalidateQueries({ queryKey: ['inventory-suppliers'] });
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
