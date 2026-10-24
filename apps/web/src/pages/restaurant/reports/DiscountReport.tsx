import { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { Percent, RefreshCcw } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { DatePreset, getDateRangeForPreset, toApiDateTimeRange } from '@/lib/dateRanges';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function DiscountReport() {
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
    queryKey: ['reports', 'discounts', startDate, endDate],
    queryFn: () => api.get('/restaurant/reports/discounts', { params: { dateFrom, dateTo } }).then(r => r.data.data),
  });

  const orders: any[] = data?.orders || [];
  const summary = data?.summary || { totalDiscount: 0, totalSales: 0, orderCount: 0, avgDiscount: 0 };
  const byStaff: any[] = data?.byStaff || [];

  const exportData = orders.map((o: any) => ({
    'Order #': o.id,
    Date: new Date(o.createdAt).toLocaleDateString(),
    Table: o.table?.name || '-',
    Staff: o.staff?.name || '-',
    'Order Total': o.total,
    Discount: o.discount,
    'Discount %': o.total > 0 ? ((o.discount / o.total) * 100).toFixed(1) + '%' : '0%',
  }));

  if (isLoading) return <div className="flex items-center justify-center h-64"><RefreshCcw className="w-6 h-6 animate-spin text-rose-400" /></div>;

  return (
    <div className="space-y-4 animate-in p-1">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Discount Report</h1>
          <p className="text-xs text-text-muted mt-1">Discounts given across all orders • {startDate} to {endDate}</p>
        </div>
        <ExportDropdown data={exportData} filename="discount-report" title="Discount Report" subtitle={`${startDate} to ${endDate}`} />
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
        {[
          { label: 'Total Discount Given', value: formatCurrency(summary.totalDiscount), color: 'rose' },
          { label: 'Orders with Discount', value: summary.orderCount, color: 'orange' },
          { label: 'Avg Discount per Order', value: formatCurrency(summary.avgDiscount), color: 'amber' },
          { label: 'Discount % of Sales', value: summary.totalSales > 0 ? ((summary.totalDiscount / summary.totalSales) * 100).toFixed(1) + '%' : '0%', color: 'red' },
        ].map((s, i) => (
          <Card key={i} className={`p-4 bg-gradient-to-br from-${s.color}-500/10 to-${s.color}-500/5 border-${s.color}-500/20`}>
            <p className={`text-[11px] font-medium text-${s.color}-400 uppercase tracking-wider`}>{s.label}</p>
            <p className="text-xl font-bold text-text-primary mt-1">{s.value}</p>
          </Card>
        ))}
      </div>

      {byStaff.length > 0 && (
        <Card>
          <h3 className="font-semibold text-text-primary text-sm mb-4">Discounts by Staff</h3>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byStaff.map((s: any) => ({ name: s.name?.split(' ')[0], discount: s.totalDiscount, count: s.count }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip formatter={(v: any, n) => [n === 'discount' ? formatCurrency(v) : v, n === 'discount' ? 'Discount' : 'Orders']} contentStyle={{ backgroundColor: '#0d1526', borderColor: '#1e3a5f', borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="discount" fill="#f43f5e" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card padding={false}>
        <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30 flex items-center justify-between">
          <h3 className="font-semibold text-text-primary text-sm flex items-center gap-2"><Percent className="w-4 h-4 text-rose-400" />Discounted Orders</h3>
          <span className="text-[10px] text-text-muted">{orders.length} orders</span>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border">
                {['Order #','Date','Table','Staff','Order Total','Discount','Discount %'].map(h => (
                  <th key={h} className="py-2.5 px-3 text-left font-semibold text-text-secondary">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {orders.slice(0, 200).map((o: any) => (
                <tr key={o.id} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-2 px-3 font-mono text-text-primary">#{o.id}</td>
                  <td className="py-2 px-3 text-text-secondary">{new Date(o.createdAt).toLocaleDateString()}</td>
                  <td className="py-2 px-3 text-text-secondary">{o.table?.name || '-'}</td>
                  <td className="py-2 px-3 text-text-secondary">{o.staff?.name || '-'}</td>
                  <td className="py-2 px-3 font-semibold text-text-primary">{formatCurrency(o.total)}</td>
                  <td className="py-2 px-3 font-bold text-rose-400">{formatCurrency(o.discount)}</td>
                  <td className="py-2 px-3 text-rose-300">{o.total > 0 ? ((o.discount / o.total) * 100).toFixed(1) + '%' : '0%'}</td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-text-muted">No discounted orders found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
