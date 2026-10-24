import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export default function Stocks() {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['inventory-items-stocks'],
    queryFn: () => api.get('/restaurant/inventory/items').then(r => r.data.data),
  });

  if (isLoading) return <div className="p-8 text-center text-text-muted">Loading stocks...</div>;

  return (
    <div className="space-y-4 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Inventory Stocks</h1>
          <p className="text-xs text-text-muted mt-1">Current stock levels and low-stock alerts</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => window.open('/api/restaurant/inventory/export?format=csv', '_blank')}>Export CSV</Button>
          <Button size="sm" onClick={() => window.open('/api/restaurant/inventory/export?format=xlsx', '_blank')}>Export XLSX</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Card>
          <div className="overflow-x-auto text-[11px]">
            <table className="w-full">
              <thead>
                <tr className="bg-bg-tertiary/50 border-b border-border text-left">
                  <th className="py-2.5 px-4 font-medium text-text-secondary">Item</th>
                  <th className="py-2.5 px-4 font-medium text-text-secondary">In Stock</th>
                  <th className="py-2.5 px-4 font-medium text-text-secondary">Threshold</th>
                  <th className="py-2.5 px-4 font-medium text-text-secondary">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {items.map((it: any) => (
                  <tr key={it.id} className="hover:bg-bg-hover/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-text-primary">{it.name}</td>
                    <td className="py-3 px-4 font-mono text-text-primary">{it.currentStock} {it.unit?.symbol}</td>
                    <td className="py-3 px-4 text-text-muted">{it.thresholdQty} {it.unit?.symbol}</td>
                    <td className="py-3 px-4">
                      <Badge size="sm" variant={Number(it.currentStock) <= Number(it.thresholdQty) ? 'danger' : 'success'}>
                        {Number(it.currentStock) <= Number(it.thresholdQty) ? 'Low' : 'Good'}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-text-muted italic">No stock data available.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
