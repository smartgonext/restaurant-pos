import { useQuery } from '@tanstack/react-query';
import { StatCard } from '@/components/ui/StatCard';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Store, Users, DollarSign, TrendingUp, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils';
import api from '@/lib/api';
import { useNavigate } from 'react-router-dom';

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useQuery({
    queryKey: ['superadmin-dashboard'],
    queryFn: () => api.get('/superadmin/dashboard').then((r) => r.data.data),
  });

  const { data: restaurants } = useQuery({
    queryKey: ['superadmin-restaurants-recent'],
    queryFn: () => api.get('/superadmin/restaurants?limit=5').then((r) => r.data.data),
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
          <p className="text-sm text-text-muted mt-1">Platform overview and analytics</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => navigate('/superadmin/restaurants')}>
          Add Restaurant
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total Restaurants" value={stats?.totalRestaurants || 0} change={stats?.restaurantsChange} icon={Store} color="blue" />
        <StatCard label="Active Subscriptions" value={stats?.activeSubscriptions || 0} change={stats?.subscriptionsChange} icon={Users} color="green" />
        <StatCard label="Total Revenue" value={formatCurrency(Number(stats?.totalRevenue || 0))} change={stats?.revenueChange} icon={DollarSign} color="purple" />
        <StatCard label="New This Month" value={stats?.newRestaurants || 0} change={12.5} icon={TrendingUp} color="cyan" />
      </div>

      {/* Recent Restaurants */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary">Recent Restaurants</h2>
          <Button variant="ghost" size="sm" onClick={() => navigate('/superadmin/restaurants')}>View All</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="text-left py-3 px-4 font-medium">Restaurant</th>
                <th className="text-left py-3 px-4 font-medium">Email</th>
                <th className="text-left py-3 px-4 font-medium">Status</th>
                <th className="text-left py-3 px-4 font-medium">Package</th>
                <th className="text-left py-3 px-4 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {restaurants?.map((r: any) => (
                <tr key={r.id} className="table-row cursor-pointer" onClick={() => navigate(`/superadmin/restaurants`)}>
                  <td className="py-3 px-4 font-medium text-text-primary">{r.name}</td>
                  <td className="py-3 px-4 text-text-secondary">{r.email}</td>
                  <td className="py-3 px-4"><Badge className={getStatusColor(r.status)}>{r.status}</Badge></td>
                  <td className="py-3 px-4 text-text-secondary">{r.subscription?.package?.name || '—'}</td>
                  <td className="py-3 px-4 text-text-muted">{formatDate(r.createdAt)}</td>
                </tr>
              ))}
              {(!restaurants || restaurants.length === 0) && (
                <tr><td colSpan={5} className="py-8 text-center text-text-muted">No restaurants yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
