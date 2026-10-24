import { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { Search, Filter, RefreshCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { DatePreset, getDateRangeForPreset, toApiDateTimeRange } from '@/lib/dateRanges';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';

export default function ItemReport() {
  const initial = getDateRangeForPreset('Today');
  const [dateRange, setDateRange] = useState<DatePreset>('Today');
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('unitsSold');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (dateRange === 'Custom') return;
    const next = getDateRangeForPreset(dateRange);
    setStartDate(next.startDate);
    setEndDate(next.endDate);
  }, [dateRange]);

  const { dateFrom, dateTo } = useMemo(() => {
    return toApiDateTimeRange(startDate, endDate);
  }, [startDate, endDate]);

  const { data: itemsData, isLoading } = useQuery({
    queryKey: ['reports', 'items', startDate, endDate],
    queryFn: () => api.get('/restaurant/reports/items', { params: { dateFrom, dateTo } }).then(r => r.data.data)
  });

  const items = Array.isArray(itemsData) ? itemsData : [];

  const filteredItems = items
    .filter((item: any) =>
      item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a: any, b: any) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortField === 'name') return a.name?.localeCompare(b.name) * dir;
      if (sortField === 'category') return (a.category || '').localeCompare(b.category || '') * dir;
      return ((Number(a[sortField]) || 0) - (Number(b[sortField]) || 0)) * dir;
    });

  const totalRevenue = items.reduce((sum: number, item: any) => sum + (Number(item.revenue) || 0), 0);
  const totalQuantity = items.reduce((sum: number, item: any) => sum + (Number(item.unitsSold) || 0), 0);

  const categoryData: Record<string, { name: string; quantity: number; revenue: number }> = {};
  items.forEach((item: any) => {
    if (!categoryData[item.category]) {
      categoryData[item.category] = { name: item.category, quantity: 0, revenue: 0 };
    }
    categoryData[item.category].quantity += item.unitsSold || 0;
    categoryData[item.category].revenue += item.revenue || 0;
  });

  const chartData = Object.values(categoryData).sort((a, b) => b.revenue - a.revenue);

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

  const exportRows = filteredItems.map((item: any) => ({
    'Item Name': item.name,
    Category: item.category,
    'Quantity Sold': item.unitsSold,
    'Selling Price': item.unitsSold > 0 ? formatCurrency(item.revenue / item.unitsSold) : '—',
    'Total Revenue': formatCurrency(item.revenue),
  }));

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <RefreshCcw className="w-6 h-6 animate-spin text-purple-400" />
        <span className="text-sm text-text-muted">Loading item report...</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 animate-in p-1">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Item Report</h1>
          <p className="text-xs text-text-muted mt-1">
            Detailed sales performance of items • {startDate} to {endDate}
          </p>
        </div>
        <ExportDropdown data={exportRows} filename="item-report" title="Item Report" subtitle={`${startDate} to ${endDate}`} />
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
          <p className="text-[11px] font-medium text-purple-400 uppercase tracking-wider">Total Revenue</p>
          <p className="text-3xl font-bold text-text-primary">{formatCurrency(totalRevenue)}</p>
          <p className="text-[10px] text-text-muted">From all items</p>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <p className="text-[11px] font-medium text-green-400 uppercase tracking-wider">Total Quantity Sold</p>
          <p className="text-3xl font-bold text-text-primary">{totalQuantity}</p>
          <p className="text-[10px] text-text-muted">Across {items.length} items</p>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <p className="text-[11px] font-medium text-blue-400 uppercase tracking-wider">Unique Items</p>
          <p className="text-3xl font-bold text-text-primary">{items.length}</p>
        </Card>
        <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
          <p className="text-[11px] font-medium text-orange-400 uppercase tracking-wider">Items Sold</p>
          <p className="text-3xl font-bold text-text-primary">{items.filter((i: any) => i.unitsSold > 0).length}</p>
        </Card>
      </div>

      {/* Category Chart */}
      <Card>
        <h3 className="font-semibold text-text-primary text-sm mb-4">Sales by Category</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
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

      {/* Search */}
      <Card className="p-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Search by item name or category..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-bg-secondary border border-border rounded-lg pl-9 h-9 text-sm outline-none focus:ring-1 focus:ring-primary/20"
            />
          </div>
          <span className="text-xs text-text-muted self-center">{filteredItems.length} of {items.length} items</span>
        </div>
      </Card>

      {/* Items Table */}
      <Card padding={false}>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border">
                <th onClick={() => handleSort('name')} className="py-3 px-4 text-left font-semibold text-text-secondary cursor-pointer hover:text-text-primary">ITEM NAME <SortIcon field="name" /></th>
                <th onClick={() => handleSort('category')} className="py-3 px-4 text-left font-semibold text-text-secondary cursor-pointer hover:text-text-primary">CATEGORY <SortIcon field="category" /></th>
                <th onClick={() => handleSort('unitsSold')} className="py-3 px-4 text-center font-semibold text-text-secondary cursor-pointer hover:text-text-primary">QTY SOLD <SortIcon field="unitsSold" /></th>
                <th onClick={() => handleSort('revenue')} className="py-3 px-4 text-center font-semibold text-text-secondary cursor-pointer hover:text-text-primary">SELLING PRICE <SortIcon field="revenue" /></th>
                <th onClick={() => handleSort('revenue')} className="py-3 px-4 text-right font-semibold text-text-secondary cursor-pointer hover:text-text-primary">TOTAL REVENUE <SortIcon field="revenue" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredItems.length > 0 ? (
                filteredItems.map((item: any, idx: number) => (
                  <tr key={idx} className="hover:bg-bg-hover/30 transition-colors">
                    <td className="py-3 px-4 font-semibold text-text-primary">{item.name}</td>
                    <td className="py-3 px-4 text-text-secondary">
                      <span className="bg-bg-tertiary px-2 py-0.5 rounded text-[10px] font-medium">{item.category}</span>
                    </td>
                    <td className="py-3 px-4 text-center font-medium text-text-primary">{item.unitsSold}</td>
                    <td className="py-3 px-4 text-center text-text-secondary">{item.unitsSold > 0 ? formatCurrency(item.revenue / item.unitsSold) : '—'}</td>
                    <td className="py-3 px-4 text-right font-semibold text-text-primary">{formatCurrency(item.revenue)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-text-muted">No items found matching your search</td>
                </tr>
              )}
            </tbody>
            {filteredItems.length > 0 && (
              <tfoot>
                <tr className="bg-bg-tertiary/40 border-t-2 border-border font-bold">
                  <td colSpan={2} className="py-3 px-4 text-text-primary">TOTAL ({filteredItems.length} items)</td>
                  <td className="py-3 px-4 text-center text-text-primary">{filteredItems.reduce((s: number, i: any) => s + (i.unitsSold || 0), 0)}</td>
                  <td className="py-3 px-4 text-center text-text-primary">—</td>
                  <td className="py-3 px-4 text-right text-text-primary">{formatCurrency(filteredItems.reduce((s: number, i: any) => s + (i.revenue || 0), 0))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
}