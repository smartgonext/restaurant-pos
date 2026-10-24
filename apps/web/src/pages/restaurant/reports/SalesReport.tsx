import { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { TrendingUp, CreditCard, DollarSign, Percent, ChevronDown, ChevronUp, RefreshCcw } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { DatePreset, getDateRangeForPreset, toApiDateTimeRange } from '@/lib/dateRanges';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid, Legend
} from 'recharts';

export default function SalesReport() {
  const initial = getDateRangeForPreset('Today');
  const [dateRange, setDateRange] = useState<DatePreset>('Today');
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [chartPeriod, setChartPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [sortField, setSortField] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    if (dateRange === 'Custom') return;
    const next = getDateRangeForPreset(dateRange);
    setStartDate(next.startDate);
    setEndDate(next.endDate);
  }, [dateRange]);

  const { dateFrom, dateTo } = useMemo(() => {
    return toApiDateTimeRange(startDate, endDate);
  }, [startDate, endDate]);

  const { data: salesData, isLoading, refetch } = useQuery({
    queryKey: ['reports', 'sales', startDate, endDate, chartPeriod],
    queryFn: () => api.get('/restaurant/reports/sales', { params: { dateFrom, dateTo, period: chartPeriod } }).then(r => r.data.data)
  });

  const summary = salesData?.summary || { totalSales: 0, orderCount: 0, avgOrderValue: 0, taxTotal: 0 };
  const paymentBreakdown = salesData?.paymentBreakdown || {};
  const dailySales = (salesData?.dailySales || []).sort((a: any, b: any) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortField === 'name') return a.name.localeCompare(b.name) * dir;
    return ((Number(a[sortField]) || 0) - (Number(b[sortField]) || 0)) * dir;
  });
  const periodSales = salesData?.periodSales || [];

  const getPaymentAmount = (key: string) => {
    const entries = Object.entries(paymentBreakdown || {});
    const found = entries.find(([k]) => String(k).toLowerCase() === key.toLowerCase());
    return Number(found?.[1] || 0);
  };

  const charge_percent = summary.totalSales > 0 ? ((summary.taxTotal / summary.totalSales) * 100).toFixed(2) : '0.00';

  const paymentMethods = [
    { name: 'Cash', amount: getPaymentAmount('cash'), icon: '💵', color: 'text-green-400' },
    { name: 'Card', amount: getPaymentAmount('card'), icon: '💳', color: 'text-blue-400' },
    { name: 'UPI', amount: getPaymentAmount('upi'), icon: '📱', color: 'text-purple-400' },
    { name: 'Bank Transfer', amount: getPaymentAmount('bank transfer') + getPaymentAmount('bank'), icon: '🏦', color: 'text-cyan-400' }
  ].filter(pm => pm.amount > 0);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />;
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="flex flex-col items-center gap-3">
        <RefreshCcw className="w-6 h-6 animate-spin text-blue-400" />
        <span className="text-sm text-text-muted">Loading sales report...</span>
      </div>
    </div>
  );

  const exportData = dailySales.map((day: any) => ({
    Date: day.name,
    'Total Sales': day.sales,
    Orders: day.orders || 0,
    Cash: day.cash || 0,
    UPI: day.upi || 0,
    Card: day.card || 0,
    'Bank Transfer': day.bank || 0,
    'Tax (SGST)': day.sgst || 0,
    'Tax (CGST)': day.cgst || 0,
    Discount: day.discount || 0,
    Tip: day.tip || 0,
    Due: day.due || 0,
  }));

  const totals = dailySales.reduce((acc: any, day: any) => ({
    sales: acc.sales + (Number(day.sales) || 0),
    orders: acc.orders + (Number(day.orders) || 0),
    sgst: acc.sgst + (Number(day.sgst) || 0),
    cgst: acc.cgst + (Number(day.cgst) || 0),
    cash: acc.cash + (Number(day.cash) || 0),
    upi: acc.upi + (Number(day.upi) || 0),
    card: acc.card + (Number(day.card) || 0),
    bank: acc.bank + (Number(day.bank) || 0),
    due: acc.due + (Number(day.due) || 0),
    discount: acc.discount + (Number(day.discount) || 0),
    tip: acc.tip + (Number(day.tip) || 0),
  }), { sales: 0, orders: 0, sgst: 0, cgst: 0, cash: 0, upi: 0, card: 0, bank: 0, due: 0, discount: 0, tip: 0 });

  return (
    <div className="space-y-4 animate-in p-1">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Sales Report</h1>
          <p className="text-xs text-text-muted mt-1">
            Track your restaurant's earnings • {startDate} to {endDate}
          </p>
        </div>
        <ExportDropdown
          data={exportData}
          filename="sales-report"
          title="Sales Report"
          subtitle={`Date range: ${startDate} to ${endDate}`}
        />
      </div>

      {/* Date Range Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Date Range</label>
            <select 
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DatePreset)}
              className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/20"
            >
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
            <input 
              type="date"
              value={startDate}
              onChange={(e) => {
                setDateRange('Custom');
                setStartDate(e.target.value);
              }}
              className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">End Date</label>
            <input 
              type="date"
              value={endDate}
              onChange={(e) => {
                setDateRange('Custom');
                setEndDate(e.target.value);
              }}
              className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Chart Period</label>
            <select
              value={chartPeriod}
              onChange={(e) => setChartPeriod(e.target.value as any)}
              className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/20"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Top Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <p className="text-[11px] font-medium text-blue-400 uppercase tracking-wider">Total Sales</p>
          <p className="text-xl font-bold text-text-primary">{formatCurrency(summary.totalSales)}</p>
          <p className="text-[10px] text-text-muted">{summary.orderCount} orders</p>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <p className="text-[11px] font-medium text-green-400 uppercase tracking-wider">Cash Payments</p>
          <p className="text-lg font-bold text-text-primary">{formatCurrency(getPaymentAmount('cash'))}</p>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
          <p className="text-[11px] font-medium text-purple-400 uppercase tracking-wider">Card + UPI</p>
          <p className="text-lg font-bold text-text-primary">{formatCurrency(getPaymentAmount('card') + getPaymentAmount('upi'))}</p>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
          <p className="text-[11px] font-medium text-orange-400 uppercase tracking-wider">Avg Order Value</p>
          <p className="text-lg font-bold text-text-primary">{formatCurrency(summary.avgOrderValue)}</p>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20">
          <p className="text-[11px] font-medium text-red-400 uppercase tracking-wider">Tax Collected</p>
          <p className="text-lg font-bold text-text-primary">{formatCurrency(summary.taxTotal)}</p>
          <p className="text-[10px] text-red-400">{charge_percent}% rate</p>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-teal-500/10 to-teal-500/5 border-teal-500/20">
          <p className="text-[11px] font-medium text-teal-400 uppercase tracking-wider">Days w/ Sales</p>
          <p className="text-lg font-bold text-text-primary">{dailySales.filter((d: any) => d.sales > 0).length}</p>
        </Card>
      </div>

      {/* Main Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sales Trend Chart */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-text-primary text-sm">Sales Trend ({chartPeriod})</h3>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={periodSales.length > 0 ? periodSales : dailySales} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} width={50} />
                <Tooltip contentStyle={{ backgroundColor: '#0d1526', borderColor: '#1e3a5f', borderRadius: 8, fontSize: 11 }} formatter={(value: any) => [formatCurrency(value), 'Revenue']} />
                <Area type="monotone" dataKey={periodSales.length > 0 ? "sales" : "sales"} stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Payment Methods */}
        <Card>
          <h3 className="font-semibold text-text-primary text-sm mb-4">Payment Methods</h3>
          <div className="space-y-4">
            {paymentMethods.length > 0 ? paymentMethods.map((pm, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-bg-tertiary/30 border border-border/50">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{pm.icon}</span>
                  <span className="text-sm font-medium text-text-secondary">{pm.name}</span>
                </div>
                <span className="text-sm font-semibold text-text-primary">{formatCurrency(pm.amount)}</span>
              </div>
            )) : (
              <div className="text-center py-8 text-text-muted text-sm">No payment data</div>
            )}
            <div className="pt-2 border-t border-border/50">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-text-primary">
                <span>Total</span>
                <span>{formatCurrency(summary.totalSales)}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Detailed Sales Table */}
      <Card padding={false}>
        <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30 flex items-center justify-between">
          <h3 className="font-semibold text-text-primary text-sm">Daily Sales Details</h3>
          <span className="text-[10px] text-text-muted">{dailySales.length} records</span>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border">
                {['Date', 'Orders', 'SGST', 'CGST', 'Total Tax', 'Cash', 'UPI', 'Card', 'Bank', 'Due', 'Discount', 'Tip', 'Total'].map((h, i) => (
                  <th
                    key={i}
                    onClick={() => handleSort(i === 0 ? 'name' : h.toLowerCase().replace(/\s+/g, '').replace('tax', 'sgst'))}
                    className={`py-3 px-3 text-left font-semibold text-text-secondary cursor-pointer hover:text-text-primary transition-colors ${i >= 5 ? 'text-center' : ''} ${i === 12 ? 'text-right' : ''}`}
                  >
                    {h} <SortIcon field={i === 0 ? 'name' : h.toLowerCase().replace(/\s+/g, '').replace('tax', 'sgst')} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {dailySales.map((day: any, idx: number) => (
                <tr key={idx} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-2.5 px-3 font-medium text-text-primary">{day.name}</td>
                  <td className="py-2.5 px-3 text-text-secondary">{day.orders || 0}</td>
                  <td className="py-2.5 px-3 text-text-secondary">{formatCurrency(day.sgst || 0)}</td>
                  <td className="py-2.5 px-3 text-text-secondary">{formatCurrency(day.cgst || 0)}</td>
                  <td className="py-2.5 px-3 font-semibold text-text-primary">{formatCurrency((day.sgst || 0) + (day.cgst || 0))}</td>
                  <td className="py-2.5 px-3 text-center text-success">{formatCurrency(day.cash || 0)}</td>
                  <td className="py-2.5 px-3 text-center text-purple-400">{formatCurrency(day.upi || 0)}</td>
                  <td className="py-2.5 px-3 text-center text-blue-400">{formatCurrency(day.card || 0)}</td>
                  <td className="py-2.5 px-3 text-center text-cyan-400">{formatCurrency(day.bank || 0)}</td>
                  <td className="py-2.5 px-3 text-center text-orange-400">{formatCurrency(day.due || 0)}</td>
                  <td className="py-2.5 px-3 text-rose-400">{formatCurrency(day.discount || 0)}</td>
                  <td className="py-2.5 px-3 text-emerald-400">{formatCurrency(day.tip || 0)}</td>
                  <td className="py-2.5 px-3 text-right font-bold text-text-primary">{formatCurrency(day.sales)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-bg-tertiary/40 border-t-2 border-border font-bold">
                <td className="py-3 px-3 text-text-primary">TOTAL</td>
                <td className="py-3 px-3 text-text-primary">{totals.orders}</td>
                <td className="py-3 px-3 text-text-primary">{formatCurrency(totals.sgst)}</td>
                <td className="py-3 px-3 text-text-primary">{formatCurrency(totals.cgst)}</td>
                <td className="py-3 px-3 text-text-primary">{formatCurrency(totals.sgst + totals.cgst)}</td>
                <td className="py-3 px-3 text-center text-success">{formatCurrency(totals.cash)}</td>
                <td className="py-3 px-3 text-center text-purple-400">{formatCurrency(totals.upi)}</td>
                <td className="py-3 px-3 text-center text-blue-400">{formatCurrency(totals.card)}</td>
                <td className="py-3 px-3 text-center text-cyan-400">{formatCurrency(totals.bank)}</td>
                <td className="py-3 px-3 text-center text-orange-400">{formatCurrency(totals.due)}</td>
                <td className="py-3 px-3 text-rose-400">{formatCurrency(totals.discount)}</td>
                <td className="py-3 px-3 text-emerald-400">{formatCurrency(totals.tip)}</td>
                <td className="py-3 px-3 text-right text-lg text-text-primary">{formatCurrency(totals.sales)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}