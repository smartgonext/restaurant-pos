import { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { Heart, RefreshCcw, Sparkles } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { DatePreset, getDateRangeForPreset, toApiDateTimeRange } from '@/lib/dateRanges';

export default function LoyaltyReport() {
  const initial = getDateRangeForPreset('Current Month');
  const [dateRange, setDateRange] = useState<DatePreset>('Current Month');
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    if (dateRange === 'Custom') return;
    const next = getDateRangeForPreset(dateRange);
    setStartDate(next.startDate);
    setEndDate(next.endDate);
  }, [dateRange]);

  const { dateFrom, dateTo } = useMemo(() => ({
    ...toApiDateTimeRange(startDate, endDate),
  }), [startDate, endDate]);

  const { data: reportData, isLoading, refetch } = useQuery({
    queryKey: ['reports', 'loyalty', startDate, endDate],
    queryFn: () => api.get('/restaurant/reports/loyalty', { params: { dateFrom, dateTo } }).then(r => r.data.data),
  });

  const handleSeedLoyalty = async () => {
    setSeeding(true);
    try {
      await api.post('/restaurant/reports/loyalty/seed-sample-data');
      toast.success('Sample loyalty transactions seeded');
      refetch();
    } catch (err) {
      toast.error('Failed to seed loyalty data');
    } finally {
      setSeeding(false);
    }
  };

  const transactions = reportData?.transactions || [];
  const summary = reportData?.summary || { pointsEarned: 0, pointsRedeemed: 0, activeMembers: 0 };

  const exportRows = transactions.map((t: any) => ({
    Customer: t.customer?.name || 'N/A',
    Phone: t.customer?.phone || 'N/A',
    'Points Earned': Math.max(0, Number(t.points || 0)),
    'Points Redeemed': Math.max(0, Math.abs(Math.min(0, Number(t.points || 0)))),
    Date: new Date(t.createdAt).toLocaleDateString(),
  }));

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <RefreshCcw className="w-6 h-6 animate-spin text-pink-400" />
        <span className="text-sm text-text-muted">Loading Loyalty Analytics...</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 animate-in p-1">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Heart className="w-6 h-6 text-pink-500 fill-pink-500/20" />
            Loyalty Report
          </h1>
          <p className="text-xs text-text-muted mt-1">Points earned and redeemed by your loyal customers • {startDate} to {endDate}</p>
        </div>
        <div className="flex gap-2">
          <ExportDropdown data={exportRows} filename="loyalty-report" title="Loyalty Report" subtitle={`${startDate} to ${endDate}`} />
          <button
            onClick={handleSeedLoyalty}
            disabled={seeding}
            className="flex items-center gap-1.5 px-3 py-2 bg-pink-600/20 hover:bg-pink-600/30 text-pink-300 border border-pink-500/30 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 ${seeding ? 'animate-spin' : ''}`} />
            {seeding ? 'Seeding Data...' : 'Seed Sample Loyalty Data'}
          </button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Date Range</label>
            <select value={dateRange} onChange={e => setDateRange(e.target.value as DatePreset)} className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/20">
              <option value="Today">Today</option>
              <option value="Yesterday">Yesterday</option>
              <option value="Last 7 Days">Last 7 Days</option>
              <option value="Current Week">Current Week</option>
              <option value="Current Month">Current Month</option>
              <option value="Last Month">Last Month</option>
              <option value="Custom">Custom Range</option>
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
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-pink-500/10 to-pink-500/5 border-pink-500/20">
          <span className="text-[11px] font-medium text-pink-400 uppercase tracking-wider">Points Earned</span>
          <span className="text-2xl font-bold text-text-primary">{summary.pointsEarned.toLocaleString()}</span>
          <span className="text-[10px] text-text-muted">total points awarded</span>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
          <span className="text-[11px] font-medium text-purple-400 uppercase tracking-wider">Points Redeemed</span>
          <span className="text-2xl font-bold text-text-primary">{summary.pointsRedeemed.toLocaleString()}</span>
          <span className="text-[10px] text-text-muted">total points used</span>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <span className="text-[11px] font-medium text-blue-400 uppercase tracking-wider">Active Members</span>
          <span className="text-2xl font-bold text-text-primary">{summary.activeMembers}</span>
          <span className="text-[10px] text-text-muted">unique customers</span>
        </Card>
      </div>

      <Card padding={false}>
        <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30 flex items-center justify-between">
          <h3 className="font-semibold text-text-primary text-sm">Loyalty Transactions</h3>
          <span className="text-[10px] text-text-muted">{transactions.length} records</span>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border">
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">CUSTOMER</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">PHONE</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">TRANSACTION DETAILS</th>
                <th className="py-3 px-4 text-center font-semibold text-text-secondary">POINTS EARNED</th>
                <th className="py-3 px-4 text-center font-semibold text-text-secondary">POINTS REDEEMED</th>
                <th className="py-3 px-4 text-right font-semibold text-text-secondary">DATE & TIME</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {transactions.map((t: any, idx: number) => (
                <tr key={idx} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-3 px-4 font-semibold text-text-primary">{t.customer?.name || 'N/A'}</td>
                  <td className="py-3 px-4 text-text-secondary">{t.customer?.phone || '–'}</td>
                  <td className="py-3 px-4 text-text-secondary">{t.note || (t.points > 0 ? 'Points Earned on Order' : 'Points Redeemed on Order')}</td>
                  <td className="py-3 px-4 text-center text-emerald-400 font-semibold">
                    {Math.max(0, Number(t.points || 0)) > 0 ? `+${Math.max(0, Number(t.points || 0))}` : '—'}
                  </td>
                  <td className="py-3 px-4 text-center text-orange-400 font-semibold">
                    {Math.max(0, Math.abs(Math.min(0, Number(t.points || 0)))) > 0 ? `-${Math.max(0, Math.abs(Math.min(0, Number(t.points || 0))))}` : '—'}
                  </td>
                  <td className="py-3 px-4 text-right text-text-muted font-mono">
                    {new Date(t.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-text-muted italic">No loyalty transactions in this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}