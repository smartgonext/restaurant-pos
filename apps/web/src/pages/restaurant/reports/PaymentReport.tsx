import { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { Badge } from '@/components/ui/Badge';
import { CreditCard, RefreshCcw } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { DatePreset, getDateRangeForPreset, toApiDateTimeRange } from '@/lib/dateRanges';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const METHOD_COLORS: Record<string, string> = { cash: '#10b981', upi: '#8b5cf6', card: '#3b82f6', 'bank transfer': '#06b6d4', online: '#f59e0b' };
const COLORS = ['#10b981', '#8b5cf6', '#3b82f6', '#06b6d4', '#f59e0b', '#ef4444'];

export default function PaymentReport() {
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
    queryKey: ['reports', 'payments', startDate, endDate],
    queryFn: () => api.get('/restaurant/reports/payments', { params: { dateFrom, dateTo } }).then(r => r.data.data),
  });

  const payments = data?.payments || [];
  const summary = data?.summary || { totalCollected: 0, totalDue: 0, count: 0 };
  const byMethod = data?.byMethod || {};

  const methodChart = Object.entries(byMethod).map(([name, v]: any, i) => ({
    name: name.toUpperCase(), amount: v.amount, count: v.count, fill: COLORS[i % COLORS.length],
  }));

  const exportData = payments.map((p: any) => ({
    'Payment ID': p.id,
    Date: new Date(p.createdAt).toLocaleDateString(),
    'Order ID': p.orderId,
    Method: p.method,
    Amount: p.amount,
    'Is Due': p.isDue ? 'Yes' : 'No',
    Staff: p.order?.staff?.name || '-',
    Table: p.order?.table?.name || '-',
  }));

  if (isLoading) return <div className="flex items-center justify-center h-64"><RefreshCcw className="w-6 h-6 animate-spin text-purple-400" /></div>;

  return (
    <div className="space-y-4 animate-in p-1">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Payment Report</h1>
          <p className="text-xs text-text-muted mt-1">{startDate} to {endDate}</p>
        </div>
        <ExportDropdown data={exportData} filename="payment-report" title="Payment Report" subtitle={`${startDate} to ${endDate}`} />
      </div>

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="grid grid-cols-1 gap-3">
          <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
            <p className="text-[11px] font-medium text-green-400 uppercase tracking-wider">Total Collected</p>
            <p className="text-2xl font-bold text-text-primary mt-1">{formatCurrency(summary.totalCollected)}</p>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
            <p className="text-[11px] font-medium text-orange-400 uppercase tracking-wider">Total Due</p>
            <p className="text-2xl font-bold text-text-primary mt-1">{formatCurrency(summary.totalDue)}</p>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
            <p className="text-[11px] font-medium text-blue-400 uppercase tracking-wider">Transactions</p>
            <p className="text-2xl font-bold text-text-primary mt-1">{summary.count}</p>
          </Card>
        </div>

        <Card className="lg:col-span-2">
          <h3 className="font-semibold text-text-primary text-sm mb-4">Payment Method Distribution</h3>
          {methodChart.length > 0 ? (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={methodChart} cx="40%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="amount">
                    {methodChart.map((e: any, i: number) => <Cell key={i} fill={e.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => formatCurrency(v)} contentStyle={{ backgroundColor: '#0d1526', borderColor: '#1e3a5f', borderRadius: 8, fontSize: 11 }} />
                  <Legend formatter={(value) => <span className="text-[11px] text-text-secondary">{value}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="flex items-center justify-center h-[220px] text-text-muted text-sm">No payment data</div>}
        </Card>
      </div>

      {/* Method Breakdown */}
      {methodChart.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {methodChart.map((m: any, i: number) => (
            <Card key={i} className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: m.fill }} />
                <span className="text-xs font-semibold text-text-secondary">{m.name}</span>
              </div>
              <p className="text-lg font-bold text-text-primary">{formatCurrency(m.amount)}</p>
              <p className="text-[10px] text-text-muted">{m.count} transactions</p>
            </Card>
          ))}
        </div>
      )}

      {/* Payments Table */}
      <Card padding={false}>
        <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30 flex items-center justify-between">
          <h3 className="font-semibold text-text-primary text-sm flex items-center gap-2"><CreditCard className="w-4 h-4 text-purple-400" />Payment Transactions</h3>
          <span className="text-[10px] text-text-muted">{payments.length} records</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border">
                {['Date','Order #','Method','Amount','Due','Table','Staff'].map(h => (
                  <th key={h} className="py-2.5 px-3 text-left font-semibold text-text-secondary">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {payments.slice(0, 300).map((p: any) => (
                <tr key={p.id} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-2 px-3 text-text-muted">{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td className="py-2 px-3 font-mono text-text-secondary">#{p.orderId}</td>
                  <td className="py-2 px-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: `${METHOD_COLORS[p.method?.toLowerCase()] || '#6b7280'}20`, color: METHOD_COLORS[p.method?.toLowerCase()] || '#9ca3af' }}>
                      {p.method?.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-semibold text-text-primary">{formatCurrency(p.amount)}</td>
                  <td className="py-2 px-3">{p.isDue ? <Badge variant="danger">Due</Badge> : <Badge variant="success">Paid</Badge>}</td>
                  <td className="py-2 px-3 text-text-secondary">{p.order?.table?.name || '-'}</td>
                  <td className="py-2 px-3 text-text-secondary">{p.order?.staff?.name || '-'}</td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-text-muted">No payments found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
