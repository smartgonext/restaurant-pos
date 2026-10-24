import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Layers, Plus, Search, Edit2, Trash2, Loader2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function Areas() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingArea, setEditingArea] = useState<any>(null);
  const [form, setForm] = useState({ name: '' });
  const [search, setSearch] = useState('');

  const { data: areasRes = [], isLoading } = useQuery({
    queryKey: ['areas'],
    queryFn: () => api.get('/restaurant/areas').then(r => r.data.data || [])
  });

  const areas = areasRes || [];

  // Live real-time listener for instant updates without reloading page
  useEffect(() => {
    const handleLiveRefresh = () => {
      queryClient.invalidateQueries({ queryKey: ['areas'] });
      queryClient.invalidateQueries({ queryKey: ['tables'] });
    };
    window.addEventListener('areas_updated', handleLiveRefresh);
    window.addEventListener('tables_updated', handleLiveRefresh);
    return () => {
      window.removeEventListener('areas_updated', handleLiveRefresh);
      window.removeEventListener('tables_updated', handleLiveRefresh);
    };
  }, [queryClient]);

  const filteredAreas = areas.filter((area: any) => 
    !search || area.name.toLowerCase().includes(search.toLowerCase())
  );

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['areas'] });
    queryClient.invalidateQueries({ queryKey: ['tables'] });
    queryClient.invalidateQueries({ queryKey: ['waiter-tables'] });
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this area? This will also affect tables in this area.')) return;
    try {
      await api.delete(`/restaurant/areas/${id}`);
      toast.success('Area deleted successfully!');
      invalidateAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to delete area');
    }
  };

  if (isLoading) return (
    <div className="p-12 flex flex-col items-center justify-center text-text-muted text-xs">
      <Loader2 className="w-6 h-6 animate-spin text-blue-400 mb-2" />
      <span>Loading dining areas...</span>
    </div>
  );

  return (
    <div className="space-y-4 animate-in">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Dining Areas</h1>
          <p className="text-xs text-text-muted mt-1">Manage restaurant sections and table groupings</p>
        </div>
        <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => { setForm({ name: '' }); setShowAdd(true); }}>Add Area</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Total Areas</span>
          <span className="text-xl font-bold text-text-primary">{areas.length}</span>
        </Card>
        <Card className="flex flex-col gap-1 bg-blue-500/5 border-blue-500/20">
          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Total Tables Configured</span>
          <span className="text-xl font-bold text-text-primary">
            {areas.reduce((acc: number, curr: any) => acc + (curr._count?.tables || 0), 0)}
          </span>
        </Card>
      </div>

      <Card padding={false} className="border-border/50">
        <div className="p-3 border-b border-border/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <input className="glass-input w-full pl-9 h-9 text-xs" placeholder="Search areas..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        
        <div className="overflow-x-auto text-[11px]">
          <table className="w-full">
            <thead>
              <tr className="bg-bg-tertiary/30 border-b border-border text-left">
                <th className="py-2.5 px-4 font-medium text-text-secondary w-64">Area Name</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary">Tables</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredAreas.map((area: any) => (
                <tr key={area.id} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-3 px-4 font-bold text-text-primary flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-blue-400" />
                    {area.name}
                  </td>
                  <td className="py-3 px-4 font-medium text-text-primary">{area._count?.tables || 0} Tables</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button className="text-blue-400 hover:text-blue-300 p-1.5" onClick={() => { setEditingArea(area); setForm({ name: area.name }); setShowEdit(true); }}><Edit2 className="w-3.5 h-3.5" /></button>
                      <button className="text-danger hover:text-danger/70 p-1.5" onClick={() => handleDelete(area.id)}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredAreas.length === 0 && (
                <tr>
                   <td colSpan={3} className="p-8 text-center text-text-muted italic">No areas found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Area">
        <div className="space-y-4">
          <Input label="Area Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Main Hall" />
          <div className="flex justify-end gap-3 mt-4">
            <Button size="sm" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" onClick={async () => {
              try {
                if (!form.name.trim()) return toast.error('Please provide a name');
                await api.post('/restaurant/areas', { name: form.name });
                toast.success('Area created!');
                setShowAdd(false);
                setForm({ name: '' });
                invalidateAll();
              } catch (err: any) {
                toast.error(err?.response?.data?.error || 'Failed to create area');
              }
            }}>Add Area</Button>
          </div>
        </div>
      </Modal>

      <Modal open={showEdit} onClose={() => { setShowEdit(false); setEditingArea(null); }} title="Edit Area">
        <div className="space-y-4">
          <Input label="Area Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Main Hall" />
          <div className="flex justify-end gap-3 mt-4">
            <Button size="sm" variant="secondary" onClick={() => { setShowEdit(false); setEditingArea(null); }}>Cancel</Button>
            <Button size="sm" onClick={async () => {
              try {
                if (!form.name.trim()) return toast.error('Please provide a name');
                await api.put(`/restaurant/areas/${editingArea.id}`, { name: form.name });
                toast.success('Area updated!');
                setShowEdit(false);
                setEditingArea(null);
                invalidateAll();
              } catch (err: any) {
                toast.error(err?.response?.data?.error || 'Failed to update area');
              }
            }}>Save Changes</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
