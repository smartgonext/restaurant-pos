import { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { RefreshCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { DatePreset, getDateRangeForPreset, toApiDateTimeRange } from '@/lib/dateRanges';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#8b5cf6', '#14b8a6', '#e11d48'];

export default function CategoryReport() {
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

  const { data: categoryData, isLoading } = useQuery({
    queryKey: ['reports', 'categories', startDate, endDate],
    queryFn: () => api.get('/restaurant/reports/categories', { params: { dateFrom, dateTo } }).then(r => r.data.data)
  });

  const categories = Array.isArray(categoryData) ? categoryData : [];
  const totalAmount = categories.reduce((sum: number, cat: any) => sum + (Number(cat.value) || 0), 0);

  const sortedCategories = [...categories].sort((a: any, b: any) => b.value - a.value);

  const exportRows = sortedCategories.map((cat: any) => ({
    'Category': cat.name,
    'Revenue': formatCurrency(cat.value),
    'Share (%)': totalAmount > 0 ? ((cat.value / totalAmount) * 100).toFixed(1) + '%' : '0.0%',
  }));

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <RefreshCcw className="w-6 h-6 animate-spin text-green-400" />
        <span className="text-sm text-text-muted">Loading category report...</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 animate-in p-1">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Category Report</h1>
          <p className="text-xs text-text-muted mt-1">
            Sales by category • {startDate} to {endDate}
          </p>
        </div>
        <ExportDropdown data={exportRows} filename="category-report" title="Category Report" subtitle={`${startDate} to ${endDate}`} />
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
        </div>
      </Card>

      {/* Summary Card */}
      <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <p className="text-[11px] font-medium text-green-400 uppercase tracking-wider mb-2">Category Summary</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-text-secondary">Total Categories</p>
                <p className="text-lg font-bold text-text-primary mt-1">{categories.length}</p>
              </div>
              <div>
                <p className="text-xs text-text-secondary">Total Revenue</p>
                <p className="text-lg font-bold text-text-primary mt-1">{formatCurrency(totalAmount)}</p>
              </div>
              <div>
                <p className="text-xs text-text-secondary">Top Category</p>
                <p className="text-lg font-bold text-text-primary mt-1 truncate">{sortedCategories[0]?.name || '—'}</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Pie Chart and Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pie Chart */}
        <Card className="lg:col-span-2">
          <h3 className="font-semibold text-text-primary text-sm mb-4">Category Distribution</h3>
          {categories.length > 0 ? (
            <div className="h-[380px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sortedCategories}
                    cx="50%"
                    cy="50%"
                    labelLine={true}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={130}
                    innerRadius={50}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {sortedCategories.map((entry: any, index: number) => (
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
          ) : (
            <div className="text-center py-16 text-text-muted">No category data available</div>
          )}
        </Card>

        {/* Legend/List */}
        <Card>
          <h3 className="font-semibold text-text-primary text-sm mb-4">Category Breakdown</h3>
          <div className="space-y-2.5 max-h-[380px] overflow-y-auto custom-scrollbar pr-1">
            {sortedCategories.length > 0 ? sortedCategories.map((cat: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between pb-2 border-b border-border/30 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                  <span className="text-xs font-medium text-text-secondary truncate">{cat.name}</span>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <p className="text-xs font-semibold text-text-primary">{formatCurrency(cat.value)}</p>
                  <p className="text-[10px] text-text-muted">
                    {totalAmount > 0 ? ((cat.value / totalAmount) * 100).toFixed(1) : 0}%
                  </p>
                </div>
              </div>
            )) : (
              <div className="text-center py-8 text-text-muted">No data</div>
            )}
          </div>
        </Card>
      </div>

      {/* Bar Chart */}
      <Card>
        <h3 className="font-semibold text-text-primary text-sm mb-4">Category Comparison</h3>
        {sortedCategories.length > 0 ? (
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sortedCategories} margin={{ top: 5, right: 10, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                <XAxis
                  dataKey="name"
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  angle={-35}
                  textAnchor="end"
                  height={80}
                />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0d1526', borderColor: '#1e3a5f', borderRadius: 8, fontSize: 11 }}
                  formatter={(value: any) => formatCurrency(value)}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {sortedCategories.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-center py-12 text-text-muted">No comparison data available</div>
        )}
      </Card>

      {/* Detailed Table */}
      <Card padding={false}>
        <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30 flex items-center justify-between">
          <h3 className="font-semibold text-text-primary text-sm">Category Details</h3>
          <span className="text-[10px] text-text-muted">{sortedCategories.length} categories</span>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border">
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">#</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">CATEGORY</th>
                <th className="py-3 px-4 text-center font-semibold text-text-secondary">SHARE</th>
                <th className="py-3 px-4 text-right font-semibold text-text-secondary">AMOUNT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {sortedCategories.map((cat: any, idx: number) => (
                <tr key={idx} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-3 px-4 text-text-muted">{idx + 1}</td>
                  <td className="py-3 px-4 font-semibold text-text-primary">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                      {cat.name}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center gap-2 justify-center">
                      <div className="w-20 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${totalAmount > 0 ? (cat.value / totalAmount) * 100 : 0}%`,
                            backgroundColor: COLORS[idx % COLORS.length]
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-text-muted">
                        {totalAmount > 0 ? ((cat.value / totalAmount) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-text-primary">{formatCurrency(cat.value)}</td>
                </tr>
              ))}
              <tr className="bg-bg-tertiary/30 border-t-2 border-border">
                <td className="py-3 px-4 font-semibold text-text-primary"></td>
                <td className="py-3 px-4 font-semibold text-text-primary">Total</td>
                <td className="py-3 px-4 text-center font-semibold text-text-primary">100%</td>
                <td className="py-3 px-4 text-right font-bold text-text-primary text-sm">{formatCurrency(totalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}