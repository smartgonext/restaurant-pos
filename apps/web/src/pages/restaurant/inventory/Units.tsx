import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useState } from 'react';

export default function Units() {
  const { data: units = [], isLoading } = useQuery({
    queryKey: ['inventory-units'],
    queryFn: () => api.get('/restaurant/inventory/units').then(r => r.data.data),
  });
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');

  const createUnit = useMutation({
    mutationFn: async () => api.post('/restaurant/inventory/units', { name, symbol }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory-units'] }); setShowAdd(false); setName(''); setSymbol(''); }
  });

  if (isLoading) return <div className="p-8 text-center text-text-muted">Loading units...</div>;

  return (
    <div className="space-y-4 animate-in">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h1 className="text-2xl font-black text-text-primary">Units</h1>
          <p className="text-xs text-text-muted mt-1">Measurement units used for inventory items</p>
          <div className="mt-4">
            <input className="glass-input w-full max-w-lg pl-4 h-11 text-sm" placeholder="Search Unit by Name or Symbol" />
          </div>
        </div>
        <div>
          <Button size="sm" onClick={() => setShowAdd(true)}>Add Unit</Button>
        </div>
      </div>

      <Card padding={false}>
        <div className="overflow-x-auto text-[11px]">
          <table className="w-full">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border text-left">
                <th className="py-2.5 px-4 font-medium text-text-secondary">Unit Name</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary">Symbol</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {units.map((u: any) => (
                <tr key={u.id} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-3 px-4 font-medium text-text-primary">{u.name}</td>
                  <td className="py-3 px-4 text-text-muted">{u.symbol}</td>
                  <td className="py-3 px-4 text-right"><button className="text-blue-400 text-[10px] font-bold">Edit</button></td>
                </tr>
              ))}
              {units.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-text-muted italic">No units found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1c23] rounded p-4 w-full max-w-sm">
            <h3 className="text-white font-bold mb-2">Add Unit</h3>
            <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="w-full mb-2 px-3 py-2 bg-[#0f1014] border border-gray-800 rounded" />
            <input placeholder="Symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} className="w-full mb-3 px-3 py-2 bg-[#0f1014] border border-gray-800 rounded" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="px-3 py-2 border border-gray-700 text-gray-400 rounded">Cancel</button>
              <button onClick={() => createUnit.mutate()} className="px-3 py-2 bg-purple-600 text-white rounded">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
