import { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { CreditCard, RefreshCcw } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { DatePreset, getDateRangeForPreset, toApiDateTimeRange } from '@/lib/dateRanges';

export default function DuePaymentsReport() {
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
    queryKey: ['reports', 'due-payments', startDate, endDate],
    queryFn: () => api.get('/restaurant/reports/due-payments', { params: { dateFrom, dateTo } }).then(r => r.data.data),
  });

  const payments = reportData?.payments || [];
  const summary = reportData?.summary || { totalDue: 0, totalCollected: 0, pending: 0 };
  const totalCollected = Number(summary.totalCollected || 0);
  const pendingCount = Number(summary.pending || 0);

  const exportRows = payments.map((p: any) => ({
    'Order #': p.order?.orderNumber || p.orderId,
    Customer: p.order?.customer?.name || 'N/A',
    Amount: formatCurrency(p.amount),
    Method: p.method,
    Status: p.isDue ? 'Due' : 'Paid',
    'Paid At': p.paidAt ? new Date(p.paidAt).toLocaleString() : 'Not Paid',
  }));

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <RefreshCcw className="w-6 h-6 animate-spin text-blue-400" />
        <span className="text-sm text-text-muted">Loading...</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 animate-in p-1">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Due Payments Received</h1>
          <p className="text-xs text-text-muted mt-1">Track collection of outstanding due payments • {startDate} to {endDate}</p>
        </div>
        <ExportDropdown data={exportRows} filename="due-payments-report" title="Due Payments Received" subtitle={`${startDate} to ${endDate}`} />
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <span className="text-[11px] font-medium text-blue-400 uppercase tracking-wider">Total Due Amount</span>
          <span className="text-2xl font-bold text-text-primary">{formatCurrency(summary.totalDue)}</span>
          <span className="text-[10px] text-text-muted">outstanding balance</span>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-success/10 to-success/5 border-success/20">
          <span className="text-[11px] font-medium text-success uppercase tracking-wider">Collected</span>
          <span className="text-2xl font-bold text-success">{formatCurrency(totalCollected)}</span>
          <span className="text-[10px] text-text-muted">payments received</span>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-warning/10 to-warning/5 border-warning/20">
          <span className="text-[11px] font-medium text-yellow-400 uppercase tracking-wider">Still Pending</span>
          <span className="text-2xl font-bold text-yellow-400">{pendingCount}</span>
          <span className="text-[10px] text-text-muted">payments not yet collected</span>
        </Card>
      </div>

      <Card padding={false}>
        <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30 flex items-center justify-between">
          <h3 className="font-semibold text-text-primary text-sm">Due Payment Records</h3>
          <span className="text-[10px] text-text-muted">{payments.length} records</span>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border">
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">ORDER #</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">CUSTOMER</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">AMOUNT</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">METHOD</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">STATUS</th>
                <th className="py-3 px-4 text-right font-semibold text-text-secondary">PAID AT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {payments.map((p: any) => (
                <tr key={p.id} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-3 px-4 font-bold text-text-primary">#{p.order?.orderNumber}</td>
                  <td className="py-3 px-4 text-text-secondary">{p.order?.customer?.name || '—'}</td>
                  <td className="py-3 px-4 font-semibold text-text-primary">{formatCurrency(p.amount)}</td>
                  <td className="py-3 px-4 text-text-secondary capitalize">{p.method}</td>
                  <td className="py-3 px-4">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${p.isDue ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>
                      {p.isDue ? 'Pending' : 'Collected'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-text-muted">{p.paidAt ? new Date(p.paidAt).toLocaleString() : '—'}</td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-text-muted italic">No due payment records found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}