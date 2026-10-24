import { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { Badge } from '@/components/ui/Badge';
import { ShoppingCart, RefreshCcw } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { DatePreset, getDateRangeForPreset, toApiDateTimeRange } from '@/lib/dateRanges';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function PurchaseReport() {
  const [dateRange, setDateRange] = useState<DatePreset>('Current Month');
  const [startDate, setStartDate] = useState(getDateRangeForPreset('Current Month').startDate);
  const [endDate, setEndDate] = useState(getDateRangeForPreset('Current Month').endDate);

  useEffect(() => {
    if (dateRange === 'Custom') return;
    const next = getDateRangeForPreset(dateRange);
    setStartDate(next.startDate); setEndDate(next.endDate);
  }, [dateRange]);

  const { dateFrom, dateTo } = useMemo(() => toApiDateTimeRange(startDate, endDate), [startDate, endDate]);

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'purchases', startDate, endDate],
    queryFn: () => api.get('/restaurant/reports/purchases', { params: { dateFrom, dateTo } }).then(r => r.data.data),
  });

  const purchases: any[] = data?.purchases || [];
  const summary = data?.summary || { total: 0, count: 0 };
  const bySupplier: any[] = data?.bySupplier || [];
  const byStatus: Record<string, number> = data?.byStatus || {};

  const exportData = purchases.map((p: any) => ({
    'PO Number': p.orderNumber,
    Date: new Date(p.createdAt).toLocaleDateString(),
    Supplier: p.supplier?.name || '-',
    Status: p.status,
    'Total Amount': p.total,
    'Items Count': p.items?.length || 0,
  }));

  if (isLoading) return <div className="flex items-center justify-center h-64"><RefreshCcw className="w-6 h-6 animate-spin text-indigo-400" /></div>;

  return (
    <div className="space-y-4 animate-in p-1">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Purchase Report</h1>
          <p className="text-xs text-text-muted mt-1">Purchase orders from suppliers • {startDate} to {endDate}</p>
        </div>
        <ExportDropdown data={exportData} filename="purchase-report" title="Purchase Report" subtitle={`${startDate} to ${endDate}`} />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Date Range</label>
            <select value={dateRange} onChange={e => setDateRange(e.target.value as DatePreset)} className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none">
              {['Today','Last 7 Days','Current Month','Custom'].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Start</label>
            <input type="date" value={startDate} onChange={e => { setDateRange('Custom'); setStartDate(e.target.value); }} className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">End</label>
            <input type="date" value={endDate} onChange={e => { setDateRange('Custom'); setEndDate(e.target.value); }} className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none" />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4 bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 border-indigo-500/20">
          <p className="text-[11px] font-medium text-indigo-400 uppercase tracking-wider">Total Purchase Value</p>
          <p className="text-xl font-bold text-text-primary mt-1">{formatCurrency(summary.total)}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <p className="text-[11px] font-medium text-blue-400 uppercase tracking-wider">Total POs</p>
          <p className="text-xl font-bold text-text-primary mt-1">{summary.count}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
          <p className="text-[11px] font-medium text-purple-400 uppercase tracking-wider">Suppliers</p>
          <p className="text-xl font-bold text-text-primary mt-1">{bySupplier.length}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
          <p className="text-[11px] font-medium text-orange-400 uppercase tracking-wider">Pending Orders</p>
          <p className="text-xl font-bold text-text-primary mt-1">{byStatus['pending'] || 0}</p>
        </Card>
      </div>

      {bySupplier.length > 0 && (
        <Card>
          <h3 className="font-semibold text-text-primary text-sm mb-4">Purchases by Supplier</h3>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bySupplier.slice(0, 10).map(s => ({ name: s.name?.split(' ')[0] || s.name, amount: s.amount, count: s.count }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip formatter={(v: any, n) => [n === 'amount' ? formatCurrency(v) : v, n === 'amount' ? 'Amount' : 'POs']} contentStyle={{ backgroundColor: '#0d1526', borderColor: '#1e3a5f', borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="amount" fill="#6366f1" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card padding={false}>
        <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30 flex items-center justify-between">
          <h3 className="font-semibold text-text-primary text-sm flex items-center gap-2"><ShoppingCart className="w-4 h-4 text-indigo-400" />Purchase Orders</h3>
          <span className="text-[10px] text-text-muted">{purchases.length} POs</span>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border">
                {['PO Number','Date','Supplier','Status','Items','Total'].map(h => (
                  <th key={h} className="py-2.5 px-3 text-left font-semibold text-text-secondary">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {purchases.slice(0, 200).map((p: any) => (
                <tr key={p.id} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-2 px-3 font-mono font-bold text-text-primary">{p.orderNumber}</td>
                  <td className="py-2 px-3 text-text-secondary">{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td className="py-2 px-3 text-text-secondary">{p.supplier?.name || '-'}</td>
                  <td className="py-2 px-3"><Badge variant={p.status === 'received' ? 'success' : p.status === 'pending' ? 'warning' : 'default'}>{p.status}</Badge></td>
                  <td className="py-2 px-3 text-center text-text-secondary">{p.items?.length || 0}</td>
                  <td className="py-2 px-3 font-bold text-text-primary">{formatCurrency(p.total)}</td>
                </tr>
              ))}
              {purchases.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-text-muted">No purchase orders found for this period</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
