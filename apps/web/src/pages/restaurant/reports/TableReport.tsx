import { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { LayoutGrid, RefreshCcw } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { DatePreset, getDateRangeForPreset, toApiDateTimeRange } from '@/lib/dateRanges';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';

const COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#84cc16'];

export default function TableReport() {
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
    queryKey: ['reports', 'tables', startDate, endDate],
    queryFn: () => api.get('/restaurant/reports/tables', { params: { dateFrom, dateTo } }).then(r => r.data.data),
  });

  const tables: any[] = data?.tables || [];
  const summary = data?.summary || { totalTables: 0, activeTables: 0, totalRevenue: 0 };

  const top10 = tables.slice(0, 10);

  const exportData = tables.map((t: any) => ({
    'Table Name': t.name, Area: t.area?.name || '-', Capacity: t.capacity || '-',
    'Orders': t.orderCount, 'Revenue': t.revenue, 'Avg Order Value': t.avgOrderValue?.toFixed(2),
  }));

  if (isLoading) return <div className="flex items-center justify-center h-64"><RefreshCcw className="w-6 h-6 animate-spin text-teal-400" /></div>;

  return (
    <div className="space-y-4 animate-in p-1">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Table Report</h1>
          <p className="text-xs text-text-muted mt-1">Revenue & orders per table • {startDate} to {endDate}</p>
        </div>
        <ExportDropdown data={exportData} filename="table-report" title="Table Report" subtitle={`${startDate} to ${endDate}`} />
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

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Card className="p-4 bg-gradient-to-br from-teal-500/10 to-teal-500/5 border-teal-500/20">
          <p className="text-[11px] font-medium text-teal-400 uppercase tracking-wider">Total Tables</p>
          <p className="text-2xl font-bold text-text-primary mt-1">{summary.totalTables}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <p className="text-[11px] font-medium text-blue-400 uppercase tracking-wider">Active Tables</p>
          <p className="text-2xl font-bold text-text-primary mt-1">{summary.activeTables}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <p className="text-[11px] font-medium text-green-400 uppercase tracking-wider">Total Revenue</p>
          <p className="text-2xl font-bold text-text-primary mt-1">{formatCurrency(summary.totalRevenue)}</p>
        </Card>
      </div>

      {top10.length > 0 && (
        <Card>
          <h3 className="font-semibold text-text-primary text-sm mb-4">Top 10 Tables by Revenue</h3>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top10.map((t: any) => ({ name: t.name, revenue: t.revenue, orders: t.orderCount }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip formatter={(v: any, n) => [n === 'revenue' ? formatCurrency(v) : v, n === 'revenue' ? 'Revenue' : 'Orders']} contentStyle={{ backgroundColor: '#0d1526', borderColor: '#1e3a5f', borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="revenue" radius={[4,4,0,0]}>
                  {top10.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card padding={false}>
        <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30 flex items-center justify-between">
          <h3 className="font-semibold text-text-primary text-sm flex items-center gap-2"><LayoutGrid className="w-4 h-4 text-teal-400" />Table Performance</h3>
          <span className="text-[10px] text-text-muted">{tables.length} tables</span>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border">
                {['Rank','Table','Area','Capacity','Orders','Revenue','Avg Order Value'].map(h => (
                  <th key={h} className="py-2.5 px-3 text-left font-semibold text-text-secondary">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {tables.map((t: any, idx: number) => (
                <tr key={t.id} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-2 px-3 text-text-muted font-mono">{idx + 1}</td>
                  <td className="py-2 px-3 font-semibold text-text-primary">{t.name}</td>
                  <td className="py-2 px-3 text-text-secondary">{t.area?.name || '-'}</td>
                  <td className="py-2 px-3 text-center text-text-muted">{t.capacity || '-'}</td>
                  <td className="py-2 px-3 text-center font-mono text-blue-400">{t.orderCount}</td>
                  <td className="py-2 px-3 font-bold text-green-400">{formatCurrency(t.revenue)}</td>
                  <td className="py-2 px-3 text-text-secondary">{formatCurrency(t.avgOrderValue)}</td>
                </tr>
              ))}
              {tables.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-text-muted">No table data found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
