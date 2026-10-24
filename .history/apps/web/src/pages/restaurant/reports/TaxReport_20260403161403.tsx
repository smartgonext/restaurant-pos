import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { formatCurrency } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line
} from 'recharts';

export default function TaxReport() {
  const [dateRange, setDateRange] = useState('Today');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const { dateFrom, dateTo } = useMemo(() => {
    return { dateFrom: new Date(startDate).toISOString(), dateTo: new Date(endDate).toISOString() };
  }, [startDate, endDate]);

  const { data: taxData, isLoading } = useQuery({
    queryKey: ['reports', 'tax', startDate, endDate],
    queryFn: () => api.get('/restaurant/reports/tax', { params: { dateFrom, dateTo } }).then(r => r.data.data)
  });

  const summary = taxData?.summary || { totalSales: 0, totalTax: 0, sgstTotal: 0, cgstTotal: 0, orderCount: 0, effectiveTaxRate: 0, sgstRate: 2.5, cgstRate: 2.5 };
  const dailyBreakdown = taxData?.dailyBreakdown || [];

  const sgstTotal = Number(summary.sgstTotal || 0);
  const cgstTotal = Number(summary.cgstTotal || 0);
  const sgstRate = Number(summary.sgstRate ?? 2.5);
  const cgstRate = Number(summary.cgstRate ?? 2.5);
  const effectiveTaxRate = Number(summary.effectiveTaxRate ?? (sgstRate + cgstRate));

  // Prepare daily tax data (use server-provided breakdown)
  const dailyTaxData = (dailyBreakdown || []).map((day: any) => ({
    name: day.name,
    sales: Number(day.sales || 0),
    sgst: Number(day.sgst || 0),
    cgst: Number(day.cgst || 0),
    total: Number(day.total || 0),
  }));

  // Tax types data
  const taxTypes = [
    { name: 'SGST', rate: '2.50%', amount: sgstTotal, color: '#3b82f6' },
    { name: 'CGST', rate: '2.50%', amount: cgstTotal, color: '#10b981' }
  ];

  const exportRows = dailyTaxData.map((day: any) => ({
    Date: day.name,
    'Sales Amount': day.sales,
    'SGST (2.5%)': day.sgst,
    'CGST (2.5%)': day.cgst,
    'Total Tax': day.total,
  }));

  if (isLoading) return <div className="flex items-center justify-center h-screen text-text-muted">Loading tax report...</div>;

  return (
    <div className="space-y-4 animate-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Tax Report</h1>
          <p className="text-xs text-text-muted mt-1">(Sales Data For {startDate}, Time Period 12:00 AM - 11:59 PM)</p>
        </div>
      </div>

      {/* Date Range Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Select Date Range</label>
            <select 
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/20"
            >
              <option>Today</option>
              <option>This Week</option>
              <option>This Month</option>
              <option>Last Month</option>
              <option>This Year</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">From Date</label>
            <input 
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">To Date</label>
            <input 
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/20"
            />
          </div>
          <ExportDropdown data={exportRows} filename="tax-report" title="Tax Report" subtitle={`${startDate} to ${endDate}`} />
        </div>
      </Card>

      {/* Today's Tax Summary */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs font-medium text-blue-400 uppercase tracking-wider mb-2">Today's Tax Summary</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <p className="text-xs text-text-secondary">Today's Tax Collection</p>
                <p className="text-lg font-bold text-text-primary mt-1">{formatCurrency(summary.taxTotal)}</p>
              </div>
              <div>
                <p className="text-xs text-text-secondary">Today's Orders</p>
                <p className="text-lg font-bold text-text-primary mt-1">7</p>
              </div>
              <div>
                <p className="text-xs text-text-secondary">Today's Revenue</p>
                <p className="text-lg font-bold text-text-primary mt-1">{formatCurrency(summary.totalSales)}</p>
              </div>
              <div>
                <p className="text-xs text-text-secondary">Effective Tax Rate</p>
                <p className="text-lg font-bold text-text-primary mt-1">5.00%</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Tax Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <p className="text-[11px] font-medium text-blue-400 uppercase tracking-wider">Total Taxes</p>
          <p className="text-2xl font-bold text-text-primary">{formatCurrency(summary.taxTotal)}</p>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
          <p className="text-[11px] font-medium text-purple-400 uppercase tracking-wider">Total Revenue</p>
          <p className="text-2xl font-bold text-text-primary">{formatCurrency(summary.totalSales)}</p>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <p className="text-[11px] font-medium text-green-400 uppercase tracking-wider">SGST (2.50%)</p>
          <p className="text-2xl font-bold text-text-primary">{formatCurrency(sgstTotal)}</p>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 border-cyan-500/20">
          <p className="text-[11px] font-medium text-cyan-400 uppercase tracking-wider">CGST (2.50%)</p>
          <p className="text-2xl font-bold text-text-primary">{formatCurrency(cgstTotal)}</p>
        </Card>
      </div>

      {/* Tax Breakdown Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <h3 className="font-semibold text-text-primary text-sm mb-4">Daily Tax Breakdown</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyTaxData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0d1526', borderColor: '#1e3a5f', borderRadius: 8, fontSize: 11 }}
                  formatter={(value: any) => formatCurrency(value)}
                />
                <Bar dataKey="sgst" fill="#3b82f6" name="SGST" radius={[6, 6, 0, 0]} stackId="a" />
                <Bar dataKey="cgst" fill="#10b981" name="CGST" radius={[6, 6, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Tax Types */}
        <Card>
          <h3 className="font-semibold text-text-primary text-sm mb-4">Tax Types</h3>
          <div className="space-y-3">
            {taxTypes.map((tax, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-bg-tertiary/30 border border-border/50">
                <div>
                  <p className="text-sm font-semibold text-text-primary">{tax.name}</p>
                  <p className="text-xs text-text-muted mt-1">Rate: {tax.rate}</p>
                </div>
                <p className="text-lg font-bold text-text-primary">{formatCurrency(tax.amount)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Daily Tax Details Table */}
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border">
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">DATE</th>
                <th className="py-3 px-4 text-right font-semibold text-text-secondary">SALES AMOUNT</th>
                <th className="py-3 px-4 text-right font-semibold text-text-secondary">SGST (2.50%)</th>
                <th className="py-3 px-4 text-right font-semibold text-text-secondary">CGST (2.50%)</th>
                <th className="py-3 px-4 text-right font-semibold text-text-secondary">TOTAL TAX AMOUNT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {dailyTaxData.map((day: any, idx: number) => (
                <tr key={idx} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-3 px-4 font-semibold text-text-primary">{day.name}</td>
                  <td className="py-3 px-4 text-right text-text-secondary">{formatCurrency(day.sales)}</td>
                  <td className="py-3 px-4 text-right text-text-secondary">{formatCurrency(day.sgst)}</td>
                  <td className="py-3 px-4 text-right text-text-secondary">{formatCurrency(day.cgst)}</td>
                  <td className="py-3 px-4 text-right font-semibold text-text-primary">{formatCurrency(day.total)}</td>
                </tr>
              ))}
              <tr className="bg-bg-tertiary/30 border-t-2 border-border">
                <td className="py-3 px-4 font-semibold text-text-primary">Total</td>
                <td className="py-3 px-4 text-right font-bold text-text-primary">{formatCurrency(summary.totalSales)}</td>
                <td className="py-3 px-4 text-right font-bold text-text-primary">{formatCurrency(sgstTotal)}</td>
                <td className="py-3 px-4 text-right font-bold text-text-primary">{formatCurrency(cgstTotal)}</td>
                <td className="py-3 px-4 text-right font-bold text-text-primary text-sm">{formatCurrency(summary.taxTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
