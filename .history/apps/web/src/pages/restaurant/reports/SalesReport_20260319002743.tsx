import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Download, TrendingUp, CreditCard, DollarSign, Percent } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar
} from 'recharts';

export default function SalesReport() {
  const [dateRange, setDateRange] = useState('Current Week');
  const [startDate, setStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const { dateFrom, dateTo } = useMemo(() => {
    return { dateFrom: new Date(startDate).toISOString(), dateTo: new Date(endDate).toISOString() };
  }, [startDate, endDate]);

  const { data: salesData, isLoading } = useQuery({
    queryKey: ['reports', 'sales', startDate, endDate],
    queryFn: () => api.get('/restaurant/reports/sales', { params: { dateFrom, dateTo } }).then(r => r.data.data)
  });

  const summary = salesData?.summary || { totalSales: 0, orderCount: 0, avgOrderValue: 0, taxTotal: 0 };
  const paymentBreakdown = salesData?.paymentBreakdown || {};
  const dailySales = salesData?.dailySales || [];

  // Calculate additional metrics
  const charge_percent = ((summary.taxTotal / summary.totalSales) * 100).toFixed(2);
  const outstandingPayments = summary.totalSales * 0.05; // Placeholder
  const discountAmount = 0; // Would come from backend
  const tipAmount = 0; // Would come from backend

  // Prepare payment methods data
  const paymentMethods = [
    { name: 'Cash', amount: paymentBreakdown.Cash || 0, icon: '💵' },
    { name: 'Card', amount: paymentBreakdown.Card || 0, icon: '💳' },
    { name: 'UPI', amount: paymentBreakdown.UPI || 0, icon: '📱' },
    { name: 'Bank Transfer', amount: paymentBreakdown['Bank Transfer'] || 0, icon: '🏦' }
  ].filter(pm => pm.amount > 0);

  const handleExport = () => {
    alert('Export functionality would generate CSV/PDF');
  };

  if (isLoading) return <div className="flex items-center justify-center h-screen text-text-muted">Loading sales report...</div>;

  return (
    <div className="space-y-4 animate-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Sales Report</h1>
          <p className="text-xs text-text-muted mt-1">Check and track your restaurant's earnings (Sales Data From {startDate} To {endDate}, Time Period Each Day 12:00 AM - 11:59 PM)</p>
        </div>
      </div>

      {/* Date Range Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Date Range</label>
            <select 
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/20"
            >
              <option>Current Week</option>
              <option>Last Week</option>
              <option>Current Month</option>
              <option>Last Month</option>
              <option>Custom</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Start Date</label>
            <input 
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">End Date</label>
            <input 
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/20"
            />
          </div>
          <Button size="sm" icon={<Download className="w-4 h-4" />} onClick={handleExport}>Export</Button>
        </div>
      </Card>

      {/* Top Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <p className="text-[11px] font-medium text-blue-400 uppercase tracking-wider">Total Sales</p>
          <p className="text-xl font-bold text-text-primary">{formatCurrency(summary.totalSales)}</p>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <p className="text-[11px] font-medium text-green-400 uppercase tracking-wider">Traditional Payments</p>
          <p className="text-lg font-bold text-text-primary">{formatCurrency(paymentBreakdown.Cash || 0)}</p>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 border-cyan-500/20">
          <p className="text-[11px] font-medium text-cyan-400 uppercase tracking-wider">Payment Gateways</p>
          <p className="text-lg font-bold text-text-primary">{formatCurrency((paymentBreakdown.Card || 0) + (paymentBreakdown.UPI || 0))}</p>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20">
          <p className="text-[11px] font-medium text-red-400 uppercase tracking-wider">Additional Amounts</p>
          <p className="text-lg font-bold text-text-primary">{formatCurrency(discountAmount + tipAmount)}</p>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
          <p className="text-[11px] font-medium text-purple-400 uppercase tracking-wider">Total Charges</p>
          <p className="text-lg font-bold text-text-primary">{formatCurrency(summary.taxTotal)}</p>
          <p className="text-[10px] text-purple-400">{charge_percent}%</p>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
          <p className="text-[11px] font-medium text-orange-400 uppercase tracking-wider">Outstanding Payments</p>
          <p className="text-lg font-bold text-text-primary">{formatCurrency(outstandingPayments)}</p>
        </Card>
      </div>

      {/* Main Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sales Chart - 2 cols */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-text-primary text-sm">Daily Sales Trend</h3>
          </div>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailySales} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#0d1526', borderColor: '#1e3a5f', borderRadius: 8, fontSize: 11 }} />
                <Area type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Payment Methods */}
        <Card>
          <h3 className="font-semibold text-text-primary text-sm mb-4">Payment Methods</h3>
          <div className="space-y-3">
            {paymentMethods.map((pm, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{pm.icon}</span>
                  <span className="text-sm font-medium text-text-secondary">{pm.name}</span>
                </div>
                <span className="text-sm font-semibold text-text-primary">{formatCurrency(pm.amount)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Detailed Sales Table */}
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border">
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">DATE</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">TOTAL ORDERS</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">SGST (2.50%)</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">CGST (2.50%)</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">TOTAL TAX AMOUNT</th>
                <th className="py-3 px-4 text-center font-semibold text-text-secondary">CASH</th>
                <th className="py-3 px-4 text-center font-semibold text-text-secondary">UPI</th>
                <th className="py-3 px-4 text-center font-semibold text-text-secondary">CARD</th>
                <th className="py-3 px-4 text-center font-semibold text-text-secondary">BANK TRANSFER</th>
                <th className="py-3 px-4 text-center font-semibold text-text-secondary">DUE</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">DISCOUNT</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">TIP</th>
                <th className="py-3 px-4 text-right font-semibold text-text-secondary">TOTAL (EXCLUDING TIP)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {dailySales.map((day: any, idx: number) => (
                <tr key={idx} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-3 px-4 font-medium text-text-primary">{day.name}</td>
                  <td className="py-3 px-4 text-text-secondary">2</td>
                  <td className="py-3 px-4 text-text-secondary">$41.00</td>
                  <td className="py-3 px-4 text-text-secondary">$41.00</td>
                  <td className="py-3 px-4 font-semibold text-text-primary">$82.00</td>
                  <td className="py-3 px-4 text-center text-success">$0.00</td>
                  <td className="py-3 px-4 text-center">$903.00</td>
                  <td className="py-3 px-4 text-center">$819.00</td>
                  <td className="py-3 px-4 text-center">$0.00</td>
                  <td className="py-3 px-4 text-center">$0.00</td>
                  <td className="py-3 px-4">$0.00</td>
                  <td className="py-3 px-4">$0.00</td>
                  <td className="py-3 px-4 text-right font-semibold">{formatCurrency(day.sales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
