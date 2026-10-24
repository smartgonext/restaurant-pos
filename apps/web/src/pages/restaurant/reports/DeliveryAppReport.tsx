import { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { Truck, RefreshCcw } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { DatePreset, getDateRangeForPreset, toApiDateTimeRange } from '@/lib/dateRanges';

export default function DeliveryAppReport() {
  const initial = getDateRangeForPreset('Today');
  const [dateRange, setDateRange] = useState<DatePreset>('Today');
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);

  useEffect(() => {
    if (dateRange === 'Custom') return;
    const next = getDateRangeForPreset(dateRange);
    setStartDate(next.startDate);
    setEndDate(next.endDate);
  }, [dateRange]);

  const { dateFrom, dateTo } = useMemo(() => ({
    ...toApiDateTimeRange(startDate, endDate),
  }), [startDate, endDate]);

  const { data: reportData, isLoading } = useQuery({
    queryKey: ['reports', 'delivery-app', startDate, endDate],
    queryFn: () => api.get('/restaurant/reports/delivery-apps', { params: { dateFrom, dateTo } }).then(r => r.data.data),
  });

  const apps = (reportData?.breakdown || []).map((row: any) => ({
    name: row.app,
    orderCount: Number(row.count || 0),
    revenue: Number(row.total || 0),
    commissionRate: 0,
    commissionAmount: 0,
    netRevenue: Number(row.total || 0),
  }));
  const summary = reportData?.summary || { totalOrders: 0, totalRevenue: 0, totalCommission: 0, netRevenue: 0 };

  const exportRows = apps.map((a: any) => ({
    'App Name': a.name,
    'Total Orders': a.orderCount,
    'Revenue': formatCurrency(a.revenue),
    'Commission Rate': `${a.commissionRate}%`,
    'Commission Amount': formatCurrency(a.commissionAmount),
    'Net Revenue': formatCurrency(a.netRevenue),
  }));

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <RefreshCcw className="w-6 h-6 animate-spin text-blue-400" />
        <span className="text-sm text-text-muted">Loading delivery report...</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 animate-in p-1">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Delivery App Report</h1>
          <p className="text-xs text-text-muted mt-1">Track orders, revenue, and commissions from delivery platforms • {startDate} to {endDate}</p>
        </div>
        <ExportDropdown data={exportRows} filename="delivery-app-report" title="Delivery App Report" subtitle={`${startDate} to ${endDate}`} />
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Date Range</label>
            <select value={dateRange} onChange={e => setDateRange(e.target.value as DatePreset)}
              className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/20">
              <option>Today</option>
              <option>Yesterday</option>
              <option>Last 7 Days</option>
              <option>Current Week</option>
              <option>Current Month</option>
              <option>Custom</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Start Date</label>
            <input type="date" value={startDate} onChange={e => { setDateRange('Custom'); setStartDate(e.target.value); }}
              className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/20" />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">End Date</label>
            <input type="date" value={endDate} onChange={e => { setDateRange('Custom'); setEndDate(e.target.value); }}
              className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/20" />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <span className="text-[11px] font-medium text-blue-400 uppercase tracking-wider">Total Orders</span>
          <span className="text-2xl font-bold text-text-primary">{summary.totalOrders}</span>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <span className="text-[11px] font-medium text-green-400 uppercase tracking-wider">Total Revenue</span>
          <span className="text-2xl font-bold text-text-primary">{formatCurrency(summary.totalRevenue)}</span>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
          <span className="text-[11px] font-medium text-orange-400 uppercase tracking-wider">Total Commission</span>
          <span className="text-2xl font-bold text-text-primary">{formatCurrency(summary.totalCommission)}</span>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
          <span className="text-[11px] font-medium text-purple-400 uppercase tracking-wider">Net Revenue</span>
          <span className="text-2xl font-bold text-text-primary">{formatCurrency(summary.netRevenue)}</span>
        </Card>
      </div>

      <Card padding={false}>
        <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30">
          <h3 className="font-semibold text-text-primary text-sm">App-wise Breakdown</h3>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border">
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">APP NAME</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">ORDERS</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">REVENUE</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">COMMISSION RATE</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">COMMISSION AMT</th>
                <th className="py-3 px-4 text-right font-semibold text-text-secondary">NET REVENUE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {apps.map((app: any, i: number) => (
                <tr key={i} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-3 px-4 font-semibold text-text-primary flex items-center gap-2">
                    <Truck className="w-3.5 h-3.5 text-blue-400" /> {app.name}
                  </td>
                  <td className="py-3 px-4 text-text-secondary">{app.orderCount}</td>
                  <td className="py-3 px-4 text-text-primary">{formatCurrency(app.revenue)}</td>
                  <td className="py-3 px-4 text-orange-400">{app.commissionRate}%</td>
                  <td className="py-3 px-4 text-danger">{formatCurrency(app.commissionAmount)}</td>
                  <td className="py-3 px-4 text-right font-bold text-success">{formatCurrency(app.netRevenue)}</td>
                </tr>
              ))}
              {apps.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-text-muted italic">No delivery app data found for this period.</td></tr>
              )}
            </tbody>
            {apps.length > 0 && (
              <tfoot>
                <tr className="bg-bg-tertiary/40 border-t-2 border-border font-bold">
                  <td className="py-3 px-4 text-text-primary">TOTAL</td>
                  <td className="py-3 px-4 text-text-primary">{apps.reduce((s: number, a: any) => s + a.orderCount, 0)}</td>
                  <td className="py-3 px-4 text-text-primary">{formatCurrency(apps.reduce((s: number, a: any) => s + a.revenue, 0))}</td>
                  <td className="py-3 px-4 text-text-primary">—</td>
                  <td className="py-3 px-4 text-text-primary">{formatCurrency(apps.reduce((s: number, a: any) => s + a.commissionAmount, 0))}</td>
                  <td className="py-3 px-4 text-right text-success">{formatCurrency(apps.reduce((s: number, a: any) => s + a.netRevenue, 0))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
}