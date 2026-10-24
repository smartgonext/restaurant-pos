import { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { RefreshCcw } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { DatePreset, getDateRangeForPreset, toApiDateTimeRange } from '@/lib/dateRanges';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];

export default function ExpenseReport() {
  const [activeTab, setActiveTab] = useState<'outstanding' | 'summary'>('summary');
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
    queryKey: ['reports', 'expenses', startDate, endDate],
    queryFn: () => api.get('/restaurant/reports/expenses', { params: { dateFrom, dateTo } }).then(r => r.data.data)
  });

  const expenses = Array.isArray(reportData?.expenses) ? reportData.expenses : [];
  const categories = Array.isArray(reportData?.byCategory) ? reportData.byCategory : [];

  const totalExpenses = Number(reportData?.summary?.totalExpenses || 0);
  const outstandingPayments = Number(reportData?.summary?.pendingExpenses || 0);
  const paidExpenses = Number(reportData?.summary?.paidExpenses || 0);

  const categoryChartData = categories.map((c: any) => ({
    name: c.name,
    value: Number(c.amount || 0),
  }));

  const expenseByDate: Record<string, number> = {};
  expenses.forEach((e: any) => {
    const date = new Date(e.expenseDate).toISOString().split('T')[0];
    expenseByDate[date] = (expenseByDate[date] || 0) + Number(e.amount);
  });

  const dateChartData = Object.entries(expenseByDate)
    .map(([date, amount]) => ({
      name: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      amount
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const exportRows = expenses.map((e: any) => ({
    Title: e.title,
    Category: e.category?.name || 'Uncategorized',
    Amount: formatCurrency(e.amount),
    'Payment Status': e.paymentStatus,
    'Payment Method': e.paymentMethod || '—',
    'Expense Date': e.expenseDate ? new Date(e.expenseDate).toLocaleDateString() : '—',
    'Due Date': e.dueDate ? new Date(e.dueDate).toLocaleDateString() : '—',
  }));

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <RefreshCcw className="w-6 h-6 animate-spin text-red-400" />
        <span className="text-sm text-text-muted">Loading expense report...</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 animate-in p-1">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Expense Reports</h1>
          <p className="text-xs text-text-muted mt-1">Track and analyze your restaurant's operating expenses</p>
        </div>
        <ExportDropdown data={exportRows} filename="expense-report" title="Expense Report" subtitle={`${startDate} to ${endDate}`} />
      </div>

      {/* Filters */}
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

      {/* Tabs */}
      <Card className="p-2 flex gap-2">
        {(['summary', 'outstanding'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/50'
            }`}
          >
            {tab === 'summary' ? 'Expense Summary' : 'Outstanding Payments'}
          </button>
        ))}
      </Card>

      {activeTab === 'outstanding' ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
              <p className="text-[11px] font-medium text-purple-400 uppercase tracking-wider">Total Outstanding</p>
              <p className="text-2xl font-bold text-text-primary">{formatCurrency(outstandingPayments)}</p>
              <p className="text-xs text-text-muted mt-2">{expenses.filter((e: any) => e.paymentStatus === 'pending').length} Pending</p>
            </Card>
            <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
              <p className="text-[11px] font-medium text-green-400 uppercase tracking-wider">Total Paid</p>
              <p className="text-2xl font-bold text-text-primary">{formatCurrency(paidExpenses)}</p>
            </Card>
            <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
              <p className="text-[11px] font-medium text-orange-400 uppercase tracking-wider">Total Expenses</p>
              <p className="text-2xl font-bold text-text-primary">{formatCurrency(totalExpenses)}</p>
            </Card>
          </div>

          <Card padding={false}>
            <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30">
              <h3 className="font-semibold text-text-primary">Pending Expenses</h3>
            </div>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-bg-tertiary/30 border-b border-border">
                    <th className="py-3 px-4 text-left font-semibold text-text-secondary">TITLE</th>
                    <th className="py-3 px-4 text-left font-semibold text-text-secondary">CATEGORY</th>
                    <th className="py-3 px-4 text-left font-semibold text-text-secondary">AMOUNT</th>
                    <th className="py-3 px-4 text-left font-semibold text-text-secondary">DUE DATE</th>
                    <th className="py-3 px-4 text-left font-semibold text-text-secondary">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {expenses.filter((e: any) => e.paymentStatus === 'pending').length > 0 ? (
                    expenses.filter((e: any) => e.paymentStatus === 'pending').map((exp: any, idx: number) => (
                      <tr key={idx} className="hover:bg-bg-hover/30 transition-colors">
                        <td className="py-3 px-4 font-medium text-text-primary">{exp.title || '—'}</td>
                        <td className="py-3 px-4 text-text-secondary">{exp.category?.name || '—'}</td>
                        <td className="py-3 px-4 font-semibold text-text-primary">{formatCurrency(exp.amount)}</td>
                        <td className="py-3 px-4 text-text-secondary">{exp.dueDate ? new Date(exp.dueDate).toLocaleDateString() : '—'}</td>
                        <td className="py-3 px-4">
                          <Badge variant="warning" size="sm" className="capitalize">pending</Badge>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-text-muted">No outstanding payments found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
              <p className="text-[11px] font-medium text-blue-400 uppercase tracking-wider">Total Expenses</p>
              <p className="text-2xl font-bold text-text-primary">{formatCurrency(totalExpenses)}</p>
              <p className="text-[10px] text-text-muted">{expenses.length} expenses</p>
            </Card>
            <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
              <p className="text-[11px] font-medium text-green-400 uppercase tracking-wider">Paid</p>
              <p className="text-2xl font-bold text-text-primary">{formatCurrency(paidExpenses)}</p>
            </Card>
            <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-warning-500/10 to-warning-500/5 border-warning-500/20">
              <p className="text-[11px] font-medium text-yellow-400 uppercase tracking-wider">Pending</p>
              <p className="text-2xl font-bold text-text-primary">{formatCurrency(outstandingPayments)}</p>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <h3 className="font-semibold text-text-primary text-sm mb-4">Expenses by Category</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryChartData}
                      cx="50%" cy="50%"
                      outerRadius={100}
                      innerRadius={40}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {categoryChartData.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#0d1526', borderColor: '#1e3a5f', borderRadius: 8, fontSize: 11 }} formatter={(value: any) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <h3 className="font-semibold text-text-primary text-sm mb-4">Daily Expenses Trend</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dateChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#0d1526', borderColor: '#1e3a5f', borderRadius: 8, fontSize: 11 }} formatter={(value: any) => formatCurrency(value)} />
                    <Bar dataKey="amount" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Category Table */}
          <Card padding={false}>
            <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30 flex items-center justify-between">
              <h3 className="font-semibold text-text-primary">Expenses by Category</h3>
              <span className="text-[10px] text-text-muted">{categoryChartData.length} categories</span>
            </div>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-bg-tertiary/30 border-b border-border">
                    <th className="py-3 px-4 text-left font-semibold text-text-secondary">Category</th>
                    <th className="py-3 px-4 text-center font-semibold text-text-secondary">Count</th>
                    <th className="py-3 px-4 text-right font-semibold text-text-secondary">Total Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {categoryChartData.map((cat: any, idx: number) => (
                    <tr key={idx} className="hover:bg-bg-hover/30 transition-colors">
                      <td className="py-3 px-4 font-medium text-text-primary">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                          {cat.name}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center text-text-secondary">
                        {expenses.filter((e: any) => (e.category?.name || 'Uncategorized') === cat.name).length}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-text-primary">{formatCurrency(cat.value)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-bg-tertiary/40 border-t-2 border-border font-bold">
                    <td className="py-3 px-4 text-text-primary">Total</td>
                    <td className="py-3 px-4 text-center text-text-primary">{expenses.length}</td>
                    <td className="py-3 px-4 text-right text-lg text-text-primary">{formatCurrency(totalExpenses)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}