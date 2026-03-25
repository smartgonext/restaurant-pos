import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Download, Search, Filter } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function ItemReport() {
  const [startDate, setStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');

  const { dateFrom, dateTo } = useMemo(() => {
    return { dateFrom: new Date(startDate).toISOString(), dateTo: new Date(endDate).toISOString() };
  }, [startDate, endDate]);

  const { data: itemsData, isLoading } = useQuery({
    queryKey: ['reports', 'items', startDate, endDate],
    queryFn: () => api.get('/restaurant/reports/items', { params: { dateFrom, dateTo } }).then(r => r.data.data)
  });

  const items = Array.isArray(itemsData) ? itemsData : [];

  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalRevenue = items.reduce((sum: number, item: any) => sum + item.revenue, 0);
  const totalQuantity = items.reduce((sum: number, item: any) => sum + item.unitsSold, 0);

  // Group by category for chart
  const categoryData: Record<string, { name: string; quantity: number; revenue: number }> = {};
  items.forEach((item: any) => {
    if (!categoryData[item.category]) {
      categoryData[item.category] = { name: item.category, quantity: 0, revenue: 0 };
    }
    categoryData[item.category].quantity += item.unitsSold;
    categoryData[item.category].revenue += item.revenue;
  });

  const chartData = Object.values(categoryData);

  const handleExport = () => {
    alert('Export functionality would generate CSV/PDF with detailed item report');
  };

  if (isLoading) return <div className="flex items-center justify-center h-screen text-text-muted">Loading item report...</div>;

  return (
    <div className="space-y-4 animate-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Item Report</h1>
          <p className="text-xs text-text-muted mt-1">View detailed sales and performance of items (Sales Data From {startDate} To {endDate}, Time Period Each Day 12:00 AM - 11:59 PM)</p>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-2 gap-4">
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
          <p className="text-[11px] font-medium text-purple-400 uppercase tracking-wider">Sum of Total Revenue</p>
          <p className="text-3xl font-bold text-text-primary">{formatCurrency(totalRevenue)}</p>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <p className="text-[11px] font-medium text-green-400 uppercase tracking-wider">Total Quantity Sold</p>
          <p className="text-3xl font-bold text-text-primary">{totalQuantity}</p>
        </Card>
      </div>

      {/* Category Chart */}
      <Card>
        <h3 className="font-semibold text-text-primary text-sm mb-4">Sales by Category</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: '#0d1526', borderColor: '#1e3a5f', borderRadius: 8, fontSize: 11 }} />
              <Legend />
              <Bar dataKey="quantity" fill="#10b981" name="Quantity Sold" radius={[6, 6, 0, 0]} />
              <Bar dataKey="revenue" fill="#3b82f6" name="Revenue" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Search and Filter */}
      <Card className="p-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Search your menu item by..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full glass-input pl-9 h-9 text-sm"
            />
          </div>
          <Button size="sm" variant="secondary" icon={<Filter className="w-4 h-4" />}>All Users</Button>
        </div>
      </Card>

      {/* Items Table */}
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border">
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">ITEM NAME</th>
                <th className="py-3 px-4 text-left font-semibold text-text-secondary">ITEM CATEGORY NAME</th>
                <th className="py-3 px-4 text-center font-semibold text-text-secondary">QUANTITY SOLD</th>
                <th className="py-3 px-4 text-center font-semibold text-text-secondary">SELLING PRICE</th>
                <th className="py-3 px-4 text-right font-semibold text-text-secondary">TOTAL REVENUE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredItems.length > 0 ? (
                filteredItems.map((item: any, idx: number) => (
                  <tr key={idx} className="hover:bg-bg-hover/30 transition-colors">
                    <td className="py-3 px-4 font-semibold text-text-primary">{item.name}</td>
                    <td className="py-3 px-4 text-text-secondary">{item.category}</td>
                    <td className="py-3 px-4 text-center font-medium text-text-primary">{item.unitsSold}</td>
                    <td className="py-3 px-4 text-center text-text-secondary">{formatCurrency(item.revenue / item.unitsSold)}</td>
                    <td className="py-3 px-4 text-right font-semibold text-text-primary">{formatCurrency(item.revenue)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-text-muted">No items found matching your search</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
