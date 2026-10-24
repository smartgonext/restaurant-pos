import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { Badge } from '@/components/ui/Badge';
import { Package, AlertTriangle, RefreshCcw } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { getDateRangeForPreset, toApiDateTimeRange } from '@/lib/dateRanges';

type StockTab = 'all' | 'low' | 'out' | 'movements';

export default function StockReport() {
  const [tab, setTab] = useState<StockTab>('all');
  const [search, setSearch] = useState('');
  const today = getDateRangeForPreset('Today');
  const { dateFrom, dateTo } = toApiDateTimeRange(today.startDate, today.endDate);

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'stock'],
    queryFn: () => api.get('/restaurant/reports/stock', { params: { dateFrom, dateTo } }).then(r => r.data.data),
  });

  const allItems: any[] = (data?.items || []).filter((i: any) => !search || i.name?.toLowerCase().includes(search.toLowerCase()));
  const lowStock: any[] = data?.lowStock || [];
  const outOfStock: any[] = data?.outOfStock || [];
  const movements: any[] = data?.movements || [];
  const summary = data?.summary || { totalItems: 0, lowStockCount: 0, outOfStockCount: 0, totalValue: 0 };

  const exportItems = allItems.map((i: any) => ({
    Name: i.name, Category: i.category?.name || '-', Unit: i.unit?.symbol || '-',
    'Current Stock': i.currentStock, 'Threshold': i.thresholdQty, 'Cost/Unit': i.costPerUnit,
    'Total Value': (Number(i.currentStock || 0) * Number(i.costPerUnit || 0)).toFixed(2),
    Status: Number(i.currentStock) === 0 ? 'Out of Stock' : Number(i.currentStock) <= Number(i.thresholdQty) ? 'Low Stock' : 'OK',
  }));

  const MOV_TYPE_COLOR: Record<string, string> = { purchase: 'success', sale: 'danger', adjustment: 'warning', damage: 'danger', return: 'success', stock_in: 'success', stock_out: 'danger', transfer: 'info' };

  if (isLoading) return <div className="flex items-center justify-center h-64"><RefreshCcw className="w-6 h-6 animate-spin text-violet-400" /></div>;

  const displayItems = tab === 'low' ? lowStock : tab === 'out' ? outOfStock : allItems;

  return (
    <div className="space-y-4 animate-in p-1">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Inventory / Stock Report</h1>
          <p className="text-xs text-text-muted mt-1">Current stock levels, movements & valuation</p>
        </div>
        <ExportDropdown data={exportItems} filename="stock-report" title="Stock Report" subtitle="Current Inventory" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Items', value: summary.totalItems, color: 'violet', icon: Package },
          { label: 'Low Stock', value: summary.lowStockCount, color: 'orange', icon: AlertTriangle },
          { label: 'Out of Stock', value: summary.outOfStockCount, color: 'red', icon: AlertTriangle },
          { label: 'Total Stock Value', value: formatCurrency(summary.totalValue), color: 'green', icon: Package },
        ].map((s, i) => (
          <Card key={i} className={`p-4 bg-gradient-to-br from-${s.color}-500/10 to-${s.color}-500/5 border-${s.color}-500/20`}>
            <p className={`text-[11px] font-medium text-${s.color}-400 uppercase tracking-wider`}>{s.label}</p>
            <p className="text-xl font-bold text-text-primary mt-1">{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Card className="p-2 flex gap-2 flex-wrap">
        {(['all', 'low', 'out', 'movements'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${tab === t ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/20' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/50'}`}>
            {t === 'all' && `All Items (${allItems.length})`}
            {t === 'low' && `⚠️ Low Stock (${lowStock.length})`}
            {t === 'out' && `🔴 Out of Stock (${outOfStock.length})`}
            {t === 'movements' && `Movements (${movements.length})`}
          </button>
        ))}
        {tab !== 'movements' && (
          <input placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)}
            className="ml-auto bg-bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs outline-none w-44" />
        )}
      </Card>

      {tab !== 'movements' && (
        <Card padding={false}>
          <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30 flex items-center justify-between">
            <h3 className="font-semibold text-text-primary text-sm flex items-center gap-2"><Package className="w-4 h-4 text-violet-400" />
              {tab === 'all' ? 'All Inventory Items' : tab === 'low' ? 'Low Stock Items' : 'Out of Stock Items'}
            </h3>
            <span className="text-[10px] text-text-muted">{displayItems.length} items</span>
          </div>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="bg-bg-tertiary/50 border-b border-border">
                  {['Item Name','Category','Unit','Current Stock','Min Threshold','Cost/Unit','Stock Value','Status'].map(h => (
                    <th key={h} className="py-2.5 px-3 text-left font-semibold text-text-secondary">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {displayItems.slice(0, 300).map((item: any) => {
                  const stock = Number(item.currentStock || 0);
                  const threshold = Number(item.thresholdQty || 0);
                  const value = stock * Number(item.costPerUnit || 0);
                  const isOut = stock === 0;
                  const isLow = !isOut && stock <= threshold;
                  return (
                    <tr key={item.id} className={`hover:bg-bg-hover/30 transition-colors ${isOut ? 'bg-red-500/5' : isLow ? 'bg-orange-500/5' : ''}`}>
                      <td className="py-2 px-3 font-semibold text-text-primary">{item.name}</td>
                      <td className="py-2 px-3 text-text-secondary">{item.category?.name || '-'}</td>
                      <td className="py-2 px-3 text-text-secondary">{item.unit?.symbol || '-'}</td>
                      <td className={`py-2 px-3 font-bold font-mono ${isOut ? 'text-red-400' : isLow ? 'text-orange-400' : 'text-green-400'}`}>{stock}</td>
                      <td className="py-2 px-3 text-text-muted font-mono">{threshold}</td>
                      <td className="py-2 px-3 text-text-secondary">{formatCurrency(item.costPerUnit)}</td>
                      <td className="py-2 px-3 font-bold text-text-primary">{formatCurrency(value)}</td>
                      <td className="py-2 px-3">
                        {isOut ? <Badge variant="danger">Out of Stock</Badge> : isLow ? <Badge variant="warning">Low Stock</Badge> : <Badge variant="success">OK</Badge>}
                      </td>
                    </tr>
                  );
                })}
                {displayItems.length === 0 && (
                  <tr><td colSpan={8} className="py-10 text-center text-text-muted">No items found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'movements' && (
        <Card padding={false}>
          <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30">
            <h3 className="font-semibold text-text-primary text-sm">Inventory Movements (Today)</h3>
          </div>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="bg-bg-tertiary/50 border-b border-border">
                  {['Date','Item','Type','Quantity','Note'].map(h => (
                    <th key={h} className="py-2.5 px-3 text-left font-semibold text-text-secondary">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {movements.slice(0, 300).map((m: any) => (
                  <tr key={m.id} className="hover:bg-bg-hover/30 transition-colors">
                    <td className="py-2 px-3 text-text-muted">{new Date(m.createdAt).toLocaleString()}</td>
                    <td className="py-2 px-3 font-semibold text-text-primary">{m.item?.name || '-'}</td>
                    <td className="py-2 px-3"><Badge variant={MOV_TYPE_COLOR[m.type] as any || 'default'}>{m.type}</Badge></td>
                    <td className="py-2 px-3 font-mono font-bold text-text-primary">{m.quantity}</td>
                    <td className="py-2 px-3 text-text-muted">{m.note || '-'}</td>
                  </tr>
                ))}
                {movements.length === 0 && (
                  <tr><td colSpan={5} className="py-10 text-center text-text-muted">No movements recorded today</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
