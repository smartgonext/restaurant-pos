import { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { XCircle, RefreshCcw } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { DatePreset, getDateRangeForPreset, toApiDateTimeRange } from '@/lib/dateRanges';

export default function CancelledOrdersReport() {
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
    queryKey: ['reports', 'cancelled-orders', startDate, endDate],
    queryFn: () => api.get('/restaurant/reports/cancelled-orders', { params: { dateFrom, dateTo } }).then(r => r.data.data),
  });

  const orders = reportData?.orders || [];
  const summary = reportData?.summary || { totalCancelled: 0, totalLostRevenue: 0 };

  const exportRows = orders.map((o: any) => ({
    'Order #': o.orderNumber,
    Table: o.table?.name || 'N/A',
    'Cancelled By': o.cancelledBy || o.staff?.name || 'Unknown',
    Reason: o.cancelReason || 'No reason',
    Amount: formatCurrency(o.total),
    Time: new Date(o.createdAt).toLocaleString(),
  }));

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <RefreshCcw className="w-6 h-6 animate-spin text-rose-400" />
        <span className="text-sm text-text-muted">Loading...</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 animate-in p-1">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Cancelled Orders Report</h1>
          <p className="text-xs text-text-muted mt-1">Review all cancelled orders and their reasons • {startDate} to {endDate}</p>
        </div>
        <ExportDropdown data={exportRows} filename="cancelled-orders-report" title="Cancelled Orders Report" subtitle={`${startDate} to ${endDate}`} />
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Date Range</label>
            <select value={dateRange} onChange={e => setDateRange(e.target.value as DatePreset)} className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/20">
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
            <input type="date" value={startDate} onChange={e => { setDateRange('Custom'); setStartDate(e.target.value); }} className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/20" />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">End Date</label>
            <input type="date" value={endDate} onChange={e => { setDateRange('Custom'); setEndDate(e.target.value); }} className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/20" />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-danger/10 to-danger/5 border-danger/20">
          <span className="text-[11px] font-medium text-danger uppercase tracking-wider">Total Cancelled</span>
          <span className="text-2xl font-bold text-text-primary">{summary.totalCancelled}</span>
          <span className="text-[10px] text-text-muted">orders cancelled</span>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
          <span className="text-[11px] font-medium text-orange-400 uppercase tracking-wider">Lost Revenue</span>
          <span className="text-2xl font-bold text-text-primary">{formatCurrency(summary.totalLostRevenue)}</span>
          <span className="text-[10px] text-text-muted">avg {(summary.totalCancelled || 1) > 0 ? formatCurrency(summary.totalLostRevenue / (summary.totalCancelled || 1)) : '—'} per order</span>
        </Card>
      </div>

      <Card padding={false}>
        <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30 flex items-center justify-between">
          <h3 className="font-semibold text-text-primary text-sm">Cancelled Orders</h3>
          <span className="text-[10px] text-text-muted">{orders.length} records</span>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border">
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">ORDER #</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">TABLE</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">REASON</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">CANCELLED BY</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">AMOUNT</th>
                <th className="py-3 px-4 text-right font-semibold text-text-secondary">TIME</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {orders.map((o: any) => (
                <tr key={o.id} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-3 px-4 font-bold text-text-primary">#{o.orderNumber}</td>
                  <td className="py-3 px-4 text-text-secondary">{o.table?.name || 'N/A'}</td>
                  <td className="py-3 px-4 text-text-secondary max-w-[200px] truncate" title={o.cancelReason || ''}>{o.cancelReason || '—'}</td>
                  <td className="py-3 px-4 text-text-secondary">{o.staff?.name || 'System'}</td>
                  <td className="py-3 px-4 font-semibold text-danger">{formatCurrency(o.total)}</td>
                  <td className="py-3 px-4 text-right text-text-muted">{new Date(o.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-text-muted italic">No cancelled orders in this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}