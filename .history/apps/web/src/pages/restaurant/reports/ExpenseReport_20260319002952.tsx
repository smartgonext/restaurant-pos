import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Download, DollarSign } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip, Legend
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899'];

export default function ExpenseReport() {
  const [activeTab, setActiveTab] = useState('outstanding');

  const { data: expensesRes } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => api.get('/restaurant/expenses').then(r => r.data.data)
  });

  const { data: categoriesRes } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => api.get('/restaurant/expense-categories').then(r => r.data.data)
  });

  const expenses = Array.isArray(expensesRes) ? expensesRes : [];
  const categories = Array.isArray(categoriesRes) ? categoriesRes : [];

  // Calculate metrics
  const totalExpenses = expenses.reduce((sum: number, e: any) => sum + Number(e.amount), 0);
  const outstandingPayments = expenses
    .filter((e: any) => e.paymentStatus === 'pending')
    .reduce((sum: number, e: any) => sum + Number(e.amount), 0);
  const paidExpenses = expenses
    .filter((e: any) => e.paymentStatus === 'paid')
    .reduce((sum: number, e: any) => sum + Number(e.amount), 0);

  // Group expenses by category
  const expenseByCategory: Record<string, number> = {};
  expenses.forEach((e: any) => {
    const catName = e.category?.name || 'Uncategorized';
    expenseByCategory[catName] = (expenseByCategory[catName] || 0) + Number(e.amount);
  });

  const categoryChartData = Object.entries(expenseByCategory).map(([name, value]) => ({ name, value }));

  // Group expenses by date
  const expenseByDate: Record<string, number> = {};
  expenses.forEach((e: any) => {
    const date = new Date(e.expenseDate).toISOString().split('T')[0];
    expenseByDate[date] = (expenseByDate[date] || 0) + Number(e.amount);
  });

  const dateChartData = Object.entries(expenseByDate).map(([date, amount]) => ({
    name: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    amount
  }));

  const handleExport = () => {
    alert('Export functionality would generate CSV/PDF with expense breakdown');
  };

  return (
    <div className="space-y-4 animate-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Expense Reports</h1>
          <p className="text-xs text-text-muted mt-1">Track and analyze your restaurant's operating expenses</p>
        </div>
        <Button size="sm" icon={<Download className="w-4 h-4" />} onClick={handleExport}>Export</Button>
      </div>

      {/* Tabs */}
      <Card className="p-2 flex gap-2">
        <button
          onClick={() => setActiveTab('outstanding')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'outstanding'
              ? 'bg-primary text-white'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Outstanding Payment Report
        </button>
        <button
          onClick={() => setActiveTab('summary')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'summary'
              ? 'bg-primary text-white'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Expense Summary Report
        </button>
      </Card>

      {activeTab === 'outstanding' ? (
        <>
          {/* Outstanding Payments View */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
              <p className="text-[11px] font-medium text-purple-400 uppercase tracking-wider">Total Outstanding</p>
              <p className="text-2xl font-bold text-text-primary">{formatCurrency(outstandingPayments)}</p>
              <p className="text-xs text-text-muted mt-2">{expenses.filter((e: any) => e.paymentStatus === 'pending').length} Pending</p>
            </Card>
            <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
              <p className="text-[11px] font-medium text-green-400 uppercase tracking-wider">Total Paid Expenses</p>
              <p className="text-2xl font-bold text-text-primary">{formatCurrency(paidExpenses)}</p>
            </Card>
            <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
              <p className="text-[11px] font-medium text-orange-400 uppercase tracking-wider">Total Expenses</p>
              <p className="text-2xl font-bold text-text-primary">{formatCurrency(totalExpenses)}</p>
            </Card>
          </div>

          {/* Outstanding Expenses Table */}
          <Card padding={false}>
            <div className="p-4 border-b border-border/50">
              <h3 className="font-semibold text-text-primary">Outstanding Expenses</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-bg-tertiary/30 border-b border-border">
                    <th className="py-3 px-4 text-left font-semibold text-text-secondary">PAYMENT DUE</th>
                    <th className="py-3 px-4 text-left font-semibold text-text-secondary">DUE DATE</th>
                    <th className="py-3 px-4 text-left font-semibold text-text-secondary">PAYMENT STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {expenses.filter((e: any) => e.paymentStatus === 'pending').length > 0 ? (
                    expenses.filter((e: any) => e.paymentStatus === 'pending').map((exp: any, idx: number) => (
                      <tr key={idx} className="hover:bg-bg-hover/30 transition-colors">
                        <td className="py-3 px-4 font-medium text-text-primary">-</td>
                        <td className="py-3 px-4 text-text-secondary">-</td>
                        <td className="py-3 px-4">
                          <Badge variant="warning" size="sm" className="capitalize">pending</Badge>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-text-muted">No outstanding payments found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <>
          {/* Expense Summary View */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
              <p className="text-[11px] font-medium text-blue-400 uppercase tracking-wider">Total Expenses</p>
              <p className="text-2xl font-bold text-text-primary">{formatCurrency(totalExpenses)}</p>
            </Card>
            <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
              <p className="text-[11px] font-medium text-green-400 uppercase tracking-wider">Paid Expenses</p>
              <p className="text-2xl font-bold text-text-primary">{formatCurrency(paidExpenses)}</p>
            </Card>
            <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-warning-500/10 to-warning-500/5 border-warning-500/20">
              <p className="text-[11px] font-medium text-warning-400 uppercase tracking-wider">Pending Amount</p>
              <p className="text-2xl font-bold text-text-primary">{formatCurrency(outstandingPayments)}</p>
            </Card>
          </div>

          {/* Category and Date Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Expenses by Category */}
            <Card>
              <h3 className="font-semibold text-text-primary text-sm mb-4">Expenses by Category</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryChartData}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {categoryChartData.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0d1526', borderColor: '#1e3a5f', borderRadius: 8, fontSize: 11 }}
                      formatter={(value: any) => formatCurrency(value)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Expenses Over Time */}
            <Card>
              <h3 className="font-semibold text-text-primary text-sm mb-4">Daily Expenses Trend</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dateChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0d1526', borderColor: '#1e3a5f', borderRadius: 8, fontSize: 11 }}
                      formatter={(value: any) => formatCurrency(value)}
                    />
                    <Bar dataKey="amount" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Category Breakdown Table */}
          <Card padding={false}>
            <div className="p-4 border-b border-border/50">
              <h3 className="font-semibold text-text-primary">Expenses by Category</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-bg-tertiary/30 border-b border-border">
                    <th className="py-3 px-4 text-left font-semibold text-text-secondary">Category</th>
                    <th className="py-3 px-4 text-right font-semibold text-text-secondary">Count</th>
                    <th className="py-3 px-4 text-right font-semibold text-text-secondary">Total Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {categoryChartData.map((cat: any, idx: number) => (
                    <tr key={idx} className="hover:bg-bg-hover/30 transition-colors">
                      <td className="py-3 px-4 font-medium text-text-primary">{cat.name}</td>
                      <td className="py-3 px-4 text-right text-text-secondary">
                        {expenses.filter((e: any) => (e.category?.name || 'Uncategorized') === cat.name).length}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-text-primary">{formatCurrency(cat.value)}</td>
                    </tr>
                  ))}
                  <tr className="bg-bg-tertiary/30 border-t-2 border-border">
                    <td className="py-3 px-4 font-semibold text-text-primary">Total</td>
                    <td className="py-3 px-4 text-right font-semibold text-text-primary">{expenses.length}</td>
                    <td className="py-3 px-4 text-right font-bold text-text-primary text-sm">{formatCurrency(totalExpenses)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
