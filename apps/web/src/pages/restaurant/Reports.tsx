import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Download, TrendingUp, Calendar, CreditCard, PieChart } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart as RePieChart, Pie, Cell
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899'];

export default function Reports() {
  const [dateRange, setDateRange] = useState('Last 7 Days');

  const { dateFrom, dateTo } = useMemo(() => {
     const now = new Date();
     let from = new Date();
     const to = now.toISOString();

     if (dateRange === 'Today') {
       from.setHours(0, 0, 0, 0);
     } else if (dateRange === 'Last 7 Days') {
       from.setDate(now.getDate() - 7);
     } else if (dateRange === 'This Month') {
       from = new Date(now.getFullYear(), now.getMonth(), 1);
     } else if (dateRange === 'Last Month') {
       from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
       const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
       return { dateFrom: from.toISOString(), dateTo: lastMonthEnd.toISOString() };
     } else if (dateRange === 'This Year') {
       from = new Date(now.getFullYear(), 0, 1);
     }
     return { dateFrom: from.toISOString(), dateTo: to };
  }, [dateRange]);

  const { data: salesReport, isLoading: salesLoading } = useQuery({
    queryKey: ['reports', 'sales', dateRange],
    queryFn: () => api.get('/restaurant/reports/sales', { params: { dateFrom, dateTo } }).then(r => r.data.data)
  });

  const { data: itemReport, isLoading: itemsLoading } = useQuery({
    queryKey: ['reports', 'items', dateRange],
    queryFn: () => api.get('/restaurant/reports/items', { params: { dateFrom, dateTo } }).then(r => r.data.data)
  });

  const { data: categoryReport, isLoading: catLoading } = useQuery({
    queryKey: ['reports', 'categories', dateRange],
    queryFn: () => api.get('/restaurant/reports/categories', { params: { dateFrom, dateTo } }).then(r => r.data.data)
  });

  const summary = salesReport?.summary || { totalSales: 0, orderCount: 0, avgOrderValue: 0, taxTotal: 0 };
  const salesData = salesReport?.dailySales || [];
  const categoryData = categoryReport || [];
  const topItems = itemReport?.slice(0, 5) || [];

  return (
    <div className="space-y-4 animate-in">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Analytics</h1>
          <p className="text-xs text-text-muted mt-1">Detailed business performance insights</p>
        </div>
        <div className="flex items-center gap-2">
          <select 
            value={dateRange} 
            onChange={(e) => setDateRange(e.target.value)} 
            className="w-32 bg-bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/20 transition-all font-medium"
          >
            <option>Today</option>
            <option>Last 7 Days</option>
            <option>This Month</option>
            <option>Last Month</option>
            <option>This Year</option>
          </select>
          <Button size="sm" icon={<Download className="w-3.5 h-3.5" />}>Export</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Revenue", value: formatCurrency(summary.totalSales), icon: TrendingUp, color: "text-blue-400" },
          { title: "Orders", value: summary.orderCount || 0, icon: PieChart, color: "text-purple-400" },
          { title: "AOV", value: formatCurrency(summary.avgOrderValue), icon: CreditCard, color: "text-success" },
          { title: "Tax", value: formatCurrency(summary.taxTotal), icon: Calendar, color: "text-warning" }
        ].map((stat, i) => (
          <Card key={i} className="flex flex-col gap-1.5 p-3">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-bg-tertiary ${stat.color} border border-border`}>
                <stat.icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] font-medium text-text-muted uppercase tracking-wider">{stat.title}</p>
                <p className="text-sm font-bold text-text-primary mt-0.5">{stat.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-text-primary text-sm">Revenue Trend</h3>
          </div>
          <div className="h-[200px]">
             {salesLoading ? (
               <div className="flex items-center justify-center h-full text-text-muted text-xs">Loading chart...</div>
             ) : (
               <ResponsiveContainer width="100%" height="100%">
                 <AreaChart data={salesData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                   <defs>
                     <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                       <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                       <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                     </linearGradient>
                   </defs>
                   <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                   <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                   <Tooltip contentStyle={{ backgroundColor: '#0d1526', borderColor: '#1e3a5f', borderRadius: 8, fontSize: 10 }} />
                   <Area type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorSales)" />
                 </AreaChart>
               </ResponsiveContainer>
             )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-text-primary text-sm">Category Sales</h3>
          </div>
          <div className="h-[150px]">
            {catLoading ? (
              <div className="text-text-muted text-xs flex items-center justify-center h-full">Loading...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={4} dataKey="value">
                    {categoryData.map((_entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#0d1526', borderColor: '#1e3a5f', borderRadius: 8, fontSize: 10 }} />
                </RePieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="space-y-1.5 mt-4 max-h-[100px] overflow-y-auto">
            {categoryData.map((cat: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                  <span className="text-text-secondary truncate max-w-[100px]">{cat.name}</span>
                </div>
                <span className="font-medium text-text-primary">{formatCurrency(cat.value)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-3">
           <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/50">
             <h3 className="font-semibold text-text-primary text-sm">Top Performing Items</h3>
           </div>
           <div className="overflow-x-auto text-[11px]">
             <table className="w-full">
               <thead>
                 <tr className="text-left text-text-muted bg-bg-tertiary/30">
                   <th className="py-2 px-3 font-medium">Menu Item</th>
                   <th className="py-2 px-3 font-medium text-right">Revenue</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-border/50">
                 {itemsLoading ? (
                   <tr><td colSpan={2} className="py-8 text-center text-text-muted">Loading items...</td></tr>
                 ) : topItems.map((item: any) => (
                    <tr key={item.id} className="hover:bg-bg-hover/30 transition-colors">
                      <td className="py-2.5 px-3 font-medium text-text-primary">{item.name}</td>
                      <td className="py-2.5 px-3 text-success font-semibold text-right">{formatCurrency(item.revenue)}</td>
                    </tr>
                 ))}
               </tbody>
             </table>
           </div>
        </Card>
      </div>
    </div>
  );
}
