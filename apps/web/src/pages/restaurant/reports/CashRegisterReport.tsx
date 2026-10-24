import { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { Badge } from '@/components/ui/Badge';
import { Landmark, RefreshCcw } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { DatePreset, getDateRangeForPreset, toApiDateTimeRange } from '@/lib/dateRanges';

export default function CashRegisterReport() {
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
    queryKey: ['reports', 'cash-register', startDate, endDate],
    queryFn: () => api.get('/restaurant/reports/cash-register', { params: { dateFrom, dateTo } }).then(r => r.data.data),
  });

  const sessions: any[] = data?.sessions || [];
  const summary = data?.summary || { totalSessions: 0, totalOpeningBalance: 0, totalClosingBalance: 0, totalDiscrepancy: 0, openSessions: 0 };

  const exportData = sessions.map((s: any) => ({
    'Session ID': s.id,
    Cashier: s.cashier?.name || '-',
    'Opened At': new Date(s.openedAt).toLocaleString(),
    'Closed At': s.closedAt ? new Date(s.closedAt).toLocaleString() : '-',
    Status: s.status,
    'Opening Balance': s.openingBalance,
    'Closing Balance': s.closingBalance || '-',
    'Expected Cash': s.expectedCash || '-',
    Discrepancy: s.discrepancy || 0,
    Notes: s.note || '-',
  }));

  if (isLoading) return <div className="flex items-center justify-center h-64"><RefreshCcw className="w-6 h-6 animate-spin text-emerald-400" /></div>;

  return (
    <div className="space-y-4 animate-in p-1">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Cash Register Report</h1>
          <p className="text-xs text-text-muted mt-1">Sessions, balances & discrepancies • {startDate} to {endDate}</p>
        </div>
        <ExportDropdown data={exportData} filename="cash-register-report" title="Cash Register Report" subtitle={`${startDate} to ${endDate}`} />
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

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Sessions', value: summary.totalSessions, color: 'blue' },
          { label: 'Open Sessions', value: summary.openSessions, color: 'green' },
          { label: 'Opening Balance', value: formatCurrency(summary.totalOpeningBalance), color: 'purple' },
          { label: 'Closing Balance', value: formatCurrency(summary.totalClosingBalance), color: 'teal' },
          { label: 'Total Discrepancy', value: formatCurrency(Math.abs(summary.totalDiscrepancy)), color: summary.totalDiscrepancy !== 0 ? 'red' : 'gray' },
        ].map((s, i) => (
          <Card key={i} className={`p-4 bg-gradient-to-br from-${s.color}-500/10 to-${s.color}-500/5 border-${s.color}-500/20`}>
            <p className={`text-[11px] font-medium text-${s.color}-400 uppercase tracking-wider`}>{s.label}</p>
            <p className="text-lg font-bold text-text-primary mt-1">{s.value}</p>
          </Card>
        ))}
      </div>

      <Card padding={false}>
        <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30 flex items-center justify-between">
          <h3 className="font-semibold text-text-primary text-sm flex items-center gap-2"><Landmark className="w-4 h-4 text-emerald-400" />Register Sessions</h3>
          <span className="text-[10px] text-text-muted">{sessions.length} sessions</span>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border">
                {['#','Cashier','Opened At','Closed At','Status','Opening Bal','Closing Bal','Expected','Discrepancy','Notes'].map(h => (
                  <th key={h} className="py-2.5 px-3 text-left font-semibold text-text-secondary">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {sessions.map((s: any, idx: number) => {
                const disc = Number(s.discrepancy || 0);
                return (
                  <tr key={s.id} className="hover:bg-bg-hover/30 transition-colors">
                    <td className="py-2 px-3 font-mono text-text-muted">{idx + 1}</td>
                    <td className="py-2 px-3 font-semibold text-text-primary">{s.cashier?.name || 'Unknown'}</td>
                    <td className="py-2 px-3 text-text-secondary">{new Date(s.openedAt).toLocaleString()}</td>
                    <td className="py-2 px-3 text-text-secondary">{s.closedAt ? new Date(s.closedAt).toLocaleString() : <span className="text-green-400 font-medium">Open</span>}</td>
                    <td className="py-2 px-3">
                      <Badge variant={s.status === 'open' ? 'success' : 'default'}>{s.status}</Badge>
                    </td>
                    <td className="py-2 px-3 text-text-secondary">{formatCurrency(s.openingBalance)}</td>
                    <td className="py-2 px-3 text-text-secondary">{s.closingBalance != null ? formatCurrency(s.closingBalance) : '-'}</td>
                    <td className="py-2 px-3 text-text-secondary">{s.expectedCash != null ? formatCurrency(s.expectedCash) : '-'}</td>
                    <td className={`py-2 px-3 font-bold ${disc < 0 ? 'text-red-400' : disc > 0 ? 'text-green-400' : 'text-text-muted'}`}>
                      {disc !== 0 ? (disc > 0 ? '+' : '') + formatCurrency(disc) : '-'}
                    </td>
                    <td className="py-2 px-3 text-text-muted max-w-[120px] truncate">{s.note || '-'}</td>
                  </tr>
                );
              })}
              {sessions.length === 0 && (
                <tr><td colSpan={10} className="py-10 text-center text-text-muted">No register sessions found for this period</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
