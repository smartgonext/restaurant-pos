import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Layers, Plus, Search, Edit2, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export default function Areas() {
  const { data: areasRes, isLoading } = useQuery({
    queryKey: ['areas'],
    queryFn: () => api.get('/restaurant/areas').then(r => r.data.data)
  });

  const areas = areasRes || [];

  if (isLoading) return <div className="p-8 text-center text-text-muted text-xs">Loading areas...</div>;

  return (
    <div className="space-y-4 animate-in">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Dining Areas</h1>
          <p className="text-xs text-text-muted mt-1">Manage restaurant sections and table groupings</p>
        </div>
        <Button size="sm" icon={<Plus className="w-4 h-4" />}>Add Area</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Total Areas</span>
          <span className="text-xl font-bold text-text-primary">{areas.length}</span>
        </Card>
        <Card className="flex flex-col gap-1 bg-blue-500/5 border-blue-500/20">
          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Total Tables</span>
          <span className="text-xl font-bold text-text-primary">
            {areas.reduce((acc: number, curr: any) => acc + (curr._count?.tables || 0), 0)}
          </span>
        </Card>
        <Card className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-success uppercase tracking-wider">Capacity</span>
          <span className="text-xl font-bold text-success">
            -
          </span>
        </Card>
      </div>

      <Card padding={false} className="border-border/50">
        <div className="p-3 border-b border-border/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <input className="glass-input w-full pl-9 h-9 text-xs" placeholder="Search areas..." />
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
              {areas.map((area: any) => (
                <tr key={area.id} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-3 px-4 font-bold text-text-primary flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-blue-400" />
                    {area.name}
                  </td>
                  <td className="py-3 px-4 font-medium text-text-primary">{area._count?.tables || 0} Tables</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button className="text-blue-400 hover:text-blue-300 p-1.5"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button className="text-danger hover:text-danger/70 p-1.5"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {areas.length === 0 && (
                <tr>
                   <td colSpan={3} className="p-8 text-center text-text-muted italic">No areas found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
