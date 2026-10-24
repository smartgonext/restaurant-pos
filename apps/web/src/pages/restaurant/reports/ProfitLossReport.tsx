import { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { TrendingUp, TrendingDown, DollarSign, RefreshCcw } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { DatePreset, getDateRangeForPreset, toApiDateTimeRange } from '@/lib/dateRanges';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';

export default function ProfitLossReport() {
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
    queryKey: ['reports', 'profit-loss', startDate, endDate],
    queryFn: () => api.get('/restaurant/reports/profit-loss', { params: { dateFrom, dateTo } }).then(r => r.data.data),
  });

  const { data: expData } = useQuery({
    queryKey: ['reports', 'expenses-pl', startDate, endDate],
    queryFn: () => api.get('/restaurant/reports/expenses', { params: { dateFrom, dateTo } }).then(r => r.data.data),
  });

  const totalSales = data?.totalSales || 0;
  const totalExpenses = data?.totalExpenses || 0;
  const profit = data?.profit || 0;
  const isProfit = profit >= 0;

  const byCategory: any[] = expData?.byCategory || [];

  const chartData = [
    { name: 'Revenue', value: totalSales, fill: '#10b981' },
    { name: 'Expenses', value: totalExpenses, fill: '#ef4444' },
    { name: isProfit ? 'Profit' : 'Loss', value: Math.abs(profit), fill: isProfit ? '#3b82f6' : '#f59e0b' },
  ];

  const exportData = [
    { Metric: 'Total Revenue', Amount: totalSales },
    { Metric: 'Total Expenses', Amount: totalExpenses },
    { Metric: isProfit ? 'Net Profit' : 'Net Loss', Amount: profit },
    { Metric: 'Profit Margin %', Amount: totalSales > 0 ? ((profit / totalSales) * 100).toFixed(2) + '%' : '0%' },
  ];

  if (isLoading) return <div className="flex items-center justify-center h-64"><RefreshCcw className="w-6 h-6 animate-spin text-green-400" /></div>;

  const profitMargin = totalSales > 0 ? (profit / totalSales) * 100 : 0;

  return (
    <div className="space-y-4 animate-in p-1">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Profit & Loss Report</h1>
          <p className="text-xs text-text-muted mt-1">Revenue vs expenses analysis • {startDate} to {endDate}</p>
        </div>
        <ExportDropdown data={exportData} filename="profit-loss-report" title="Profit & Loss Report" subtitle={`${startDate} to ${endDate}`} />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Date Range</label>
            <select value={dateRange} onChange={e => setDateRange(e.target.value as DatePreset)} className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none">
              {['Today','Last 7 Days','Current Month','Current Week','Custom'].map(o => <option key={o}>{o}</option>)}
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

      {/* P&L Summary Banner */}
      <Card className={`p-6 bg-gradient-to-br ${isProfit ? 'from-green-500/15 to-emerald-500/5 border-green-500/30' : 'from-red-500/15 to-orange-500/5 border-red-500/30'}`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {isProfit ? <TrendingUp className="w-10 h-10 text-green-400" /> : <TrendingDown className="w-10 h-10 text-red-400" />}
            <div>
              <p className={`text-sm font-medium ${isProfit ? 'text-green-400' : 'text-red-400'}`}>{isProfit ? 'NET PROFIT' : 'NET LOSS'}</p>
              <p className={`text-4xl font-black ${isProfit ? 'text-green-300' : 'text-red-300'}`}>{formatCurrency(Math.abs(profit))}</p>
              <p className="text-xs text-text-muted mt-1">Profit Margin: <span className={`font-semibold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>{profitMargin.toFixed(1)}%</span></p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-right">
              <p className="text-xs text-text-muted">Total Revenue</p>
              <p className="text-xl font-bold text-green-400">{formatCurrency(totalSales)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-text-muted">Total Expenses</p>
              <p className="text-xl font-bold text-red-400">{formatCurrency(totalExpenses)}</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bar Chart */}
        <Card>
          <h3 className="font-semibold text-text-primary text-sm mb-4">Revenue vs Expenses vs {isProfit ? 'Profit' : 'Loss'}</h3>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip formatter={(v: any) => formatCurrency(v)} contentStyle={{ backgroundColor: '#0d1526', borderColor: '#1e3a5f', borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="value" radius={[6,6,0,0]}>
                  {chartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Expense by Category */}
        <Card>
          <h3 className="font-semibold text-text-primary text-sm mb-4">Expense Breakdown by Category</h3>
          {byCategory.length > 0 ? (
            <div className="space-y-2.5 max-h-[220px] overflow-y-auto">
              {byCategory.sort((a: any, b: any) => b.amount - a.amount).map((cat: any, i: number) => {
                const pct = totalExpenses > 0 ? (cat.amount / totalExpenses) * 100 : 0;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-text-secondary font-medium">{cat.name}</span>
                      <span className="text-text-primary font-bold">{formatCurrency(cat.amount)} <span className="text-text-muted">({pct.toFixed(1)}%)</span></span>
                    </div>
                    <div className="w-full bg-bg-tertiary rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-gradient-to-r from-red-500 to-orange-400" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-text-muted text-sm">No expense data for this period</div>
          )}
        </Card>
      </div>

      {/* P&L Statement Table */}
      <Card padding={false}>
        <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30">
          <h3 className="font-semibold text-text-primary text-sm flex items-center gap-2"><DollarSign className="w-4 h-4 text-green-400" />Profit & Loss Statement</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {[
                { label: 'Gross Revenue (Sales)', value: totalSales, bold: true, color: 'text-green-400', bg: 'bg-green-500/5' },
                { label: 'Less: Total Operating Expenses', value: -totalExpenses, bold: false, color: 'text-red-400', bg: '' },
                { label: '', value: null, bold: false, color: '', bg: 'bg-border/20', divider: true },
                { label: isProfit ? 'NET PROFIT' : 'NET LOSS', value: profit, bold: true, color: isProfit ? 'text-green-300' : 'text-red-300', bg: isProfit ? 'bg-green-500/10' : 'bg-red-500/10' },
                { label: 'Profit Margin', value: null, display: `${profitMargin.toFixed(2)}%`, bold: false, color: isProfit ? 'text-green-400' : 'text-red-400', bg: '' },
              ].map((row: any, i) => row.divider ? (
                <tr key={i}><td colSpan={2} className="py-px bg-border/30" /></tr>
              ) : (
                <tr key={i} className={row.bg}>
                  <td className={`py-3.5 px-6 ${row.bold ? 'font-bold' : 'font-medium'} text-text-secondary`}>{row.label}</td>
                  <td className={`py-3.5 px-6 text-right ${row.bold ? 'text-lg font-black' : 'font-semibold'} ${row.color}`}>
                    {row.display || (row.value !== null ? formatCurrency(Math.abs(row.value)) : '')}
                    {row.value !== null && row.value < 0 && !row.bold && <span className="text-text-muted text-xs ml-1">(deducted)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
