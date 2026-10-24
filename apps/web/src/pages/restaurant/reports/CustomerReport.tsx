import { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { Users, RefreshCcw, Star, ShoppingBag } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { DatePreset, getDateRangeForPreset, toApiDateTimeRange } from '@/lib/dateRanges';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function CustomerReport() {
  const [dateRange, setDateRange] = useState<DatePreset>('Current Month');
  const [startDate, setStartDate] = useState(getDateRangeForPreset('Current Month').startDate);
  const [endDate, setEndDate] = useState(getDateRangeForPreset('Current Month').endDate);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (dateRange === 'Custom') return;
    const next = getDateRangeForPreset(dateRange);
    setStartDate(next.startDate); setEndDate(next.endDate);
  }, [dateRange]);

  const { dateFrom, dateTo } = useMemo(() => toApiDateTimeRange(startDate, endDate), [startDate, endDate]);

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'customers', startDate, endDate],
    queryFn: () => api.get('/restaurant/reports/customers', { params: { dateFrom, dateTo } }).then(r => r.data.data),
  });

  const customers: any[] = (data?.customers || []).filter((c: any) =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search)
  );
  const summary = data?.summary || { total: 0, newCustomers: 0, activeCount: 0 };

  const top10 = [...customers].sort((a, b) => b.periodRevenue - a.periodRevenue).slice(0, 10);

  const exportData = customers.map((c: any) => ({
    Name: c.name, Phone: c.phone, Email: c.email || '-',
    'Total Orders': c.totalOrders, 'Period Orders': c.periodOrders,
    'Period Revenue': c.periodRevenue, 'Loyalty Points': c.loyaltyPoints || 0,
    'Joined On': new Date(c.createdAt).toLocaleDateString(),
  }));

  if (isLoading) return <div className="flex items-center justify-center h-64"><RefreshCcw className="w-6 h-6 animate-spin text-cyan-400" /></div>;

  return (
    <div className="space-y-4 animate-in p-1">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Customer Report</h1>
          <p className="text-xs text-text-muted mt-1">Customer visits, orders & loyalty • {startDate} to {endDate}</p>
        </div>
        <ExportDropdown data={exportData} filename="customer-report" title="Customer Report" subtitle={`${startDate} to ${endDate}`} />
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
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Search</label>
            <input placeholder="Name or Phone..." value={search} onChange={e => setSearch(e.target.value)} className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none w-48" />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Card className="p-4 bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 border-cyan-500/20">
          <p className="text-[11px] font-medium text-cyan-400 uppercase tracking-wider">Total Customers</p>
          <p className="text-2xl font-bold text-text-primary mt-1">{summary.total}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <p className="text-[11px] font-medium text-green-400 uppercase tracking-wider">New This Period</p>
          <p className="text-2xl font-bold text-text-primary mt-1">{summary.newCustomers}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
          <p className="text-[11px] font-medium text-purple-400 uppercase tracking-wider">Active Customers</p>
          <p className="text-2xl font-bold text-text-primary mt-1">{summary.activeCount}</p>
        </Card>
      </div>

      {top10.length > 0 && (
        <Card>
          <h3 className="font-semibold text-text-primary text-sm mb-4">Top 10 Customers by Revenue</h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top10.map((c: any) => ({ name: c.name?.split(' ')[0], revenue: c.periodRevenue }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip formatter={(v: any) => formatCurrency(v)} contentStyle={{ backgroundColor: '#0d1526', borderColor: '#1e3a5f', borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="revenue" fill="#06b6d4" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card padding={false}>
        <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30 flex items-center justify-between">
          <h3 className="font-semibold text-text-primary text-sm flex items-center gap-2"><Users className="w-4 h-4 text-cyan-400" />Customer List</h3>
          <span className="text-[10px] text-text-muted">{customers.length} customers</span>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border">
                {['Customer','Phone','All-Time Orders','Period Orders','Period Revenue','Loyalty Pts','Joined'].map(h => (
                  <th key={h} className="py-2.5 px-3 text-left font-semibold text-text-secondary">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {customers.slice(0, 200).map((c: any, idx: number) => (
                <tr key={c.id} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-2 px-3 font-semibold text-text-primary flex items-center gap-1.5">
                    {idx < 3 && <Star className="w-3 h-3 text-yellow-400" />}{c.name}
                  </td>
                  <td className="py-2 px-3 font-mono text-text-secondary">{c.phone}</td>
                  <td className="py-2 px-3 text-center text-text-secondary">{c.totalOrders}</td>
                  <td className="py-2 px-3 text-center font-bold text-blue-400">{c.periodOrders}</td>
                  <td className="py-2 px-3 font-bold text-green-400">{formatCurrency(c.periodRevenue)}</td>
                  <td className="py-2 px-3 text-center text-purple-400 font-mono">{c.loyaltyPoints || 0}</td>
                  <td className="py-2 px-3 text-text-muted">{new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-text-muted">No customers found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
