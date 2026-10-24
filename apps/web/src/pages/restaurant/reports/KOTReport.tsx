import { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { ClipboardList, RefreshCcw } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { DatePreset, getDateRangeForPreset, toApiDateTimeRange } from '@/lib/dateRanges';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';

const STATUS_COLOR: Record<string, string> = { pending: '#f59e0b', preparing: '#3b82f6', ready: '#10b981', served: '#8b5cf6', cancelled: '#ef4444' };
const BAR_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];

export default function KOTReport() {
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
    queryKey: ['reports', 'kot', startDate, endDate],
    queryFn: () => api.get('/restaurant/reports/kot', { params: { dateFrom, dateTo } }).then(r => r.data.data),
  });

  const kots: any[] = data?.kots || [];
  const summary = data?.summary || { total: 0, totalItems: 0, byStatus: {} };

  const statusChart = Object.entries(summary.byStatus || {}).map(([name, count]: any, i) => ({ name: name.toUpperCase(), count, fill: BAR_COLORS[i % BAR_COLORS.length] }));

  const exportData = kots.map((k: any) => ({
    'KOT #': k.id,
    Date: new Date(k.createdAt).toLocaleDateString(),
    Time: new Date(k.createdAt).toLocaleTimeString(),
    'Order #': k.orderId,
    'Order Type': k.order?.type || '-',
    Table: k.order?.table?.name || '-',
    Staff: k.order?.staff?.name || '-',
    Kitchen: k.kitchen?.name || '-',
    Status: k.status,
    'Items Count': k.items?.length || 0,
  }));

  if (isLoading) return <div className="flex items-center justify-center h-64"><RefreshCcw className="w-6 h-6 animate-spin text-orange-400" /></div>;

  return (
    <div className="space-y-4 animate-in p-1">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">KOT Report</h1>
          <p className="text-xs text-text-muted mt-1">Kitchen Order Tickets • {startDate} to {endDate}</p>
        </div>
        <ExportDropdown data={exportData} filename="kot-report" title="KOT Report" subtitle={`${startDate} to ${endDate}`} />
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

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Card className="p-4 bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
          <p className="text-[11px] font-medium text-orange-400 uppercase tracking-wider">Total KOTs</p>
          <p className="text-2xl font-bold text-text-primary mt-1">{summary.total}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <p className="text-[11px] font-medium text-blue-400 uppercase tracking-wider">Total Items Prepared</p>
          <p className="text-2xl font-bold text-text-primary mt-1">{summary.totalItems}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <p className="text-[11px] font-medium text-green-400 uppercase tracking-wider">Avg Items per KOT</p>
          <p className="text-2xl font-bold text-text-primary mt-1">{summary.total > 0 ? (summary.totalItems / summary.total).toFixed(1) : '0'}</p>
        </Card>
      </div>

      {statusChart.length > 0 && (
        <Card>
          <h3 className="font-semibold text-text-primary text-sm mb-4">KOT Status Breakdown</h3>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: '#0d1526', borderColor: '#1e3a5f', borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="count" radius={[4,4,0,0]}>
                  {statusChart.map((e: any, i: number) => <Cell key={i} fill={e.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card padding={false}>
        <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30 flex items-center justify-between">
          <h3 className="font-semibold text-text-primary text-sm flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-orange-400" />KOT Details
          </h3>
          <span className="text-[10px] text-text-muted">{kots.length} KOTs</span>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border">
                {['KOT #','Time','Order #','Type','Table','Staff','Kitchen','Items','Status'].map(h => (
                  <th key={h} className="py-2.5 px-3 text-left font-semibold text-text-secondary">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {kots.slice(0, 300).map((k: any) => (
                <tr key={k.id} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-2 px-3 font-mono font-bold text-text-primary">#{k.id}</td>
                  <td className="py-2 px-3 text-text-muted">{new Date(k.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="py-2 px-3 font-mono text-text-secondary">#{k.orderId}</td>
                  <td className="py-2 px-3 text-text-secondary capitalize">{(k.order?.type || 'dine_in').replace('_',' ')}</td>
                  <td className="py-2 px-3 text-text-secondary">{k.order?.table?.name || '-'}</td>
                  <td className="py-2 px-3 text-text-secondary">{k.order?.staff?.name || '-'}</td>
                  <td className="py-2 px-3 text-text-secondary">{k.kitchen?.name || '-'}</td>
                  <td className="py-2 px-3 text-center font-mono text-blue-400">{k.items?.reduce((s: number, i: any) => s + i.quantity, 0) || 0}</td>
                  <td className="py-2 px-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ backgroundColor: `${STATUS_COLOR[k.status] || '#6b7280'}20`, color: STATUS_COLOR[k.status] || '#9ca3af' }}>
                      {k.status?.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
              {kots.length === 0 && (
                <tr><td colSpan={9} className="py-10 text-center text-text-muted">No KOTs found for the selected period</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
