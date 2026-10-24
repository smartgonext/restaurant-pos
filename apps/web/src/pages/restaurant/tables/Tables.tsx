import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Plus, Grid3X3, Users, QrCode, Trash2, Edit2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function Tables() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingTable, setEditingTable] = useState<any>(null);
  
  const [formData, setFormData] = useState({ name: '', capacity: '4', areaId: 0 });

  const { data: areas = [], isLoading: isLoadingAreas } = useQuery({
    queryKey: ['areas'],
    queryFn: () => api.get('/restaurant/areas').then((r) => r.data.data || []),
  });

  const { data: tables = [], isLoading: isLoadingTables } = useQuery({
    queryKey: ['tables'],
    queryFn: () => api.get('/restaurant/tables').then((r) => r.data.data || []),
  });

  // Real-time live synchronization listener
  useEffect(() => {
    const handleLiveSync = () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      queryClient.invalidateQueries({ queryKey: ['areas'] });
      queryClient.invalidateQueries({ queryKey: ['waiter-tables'] });
    };
    window.addEventListener('tables_updated', handleLiveSync);
    window.addEventListener('areas_updated', handleLiveSync);
    return () => {
      window.removeEventListener('tables_updated', handleLiveSync);
      window.removeEventListener('areas_updated', handleLiveSync);
    };
  }, [queryClient]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['tables'] });
    queryClient.invalidateQueries({ queryKey: ['areas'] });
    queryClient.invalidateQueries({ queryKey: ['waiter-tables'] });
  };

  const handleCreate = async () => {
    try {
      if (!formData.name.trim()) return toast.error('Table name is required');
      if (!formData.areaId || Number(formData.areaId) <= 0) return toast.error('Please select an area');
      
      await api.post('/restaurant/tables', {
        name: formData.name.trim(),
        capacity: Number(formData.capacity || 4),
        areaId: Number(formData.areaId),
      });
      toast.success('Table created successfully!');
      setShowAdd(false);
      setFormData({ name: '', capacity: '4', areaId: 0 });
      invalidateAll();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create table');
    }
  };

  const handleUpdate = async () => {
    if (!editingTable) return;
    try {
      if (!formData.name.trim()) return toast.error('Table name is required');
      if (!formData.areaId || Number(formData.areaId) <= 0) return toast.error('Please select an area');
      
      await api.put(`/restaurant/tables/${editingTable.id}`, {
        name: formData.name.trim(),
        capacity: Number(formData.capacity || 4),
        areaId: Number(formData.areaId),
      });
      toast.success('Table updated successfully!');
      setShowEdit(false);
      setEditingTable(null);
      invalidateAll();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update table');
    }
  };

  const handleDelete = async (tableId: number, tableName: string) => {
    if (!confirm(`Are you sure you want to delete Table ${tableName}?`)) return;
    try {
      await api.delete(`/restaurant/tables/${tableId}`);
      toast.success(`Table ${tableName} deleted!`);
      invalidateAll();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete table');
    }
  };

  const statusColors: Record<string, string> = {
    available: 'border-success/30 bg-success/5',
    occupied: 'border-rose-500/30 bg-rose-500/10 ring-1 ring-rose-500/20',
    running: 'border-blue-500/30 bg-blue-500/5 ring-1 ring-blue-500/10',
    reserved: 'border-warning/30 bg-warning/5',
    inactive: 'border-text-muted/20 bg-bg-tertiary/50 opacity-60',
  };

  const isLoading = isLoadingAreas || isLoadingTables;

  return (
    <div className="space-y-4 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Dining Tables</h1>
          <p className="text-xs text-text-muted mt-1">{tables?.length || 0} configured tables</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => { setFormData({ name: '', capacity: '4', areaId: areas[0]?.id || 0 }); setShowAdd(true); }}>Add Table</Button>
        </div>
      </div>

      <div className="flex gap-4 border-b border-border/50 pb-3">
        {[
          { status: 'available', label: 'Ready / Available', color: 'bg-success' },
          { status: 'occupied', label: 'Occupied', color: 'bg-rose-500' },
          { status: 'reserved', label: 'Booked / Reserved', color: 'bg-warning' },
        ].map(({ status, label, color }) => (
          <div key={status} className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-text-muted">
            <span className={cn('w-2 h-2 rounded-full', color)} />{label}
          </div>
        ))}
      </div>

      <div className="space-y-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-text-muted text-xs">
            <Loader2 className="w-6 h-6 animate-spin text-blue-400 mb-2" />
            <span>Loading dining tables...</span>
          </div>
        ) : areas?.length === 0 ? (
          <div className="text-center py-16 text-text-muted text-xs">
            No areas configured yet. Create a Dining Area first!
          </div>
        ) : (
          areas?.map((area: any) => (
            <div key={area.id} className="space-y-3">
              <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <Grid3X3 className="w-3.5 h-3.5 text-blue-400" /> {area.name}
                <Badge variant="outline" size="sm" className="text-[10px] px-1.5 h-4">{area.tables?.length || 0} Tables</Badge>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                {area.tables?.map((table: any) => (
                  <div
                    key={table.id}
                    className={cn(
                      'relative rounded-xl border p-3 text-center transition-all hover:scale-105 group flex flex-col justify-between h-24',
                      statusColors[table.status] || statusColors.available
                    )}
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-black text-text-primary">{table.name}</span>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <button
                          onClick={() => {
                            setEditingTable(table);
                            setFormData({ name: table.name, capacity: String(table.capacity || 4), areaId: table.areaId });
                            setShowEdit(true);
                          }}
                          className="text-blue-400 hover:text-blue-300 p-0.5"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDelete(table.id, table.name)}
                          className="text-rose-400 hover:text-rose-300 p-0.5"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-center gap-1 mt-auto text-[10px] text-text-secondary font-semibold">
                      <Users className="w-3 h-3 opacity-60" />
                      <span>{table.capacity} Seats</span>
                    </div>

                    <div className="text-[9px] font-black uppercase tracking-wider mt-1 opacity-75 text-text-muted">
                      {table.status}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Table Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add New Table">
        <div className="space-y-4">
          <Input label="Table Name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. T-101" />
          <Input label="Seating Capacity" type="number" value={formData.capacity} onChange={(e) => setFormData({ ...formData, capacity: e.target.value })} placeholder="4" />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-text-secondary">Area Section</label>
            <select className="glass-input text-xs py-2" value={formData.areaId} onChange={(e) => setFormData({ ...formData, areaId: Number(e.target.value) })}>
              <option value={0}>Select area...</option>
              {areas?.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button size="sm" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreate}>Add Table</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Table Modal */}
      <Modal open={showEdit} onClose={() => { setShowEdit(false); setEditingTable(null); }} title="Edit Table">
        <div className="space-y-4">
          <Input label="Table Name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. T-101" />
          <Input label="Seating Capacity" type="number" value={formData.capacity} onChange={(e) => setFormData({ ...formData, capacity: e.target.value })} placeholder="4" />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-text-secondary">Area Section</label>
            <select className="glass-input text-xs py-2" value={formData.areaId} onChange={(e) => setFormData({ ...formData, areaId: Number(e.target.value) })}>
              <option value={0}>Select area...</option>
              {areas?.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button size="sm" variant="secondary" onClick={() => { setShowEdit(false); setEditingTable(null); }}>Cancel</Button>
            <Button size="sm" onClick={handleUpdate}>Save Changes</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
