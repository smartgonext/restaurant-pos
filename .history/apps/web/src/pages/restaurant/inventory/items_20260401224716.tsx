import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export default function Items() {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: () => api.get('/restaurant/inventory/items').then(r => r.data.data),
  });

  if (isLoading) return <div className="p-8 text-center text-text-muted">Loading items...</div>;

  return (
    <div className="space-y-4 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Inventory Items</h1>
          <p className="text-xs text-text-muted mt-1">Manage raw materials and stocked items</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm">Add Item</Button>
          <Button size="sm" onClick={() => window.open('/api/restaurant/inventory/export?format=csv', '_blank')}>Export CSV</Button>
          <Button size="sm" onClick={() => window.open('/api/restaurant/inventory/export?format=xlsx', '_blank')}>Export XLSX</Button>
          <Button size="sm" onClick={() => window.open('/api/restaurant/inventory/export?format=json', '_blank')}>Export JSON</Button>
        </div>
      </div>

      <Card padding={false}>
        <div className="overflow-x-auto text-[11px]">
          <table className="w-full">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border text-left">
                <th className="py-2.5 px-4 font-medium text-text-secondary">Item Name</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary">Category</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary">Unit</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary">In Stock</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {items.map((it: any) => (
                <tr key={it.id} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-3 px-4 font-medium text-text-primary">{it.name}</td>
                  <td className="py-3 px-4 text-text-muted">{it.category?.name}</td>
                  <td className="py-3 px-4 text-text-muted">{it.unit?.name} ({it.unit?.symbol})</td>
                  <td className="py-3 px-4 font-mono text-text-primary font-medium">{it.currentStock}</td>
                  <td className="py-3 px-4 text-right"><button className="text-blue-400 text-[10px] font-bold">Edit</button></td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-text-muted italic">No items found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
