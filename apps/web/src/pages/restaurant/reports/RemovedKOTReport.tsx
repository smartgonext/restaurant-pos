import { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { Trash2, RefreshCcw } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { DatePreset, getDateRangeForPreset, toApiDateTimeRange } from '@/lib/dateRanges';

export default function RemovedKOTReport() {
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
    queryKey: ['reports', 'removed-kot', startDate, endDate],
    queryFn: () => api.get('/restaurant/reports/removed-kot-items', { params: { dateFrom, dateTo } }).then(r => r.data.data),
  });

  const items = reportData?.items || [];
  const summary = reportData?.summary || { totalRemoved: 0, lostRevenue: 0 };

  const exportRows = items.map((item: any) => ({
    Source: item.source || '—',
    'Ref #': item.details?.kotId || item.details?.tokenId || item.details?.orderId || '—',
    'Item Name': item.name || 'Unknown',
    Quantity: item.quantity,
    Price: formatCurrency(item.price),
    Reason: item.removeReason || 'N/A',
    Time: new Date(item.removedAt || item.createdAt || Date.now()).toLocaleString(),
  }));

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <RefreshCcw className="w-6 h-6 animate-spin text-red-400" />
        <span className="text-sm text-text-muted">Loading...</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 animate-in p-1">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Removed KOT Item Report</h1>
          <p className="text-xs text-text-muted mt-1">Items removed from Kitchen Order Tickets with reasons • {startDate} to {endDate}</p>
        </div>
        <ExportDropdown data={exportRows} filename="removed-kot-report" title="Removed KOT Items" subtitle={`${startDate} to ${endDate}`} />
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
          <span className="text-[11px] font-medium text-danger uppercase tracking-wider">Total Items Removed</span>
          <span className="text-2xl font-bold text-text-primary">{summary.totalRemoved}</span>
          <span className="text-[10px] text-text-muted">items</span>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
          <span className="text-[11px] font-medium text-orange-400 uppercase tracking-wider">Est. Lost Revenue</span>
          <span className="text-2xl font-bold text-text-primary">{formatCurrency(summary.lostRevenue)}</span>
          <span className="text-[10px] text-text-muted">avg {(summary.totalRemoved || 1) > 0 ? formatCurrency(summary.lostRevenue / (summary.totalRemoved || 1)) : '—'} per removal</span>
        </Card>
      </div>

      <Card padding={false}>
        <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30 flex items-center justify-between">
          <h3 className="font-semibold text-text-primary text-sm">Removed KOT Items</h3>
          <span className="text-[10px] text-text-muted">{items.length} records</span>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border">
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">SOURCE</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">REF #</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">ITEM NAME</th>
                <th className="py-3 px-4 text-center font-semibold text-text-secondary">QTY</th>
                <th className="py-3 px-4 text-right font-semibold text-text-secondary">PRICE</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">REASON</th>
                <th className="py-3 px-4 text-right font-semibold text-text-secondary">TIME</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {items.map((item: any, idx: number) => (
                <tr key={idx} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-3 px-4 font-bold text-text-primary uppercase">{item.source || '—'}</td>
                  <td className="py-3 px-4 text-blue-400">#{item.details?.kotId || item.details?.tokenId || item.details?.orderId || '—'}</td>
                  <td className="py-3 px-4 text-text-primary">{item.name || 'Unknown'}</td>
                  <td className="py-3 px-4 text-center text-text-secondary">{item.quantity}x</td>
                  <td className="py-3 px-4 text-right font-semibold text-text-primary">{formatCurrency(item.price)}</td>
                  <td className="py-3 px-4 text-text-muted max-w-[200px] truncate" title={item.removeReason || ''}>{item.removeReason || '—'}</td>
                  <td className="py-3 px-4 text-right text-text-muted">{new Date(item.removedAt || item.createdAt || Date.now()).toLocaleString()}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-text-muted italic">No removed KOT items found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}