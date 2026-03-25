import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Plus, Grid3X3, Users, QrCode } from 'lucide-react';
import { cn, getStatusColor } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function Tables() {
  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState({ name: '', capacity: '4', areaId: 0 });

  const { data: areas, isLoading } = useQuery({
    queryKey: ['areas'],
    queryFn: () => api.get('/restaurant/areas').then((r) => r.data.data),
  });

  const { data: tables, refetch } = useQuery({
    queryKey: ['tables'],
    queryFn: () => api.get('/restaurant/tables').then((r) => r.data.data),
  });

  const handleCreate = async () => {
    try {
      await api.post('/restaurant/tables', {
        name: formData.name, capacity: Number(formData.capacity), areaId: formData.areaId,
      });
      toast.success('Table created!');
      setShowAdd(false);
      refetch();
    } catch (err: any) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const statusColors: Record<string, string> = {
    available: 'border-success/30 bg-success/5',
    running: 'border-blue-500/30 bg-blue-500/5 ring-1 ring-blue-500/10',
    reserved: 'border-warning/30 bg-warning/5',
    inactive: 'border-text-muted/20 bg-bg-tertiary/50 opacity-60',
  };

  return (
    <div className="space-y-4 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Tables</h1>
          <p className="text-xs text-text-muted mt-1">{tables?.length || 0} configured tables</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" icon={<QrCode className="w-4 h-4" />}>QR</Button>
          <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setShowAdd(true)}>Add</Button>
        </div>
      </div>

      <div className="flex gap-4 border-b border-border/50 pb-3">
        {[
          { status: 'available', label: 'Ready', color: 'bg-success' },
          { status: 'running', label: 'Occupied', color: 'bg-blue-500' },
          { status: 'reserved', label: 'Booked', color: 'bg-warning' },
        ].map(({ status, label, color }) => (
          <div key={status} className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-text-muted">
            <span className={cn('w-2 h-2 rounded-full', color)} />{label}
          </div>
        ))}
      </div>

      <div className="space-y-6">
        {isLoading ? (
          <div className="grid grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-bg-secondary animate-pulse" />)}</div>
        ) : (
          areas?.map((area: any) => (
            <div key={area.id}>
              <h2 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                <Grid3X3 className="w-3.5 h-3.5 text-blue-400" /> {area.name}
                <Badge variant="outline" size="sm" className="text-[10px] px-1.5 h-4">{area.tables?.length || 0}</Badge>
              </h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {area.tables?.map((table: any) => (
                  <div key={table.id}
                    className={cn('relative rounded-lg border p-3 text-center transition-all hover:scale-105',
                      statusColors[table.status] || statusColors.available)}>
                    <p className="text-sm font-bold text-text-primary">{table.name}</p>
                    <div className="flex items-center justify-center gap-1 mt-1">
                      <Users className="w-2.5 h-2.5 text-text-muted" />
                      <span className="text-[10px] text-text-secondary font-medium">{table.capacity}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Table">
        <div className="space-y-4">
          <Input label="Table Name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. T1" />
          <Input label="Capacity" type="number" value={formData.capacity} onChange={(e) => setFormData({ ...formData, capacity: e.target.value })} placeholder="4" />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-secondary">Area</label>
            <select className="glass-input" value={formData.areaId} onChange={(e) => setFormData({ ...formData, areaId: Number(e.target.value) })}>
              <option value={0}>Select area</option>
              {areas?.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button size="sm" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreate}>Add Table</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
