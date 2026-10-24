import { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { Badge } from '@/components/ui/Badge';
import { Users, TrendingUp, DollarSign, ShoppingBag, Award, RefreshCcw } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { DatePreset, getDateRangeForPreset, toApiDateTimeRange } from '@/lib/dateRanges';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function StaffPerformanceReport() {
  const [dateRange, setDateRange] = useState<DatePreset>('Today');
  const [startDate, setStartDate] = useState(getDateRangeForPreset('Today').startDate);
  const [endDate, setEndDate] = useState(getDateRangeForPreset('Today').endDate);

  useEffect(() => {
    if (dateRange === 'Custom') return;
    const next = getDateRangeForPreset(dateRange);
    setStartDate(next.startDate); setEndDate(next.endDate);
  }, [dateRange]);

  const { dateFrom, dateTo } = useMemo(() => toApiDateTimeRange(startDate, endDate), [startDate, endDate]);

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'staff-performance', startDate, endDate],
    queryFn: () => api.get('/restaurant/reports/staff-performance', { params: { dateFrom, dateTo } }).then(r => r.data.data),
  });

  const performance: any[] = data?.performance || [];
  const summary = data?.summary || { totalStaff: 0, grandRevenue: 0, totalOrders: 0, totalTokens: 0 };

  const topStaff = performance.slice(0, 8);

  const exportData = performance.map((s: any) => ({
    'Staff Name': s.name,
    Role: s.role,
    'Table Orders': s.orderCount,
    'POS Billing (Tokens)': s.tokenCount,
    'Total Billing': s.totalBilling,
    'Total Revenue': s.totalRevenue,
    'Avg Order Value': s.avgOrderValue?.toFixed(2),
    'Cash Collected': s.cashCollected?.toFixed(2),
    'UPI Collected': s.upiCollected?.toFixed(2),
    'Card Collected': s.cardCollected?.toFixed(2),
    'Total Discount Given': s.totalDiscount?.toFixed(2),
    'Tips Received': s.totalTip?.toFixed(2),
    Active: s.isActive ? 'Yes' : 'No',
  }));

  if (isLoading) return <div className="flex items-center justify-center h-64"><RefreshCcw className="w-6 h-6 animate-spin text-blue-400" /></div>;

  return (
    <div className="space-y-4 animate-in p-1">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Staff Performance Report</h1>
          <p className="text-xs text-text-muted mt-1">POS billing, table orders & revenue per staff • {startDate} to {endDate}</p>
        </div>
        <ExportDropdown data={exportData} filename="staff-performance" title="Staff Performance Report" subtitle={`${startDate} to ${endDate}`} />
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

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Revenue Generated', value: formatCurrency(summary.grandRevenue), icon: DollarSign, color: 'blue' },
          { label: 'Table Orders Handled', value: summary.totalOrders, icon: ShoppingBag, color: 'green' },
          { label: 'POS Billings Done', value: summary.totalTokens, icon: TrendingUp, color: 'purple' },
          { label: 'Active Staff Members', value: summary.totalStaff, icon: Users, color: 'orange' },
        ].map((s, i) => (
          <Card key={i} className={`p-4 bg-gradient-to-br from-${s.color}-500/10 to-${s.color}-500/5 border-${s.color}-500/20`}>
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`w-4 h-4 text-${s.color}-400`} />
              <p className={`text-[10px] font-medium text-${s.color}-400 uppercase tracking-wider`}>{s.label}</p>
            </div>
            <p className="text-xl font-bold text-text-primary">{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Bar Chart */}
      {topStaff.length > 0 && (
        <Card>
          <h3 className="font-semibold text-text-primary text-sm mb-4">Revenue by Staff (Top 8)</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topStaff.map((s: any) => ({ name: s.name?.split(' ')[0], revenue: s.totalRevenue, billing: s.totalBilling }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: '#0d1526', borderColor: '#1e3a5f', borderRadius: 8, fontSize: 11 }} formatter={(v: any, n) => [n === 'revenue' ? formatCurrency(v) : v, n === 'revenue' ? 'Revenue' : 'Bills']} />
                <Bar dataKey="revenue" fill="#3b82f6" radius={[4,4,0,0]} name="revenue" />
                <Bar dataKey="billing" fill="#10b981" radius={[4,4,0,0]} name="billing" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Performance Table */}
      <Card padding={false}>
        <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30 flex items-center justify-between">
          <h3 className="font-semibold text-text-primary text-sm flex items-center gap-2">
            <Award className="w-4 h-4 text-yellow-400" />Staff Performance Breakdown
          </h3>
          <span className="text-[10px] text-text-muted">{performance.length} staff</span>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border">
                {['#','Staff','Role','Table Orders','POS Bills','Total Bills','Revenue','Avg Bill','Cash','UPI','Card','Discount','Tip','Status'].map(h => (
                  <th key={h} className="py-2.5 px-3 text-left font-semibold text-text-secondary">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {performance.map((s: any, idx: number) => (
                <tr key={s.id || idx} className={`hover:bg-bg-hover/30 transition-colors ${idx === 0 ? 'bg-yellow-500/5' : ''}`}>
                  <td className="py-2.5 px-3">
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : <span className="text-text-muted">{idx + 1}</span>}
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-text-primary">{s.name}</td>
                  <td className="py-2.5 px-3"><Badge variant="info">{s.role}</Badge></td>
                  <td className="py-2.5 px-3 text-center font-mono text-blue-400">{s.orderCount}</td>
                  <td className="py-2.5 px-3 text-center font-mono text-purple-400">{s.tokenCount}</td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-text-primary">{s.totalBilling}</td>
                  <td className="py-2.5 px-3 font-bold text-green-400">{formatCurrency(s.totalRevenue)}</td>
                  <td className="py-2.5 px-3 text-text-secondary">{formatCurrency(s.avgOrderValue)}</td>
                  <td className="py-2.5 px-3 text-green-400">{formatCurrency(s.cashCollected)}</td>
                  <td className="py-2.5 px-3 text-purple-400">{formatCurrency(s.upiCollected)}</td>
                  <td className="py-2.5 px-3 text-blue-400">{formatCurrency(s.cardCollected)}</td>
                  <td className="py-2.5 px-3 text-rose-400">{formatCurrency(s.totalDiscount)}</td>
                  <td className="py-2.5 px-3 text-emerald-400">{formatCurrency(s.totalTip)}</td>
                  <td className="py-2.5 px-3">{s.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="default">Inactive</Badge>}</td>
                </tr>
              ))}
              {performance.length === 0 && (
                <tr><td colSpan={14} className="py-10 text-center text-text-muted">No staff performance data for this period</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
