import { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { RefreshCcw } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { DatePreset, getDateRangeForPreset, toApiDateTimeRange } from '@/lib/dateRanges';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend
} from 'recharts';

export default function TaxReport() {
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

  const { dateFrom, dateTo } = useMemo(() => {
    return toApiDateTimeRange(startDate, endDate);
  }, [startDate, endDate]);

  const { data: taxData, isLoading } = useQuery({
    queryKey: ['reports', 'tax', startDate, endDate],
    queryFn: () => api.get('/restaurant/reports/tax', { params: { dateFrom, dateTo } }).then(r => r.data.data)
  });

  const summary = taxData?.summary || { totalSales: 0, totalTax: 0, sgstTotal: 0, cgstTotal: 0, orderCount: 0, effectiveTaxRate: 0, sgstRate: 2.5, cgstRate: 2.5 };
  const dailyBreakdown = taxData?.dailyBreakdown || [];
  const itemBreakdown = taxData?.itemBreakdown || [];

  const sgstTotal = Number(summary.sgstTotal || 0);
  const cgstTotal = Number(summary.cgstTotal || 0);
  const sgstRate = Number(summary.sgstRate ?? 2.5);
  const cgstRate = Number(summary.cgstRate ?? 2.5);
  const effectiveTaxRate = Number(summary.effectiveTaxRate ?? (sgstRate + cgstRate));
  const internalTaxTotal = Number(summary.internalTaxTotal ?? 0);
  const externalTaxTotal = Number(summary.externalTaxTotal ?? 0);

  const dailyTaxData = (dailyBreakdown || []).map((day: any) => ({
    name: day.name,
    sales: Number(day.sales || 0),
    sgst: Number(day.sgst || 0),
    cgst: Number(day.cgst || 0),
    total: Number(day.total || 0),
  }));

  const taxTypes = [
    { name: 'SGST', rate: `${sgstRate.toFixed(2)}%`, amount: sgstTotal, color: '#3b82f6' },
    { name: 'CGST', rate: `${cgstRate.toFixed(2)}%`, amount: cgstTotal, color: '#10b981' }
  ];

  const exportRows = dailyTaxData.map((day: any) => ({
    Date: day.name,
    'Sales Amount': formatCurrency(day.sales),
    [`SGST (${sgstRate}%)`]: formatCurrency(day.sgst),
    [`CGST (${cgstRate}%)`]: formatCurrency(day.cgst),
    'Total Tax': formatCurrency(day.total),
  }));

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <RefreshCcw className="w-6 h-6 animate-spin text-orange-400" />
        <span className="text-sm text-text-muted">Loading tax report...</span>
      </div>
    </div>
  );

  const totals = dailyTaxData.reduce((acc: any, d: any) => ({
    sales: acc.sales + (Number(d.sales) || 0),
    sgst: acc.sgst + (Number(d.sgst) || 0),
    cgst: acc.cgst + (Number(d.cgst) || 0),
    total: acc.total + (Number(d.total) || 0),
  }), { sales: 0, sgst: 0, cgst: 0, total: 0 });

  return (
    <div className="space-y-4 animate-in p-1">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Tax Report</h1>
          <p className="text-xs text-text-muted mt-1">
            Tax collection breakdown • {startDate} to {endDate}
          </p>
        </div>
        <ExportDropdown data={exportRows} filename="tax-report" title="Tax Report" subtitle={`${startDate} to ${endDate}`} />
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
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">From Date</label>
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
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">To Date</label>
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
        </div>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <p className="text-[11px] font-medium text-blue-400 uppercase tracking-wider">Total Taxes</p>
          <p className="text-2xl font-bold text-text-primary">{formatCurrency(summary.totalTax)}</p>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
          <p className="text-[11px] font-medium text-purple-400 uppercase tracking-wider">Total Revenue</p>
          <p className="text-2xl font-bold text-text-primary">{formatCurrency(summary.totalSales)}</p>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <p className="text-[11px] font-medium text-green-400 uppercase tracking-wider">SGST ({sgstRate}%)</p>
          <p className="text-2xl font-bold text-text-primary">{formatCurrency(sgstTotal)}</p>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 border-cyan-500/20">
          <p className="text-[11px] font-medium text-cyan-400 uppercase tracking-wider">CGST ({cgstRate}%)</p>
          <p className="text-2xl font-bold text-text-primary">{formatCurrency(cgstTotal)}</p>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
          <p className="text-[11px] font-medium text-amber-400 uppercase tracking-wider">Effective Rate</p>
          <p className="text-2xl font-bold text-text-primary">{effectiveTaxRate.toFixed(2)}%</p>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-slate-500/10 to-slate-500/5 border-slate-500/20">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Orders</p>
          <p className="text-2xl font-bold text-text-primary">{summary.orderCount ?? 0}</p>
        </Card>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
          <p className="text-[11px] font-medium text-amber-400 uppercase tracking-wider">Internal Tax</p>
          <p className="text-lg font-bold text-text-primary">{formatCurrency(internalTaxTotal)}</p>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-rose-500/10 to-rose-500/5 border-rose-500/20">
          <p className="text-[11px] font-medium text-rose-400 uppercase tracking-wider">External Tax</p>
          <p className="text-lg font-bold text-text-primary">{formatCurrency(externalTaxTotal)}</p>
        </Card>
      </div>

      {/* Tax Breakdown Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <h3 className="font-semibold text-text-primary text-sm mb-4">Daily Tax Breakdown</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyTaxData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0d1526', borderColor: '#1e3a5f', borderRadius: 8, fontSize: 11 }}
                  formatter={(value: any) => formatCurrency(value)}
                />
                <Legend />
                <Bar dataKey="sgst" fill="#3b82f6" name="SGST" radius={[6, 6, 0, 0]} stackId="a" />
                <Bar dataKey="cgst" fill="#10b981" name="CGST" radius={[6, 6, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Tax Types */}
        <Card>
          <h3 className="font-semibold text-text-primary text-sm mb-4">Tax Types</h3>
          <div className="space-y-4">
            {taxTypes.map((tax, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 rounded-lg bg-bg-tertiary/30 border border-border/50">
                <div>
                  <p className="text-sm font-semibold text-text-primary">{tax.name}</p>
                  <p className="text-xs text-text-muted mt-1">Rate: {tax.rate}</p>
                </div>
                <p className="text-lg font-bold text-text-primary">{formatCurrency(tax.amount)}</p>
              </div>
            ))}
            <div className="flex items-center justify-between p-4 rounded-lg bg-bg-tertiary/50 border border-border font-bold">
              <div>
                <p className="text-sm text-text-primary">Total Tax</p>
                <p className="text-xs text-text-muted mt-1">Combined SGST + CGST</p>
              </div>
              <p className="text-xl font-bold text-text-primary">{formatCurrency(summary.totalTax)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Daily Tax Details Table */}
      <Card padding={false}>
        <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30 flex items-center justify-between">
          <h3 className="font-semibold text-text-primary text-sm">Daily Tax Details</h3>
          <span className="text-[10px] text-text-muted">{dailyTaxData.length} records</span>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border">
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">DATE</th>
                <th className="py-3 px-4 text-right font-semibold text-text-secondary">SALES AMOUNT</th>
                <th className="py-3 px-4 text-right font-semibold text-text-secondary">SGST ({sgstRate}%)</th>
                <th className="py-3 px-4 text-right font-semibold text-text-secondary">CGST ({cgstRate}%)</th>
                <th className="py-3 px-4 text-right font-semibold text-text-secondary">TOTAL TAX</th>
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
            </tbody>
            <tfoot>
              <tr className="bg-bg-tertiary/40 border-t-2 border-border font-bold">
                <td className="py-3 px-4 text-text-primary">TOTAL</td>
                <td className="py-3 px-4 text-right text-text-primary">{formatCurrency(totals.sales)}</td>
                <td className="py-3 px-4 text-right text-text-primary">{formatCurrency(totals.sgst)}</td>
                <td className="py-3 px-4 text-right text-text-primary">{formatCurrency(totals.cgst)}</td>
                <td className="py-3 px-4 text-right text-lg text-text-primary">{formatCurrency(totals.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* Item-Level Tax Breakdown */}
      <Card padding={false}>
        <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30">
          <h3 className="font-semibold text-text-primary text-sm">Item-Level Tax Breakdown (Non-KOT)</h3>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="bg-bg-tertiary/30 border-b border-border">
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">ITEM</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">CATEGORY</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">TAX TYPE</th>
                <th className="py-3 px-4 text-right font-semibold text-text-secondary">TAX %</th>
                <th className="py-3 px-4 text-right font-semibold text-text-secondary">QTY</th>
                <th className="py-3 px-4 text-right font-semibold text-text-secondary">TAXABLE SALES</th>
                <th className="py-3 px-4 text-right font-semibold text-text-secondary">TAX AMOUNT</th>
                <th className="py-3 px-4 text-right font-semibold text-text-secondary">FINAL SALES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {itemBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 px-4 text-center text-text-muted">No non-KOT taxed item data for selected range</td>
                </tr>
              ) : itemBreakdown.map((row: any, idx: number) => (
                <tr key={`${row.menuItemId}-${idx}`} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-3 px-4 font-semibold text-text-primary">{row.itemName}</td>
                  <td className="py-3 px-4 text-text-secondary">{row.categoryName || 'Uncategorized'}</td>
                  <td className="py-3 px-4">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${row.taxType === 'internal' ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'}`}>
                      {row.taxType}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-text-secondary">{Number(row.taxPercent || 0).toFixed(2)}%</td>
                  <td className="py-3 px-4 text-right text-text-secondary">{Number(row.quantity || 0).toFixed(3)}</td>
                  <td className="py-3 px-4 text-right text-text-secondary">{formatCurrency(Number(row.taxableSales || 0))}</td>
                  <td className="py-3 px-4 text-right font-semibold text-text-primary">{formatCurrency(Number(row.taxAmount || 0))}</td>
                  <td className="py-3 px-4 text-right font-semibold text-text-primary">{formatCurrency(Number(row.finalSales || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}