import { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { Badge } from '@/components/ui/Badge';
import { ShoppingBag, RefreshCcw } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { DatePreset, getDateRangeForPreset, toApiDateTimeRange } from '@/lib/dateRanges';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';

const STATUS_COLORS: Record<string, string> = {
  paid: 'success', pending: 'warning', cancelled: 'danger', open: 'info',
};
const TYPE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];

export default function OrderReport() {
  const [dateRange, setDateRange] = useState<DatePreset>('Today');
  const [startDate, setStartDate] = useState(getDateRangeForPreset('Today').startDate);
  const [endDate, setEndDate] = useState(getDateRangeForPreset('Today').endDate);

  useEffect(() => {
    if (dateRange === 'Custom') return;
    const next = getDateRangeForPreset(dateRange);
    setStartDate(next.startDate);
    setEndDate(next.endDate);
  }, [dateRange]);

  const { dateFrom, dateTo } = useMemo(() => toApiDateTimeRange(startDate, endDate), [startDate, endDate]);

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'orders', startDate, endDate],
    queryFn: () => api.get('/restaurant/reports/orders', { params: { dateFrom, dateTo } }).then(r => r.data.data),
  });

  const orders = data?.orders || [];
  const summary = data?.summary || { total: 0, count: 0, paid: 0, pending: 0, cancelled: 0 };
  const byType = data?.byType || {};

  const typeChart = Object.entries(byType).map(([name, v]: any) => ({ name: name.replace('_', ' ').toUpperCase(), count: v.count, revenue: v.revenue }));

  const exportData = orders.map((o: any) => ({
    'Order ID': o.id,
    Date: new Date(o.createdAt).toLocaleDateString(),
    Type: o.type,
    Status: o.status,
    Table: o.table?.name || '-',
    Staff: o.staff?.name || '-',
    Total: o.total,
  }));

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCcw className="w-6 h-6 animate-spin text-blue-400" />
    </div>
  );

  return (
    <div className="space-y-4 animate-in p-1">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Order Report</h1>
          <p className="text-xs text-text-muted mt-1">{startDate} to {endDate}</p>
        </div>
        <ExportDropdown data={exportData} filename="order-report" title="Order Report" subtitle={`${startDate} to ${endDate}`} />
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Date Range</label>
            <select value={dateRange} onChange={e => setDateRange(e.target.value as DatePreset)} className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none">
              {['Today','Yesterday','Last 7 Days','Current Week','Current Month','Custom'].map(o => <option key={o}>{o}</option>)}
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

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Revenue', value: formatCurrency(summary.total), color: 'blue' },
          { label: 'Total Orders', value: summary.count, color: 'purple' },
          { label: 'Paid Orders', value: summary.paid, color: 'green' },
          { label: 'Pending', value: summary.pending, color: 'orange' },
          { label: 'Cancelled', value: summary.cancelled, color: 'red' },
        ].map((s, i) => (
          <Card key={i} className={`p-4 bg-gradient-to-br from-${s.color}-500/10 to-${s.color}-500/5 border-${s.color}-500/20`}>
            <p className={`text-[11px] font-medium text-${s.color}-400 uppercase tracking-wider`}>{s.label}</p>
            <p className="text-xl font-bold text-text-primary mt-1">{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Type Chart */}
      {typeChart.length > 0 && (
        <Card>
          <h3 className="font-semibold text-text-primary text-sm mb-4">Orders by Type</h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={typeChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: '#0d1526', borderColor: '#1e3a5f', borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="count" radius={[4,4,0,0]}>
                  {typeChart.map((_: any, i: number) => <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Orders Table */}
      <Card padding={false}>
        <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30 flex items-center justify-between">
          <h3 className="font-semibold text-text-primary text-sm flex items-center gap-2"><ShoppingBag className="w-4 h-4 text-blue-400" />Order Details</h3>
          <span className="text-[10px] text-text-muted">{orders.length} records</span>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border">
                {['#','Date','Type','Table','Staff','Status','Total'].map(h => (
                  <th key={h} className="py-2.5 px-3 text-left font-semibold text-text-secondary">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {orders.slice(0, 200).map((o: any) => (
                <tr key={o.id} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-2 px-3 font-mono text-text-muted">#{o.id}</td>
                  <td className="py-2 px-3 text-text-secondary">{new Date(o.createdAt).toLocaleDateString()}</td>
                  <td className="py-2 px-3 text-text-secondary capitalize">{(o.type||'dine_in').replace('_',' ')}</td>
                  <td className="py-2 px-3 text-text-secondary">{o.table?.name || '-'}</td>
                  <td className="py-2 px-3 text-text-secondary">{o.staff?.name || '-'}</td>
                  <td className="py-2 px-3"><Badge variant={STATUS_COLORS[o.status] as any || 'default'}>{o.status}</Badge></td>
                  <td className="py-2 px-3 font-semibold text-text-primary">{formatCurrency(o.total)}</td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-text-muted">No orders found for the selected range</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
