import { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { RotateCcw, RefreshCcw } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { DatePreset, getDateRangeForPreset, toApiDateTimeRange } from '@/lib/dateRanges';

export default function RefundReport() {
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
    queryKey: ['reports', 'refunds', startDate, endDate],
    queryFn: () => api.get('/restaurant/reports/refunds', { params: { dateFrom, dateTo } }).then(r => r.data.data),
  });

  const refunds = reportData?.refunds || [];
  const inventoryAdjustments = reportData?.inventoryAdjustments || [];
  const summary = reportData?.summary || { count: 0, totalRefunded: 0 };

  const exportRows = refunds.map((r: any) => ({
    'Order #': r.order?.orderNumber || r.orderId,
    'Refund Type': r.refundType,
    Amount: formatCurrency(r.refundedAmount),
    Reason: r.reason || 'N/A',
    'Processed By': r.processedBy || 'System',
    Date: new Date(r.createdAt).toLocaleString(),
  }));

  const totalAdjustmentValue = inventoryAdjustments.reduce((s: number, a: any) => s + Number(a.value || 0), 0);

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <RefreshCcw className="w-6 h-6 animate-spin text-orange-400" />
        <span className="text-sm text-text-muted">Loading...</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 animate-in p-1">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Refund Report</h1>
          <p className="text-xs text-text-muted mt-1">All refund transactions and processed amounts • {startDate} to {endDate}</p>
        </div>
        <ExportDropdown data={exportRows} filename="refund-report" title="Refund Report" subtitle={`${startDate} to ${endDate}`} />
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
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
          <span className="text-[11px] font-medium text-orange-400 uppercase tracking-wider">Total Refunds</span>
          <span className="text-2xl font-bold text-text-primary">{summary.count}</span>
          <span className="text-[10px] text-text-muted">transactions</span>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-danger/10 to-danger/5 border-danger/20">
          <span className="text-[11px] font-medium text-danger uppercase tracking-wider">Amount Refunded</span>
          <span className="text-2xl font-bold text-danger">{formatCurrency(summary.totalRefunded)}</span>
          <span className="text-[10px] text-text-muted">avg {summary.count > 0 ? formatCurrency(summary.totalRefunded / summary.count) : '—'} per refund</span>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-rose-500/10 to-rose-500/5 border-rose-500/20">
          <span className="text-[11px] font-medium text-rose-400 uppercase tracking-wider">Inventory Adjustments</span>
          <span className="text-2xl font-bold text-text-primary">{formatCurrency(totalAdjustmentValue)}</span>
          <span className="text-[10px] text-text-muted">{inventoryAdjustments.length} adjustments</span>
        </Card>
      </div>

      <Card padding={false}>
        <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30 flex items-center justify-between">
          <h3 className="font-semibold text-text-primary text-sm">Refund Transactions</h3>
          <span className="text-[10px] text-text-muted">{refunds.length} records</span>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border">
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">ORDER #</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">TYPE</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">AMOUNT</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">REASON</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">PROCESSED BY</th>
                <th className="py-3 px-4 text-right font-semibold text-text-secondary">DATE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {refunds.map((r: any) => (
                <tr key={r.id} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-3 px-4 font-bold text-text-primary">#{r.order?.orderNumber || r.orderId}</td>
                  <td className="py-3 px-4">
                    <Badge variant={r.refundType === 'full' ? 'danger' : 'warning'} size="sm" className="capitalize">{r.refundType}</Badge>
                  </td>
                  <td className="py-3 px-4 font-bold text-danger">{formatCurrency(r.refundedAmount)}</td>
                  <td className="py-3 px-4 text-text-secondary max-w-[200px] truncate" title={r.reason || ''}>{r.reason || '—'}</td>
                  <td className="py-3 px-4 text-text-secondary">{r.processedBy || 'System'}</td>
                  <td className="py-3 px-4 text-right text-text-muted">{new Date(r.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {refunds.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-text-muted italic">No refunds found for this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card padding={false}>
        <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30 flex items-center justify-between">
          <h3 className="font-bold text-sm text-text-primary">Inventory Adjustments (Returns & Damages)</h3>
          <ExportDropdown data={inventoryAdjustments.map((a: any) => ({
            Item: a.item?.name || a.itemId,
            Type: a.type,
            Quantity: Number(a.quantity || 0),
            Value: formatCurrency(Number(a.value || 0)),
            Note: a.note || '—',
            Date: new Date(a.createdAt).toLocaleString(),
          }))} filename="inventory-adjustments" title="Inventory Adjustments" subtitle={`${startDate} to ${endDate}`} />
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border">
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">ITEM</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">TYPE</th>
                <th className="py-3 px-4 text-right font-semibold text-text-secondary">QTY</th>
                <th className="py-3 px-4 text-right font-semibold text-text-secondary">EST. VALUE</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">NOTE</th>
                <th className="py-3 px-4 text-right font-semibold text-text-secondary">DATE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {inventoryAdjustments.map((a: any) => (
                <tr key={a.id} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-3 px-4 font-bold text-text-primary">{a.item?.name || a.itemId}</td>
                  <td className="py-3 px-4">
                    <Badge size="sm" variant={a.type === 'damage' ? 'danger' : 'secondary'} className="capitalize">{a.type}</Badge>
                  </td>
                  <td className="py-3 px-4 text-right font-mono">{a.quantity}</td>
                  <td className="py-3 px-4 text-right font-bold text-text-primary">{formatCurrency(Number(a.value || 0))}</td>
                  <td className="py-3 px-4 text-text-secondary max-w-[200px] truncate" title={a.note || ''}>{a.note || '—'}</td>
                  <td className="py-3 px-4 text-right text-text-muted">{new Date(a.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {inventoryAdjustments.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-text-muted italic">No inventory adjustments found for this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}