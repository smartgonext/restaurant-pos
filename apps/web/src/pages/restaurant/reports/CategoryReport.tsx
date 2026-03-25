import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Download } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip, Legend
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#8b5cf6'];

export default function CategoryReport() {
  const [startDate, setStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const { dateFrom, dateTo } = useMemo(() => {
    return { dateFrom: new Date(startDate).toISOString(), dateTo: new Date(endDate).toISOString() };
  }, [startDate, endDate]);

  const { data: categoryData, isLoading } = useQuery({
    queryKey: ['reports', 'categories', startDate, endDate],
    queryFn: () => api.get('/restaurant/reports/categories', { params: { dateFrom, dateTo } }).then(r => r.data.data)
  });

  const categories = Array.isArray(categoryData) ? categoryData : [];
  const totalAmount = categories.reduce((sum: number, cat: any) => sum + cat.value, 0);

  // Sort by value descending
  const sortedCategories = [...categories].sort((a: any, b: any) => b.value - a.value);

  const handleExport = () => {
    alert('Export functionality would generate CSV/PDF with category breakdown');
  };

  if (isLoading) return <div className="flex items-center justify-center h-screen text-text-muted">Loading category report...</div>;

  return (
    <div className="space-y-4 animate-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Category Report</h1>
          <p className="text-xs text-text-muted mt-1">See sales by category to understand performance (Sales Data From {startDate} To {endDate}, Time Period Each Day 12:00 AM - 11:59 PM)</p>
        </div>
      </div>

      {/* Date Range Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
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

      {/* Pie Chart and Legend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pie Chart */}
        <Card className="lg:col-span-2">
          <h3 className="font-semibold text-text-primary text-sm mb-4">Category Distribution</h3>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sortedCategories}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
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
        </Card>

        {/* Legend/List */}
        <Card>
          <h3 className="font-semibold text-text-primary text-sm mb-4">Category Breakdown</h3>
          <div className="space-y-2.5 max-h-[350px] overflow-y-auto">
            {sortedCategories.map((cat: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between pb-2 border-b border-border/30 last:border-0">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                  ></div>
                  <span className="text-xs font-medium text-text-secondary">{cat.name}</span>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-text-primary">{formatCurrency(cat.value)}</p>
                  <p className="text-[10px] text-text-muted">
                    {((cat.value / totalAmount) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Bar Chart */}
      <Card>
        <h3 className="font-semibold text-text-primary text-sm mb-4">Category Comparison</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sortedCategories} margin={{ top: 5, right: 10, left: 0, bottom: 20 }}>
              <XAxis
                dataKey="name"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0d1526', borderColor: '#1e3a5f', borderRadius: 8, fontSize: 11 }}
                formatter={(value: any) => formatCurrency(value)}
              />
              <Bar dataKey="value" fill="#3b82f6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Detailed Table */}
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border">
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">ITEM CATEGORY</th>
                <th className="py-3 px-4 text-center font-semibold text-text-secondary">QUANTITY SOLD</th>
                <th className="py-3 px-4 text-right font-semibold text-text-secondary">AMOUNT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {sortedCategories.map((cat: any, idx: number) => (
                <tr key={idx} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-3 px-4 font-semibold text-text-primary">{cat.name}</td>
                  <td className="py-3 px-4 text-center text-text-secondary">-</td>
                  <td className="py-3 px-4 text-right font-semibold text-text-primary">{formatCurrency(cat.value)}</td>
                </tr>
              ))}
              <tr className="bg-bg-tertiary/30 border-t-2 border-border">
                <td className="py-3 px-4 font-semibold text-text-primary">Total</td>
                <td className="py-3 px-4 text-center"></td>
                <td className="py-3 px-4 text-right font-bold text-text-primary text-sm">{formatCurrency(totalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
