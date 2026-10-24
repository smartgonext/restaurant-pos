import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { Activity, Building2, DollarSign, TrendingUp } from 'lucide-react';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function SuperAdminLiveReports() {
  const { data: dashboard } = useQuery({
    queryKey: ['superadmin-dashboard-live'],
    queryFn: () => api.get('/superadmin/dashboard').then((r) => r.data.data ?? {}),
    refetchInterval: 5000,
  });

  const { data: restaurants = [] } = useQuery({
    queryKey: ['superadmin-restaurants-live'],
    queryFn: () => api.get('/superadmin/restaurants?limit=10').then((r) => r.data.data || []),
    refetchInterval: 5000,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['superadmin-payments-live'],
    queryFn: () => api.get('/superadmin/payments?limit=10').then((r) => r.data.data || []),
    refetchInterval: 5000,
  });

  const successfulPayments = useMemo(() => {
    return payments.filter((p: any) => p.status === 'success');
  }, [payments]);

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Live Reports</h1>
          <p className="text-sm text-text-muted mt-1">Auto-refreshing online report feed (updates every 5 seconds)</p>
        </div>
        <Badge className="bg-green-500/15 text-green-400 border-green-500/30">
          <Activity className="w-3.5 h-3.5 mr-1.5" /> LIVE
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total Restaurants" value={dashboard?.totalRestaurants || 0} icon={Building2} color="blue" />
        <StatCard label="Active Subscriptions" value={dashboard?.activeSubscriptions || 0} icon={TrendingUp} color="green" />
        <StatCard label="Total Revenue" value={formatCurrency(Number(dashboard?.totalRevenue || 0))} icon={DollarSign} color="purple" />
        <StatCard label="Successful Payments" value={successfulPayments.length} icon={DollarSign} color="cyan" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <h2 className="text-lg font-semibold text-text-primary mb-4">Latest Restaurants</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted">
                  <th className="text-left py-2 px-2">Name</th>
                  <th className="text-left py-2 px-2">Status</th>
                  <th className="text-left py-2 px-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {restaurants.map((r: any) => (
                  <tr key={r.id} className="table-row">
                    <td className="py-2 px-2 text-text-primary font-medium">{r.name}</td>
                    <td className="py-2 px-2">
                      <Badge className={r.status === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}>{r.status}</Badge>
                    </td>
                    <td className="py-2 px-2 text-text-muted">{formatDate(r.createdAt)}</td>
                  </tr>
                ))}
                {restaurants.length === 0 && (
                  <tr><td className="py-6 text-center text-text-muted" colSpan={3}>No data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-text-primary mb-4">Latest Payments</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted">
                  <th className="text-left py-2 px-2">Restaurant</th>
                  <th className="text-left py-2 px-2">Amount</th>
                  <th className="text-left py-2 px-2">Status</th>
                  <th className="text-left py-2 px-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p: any) => (
                  <tr key={p.id} className="table-row">
                    <td className="py-2 px-2 text-text-primary">{p?.subscription?.restaurant?.name || '-'}</td>
                    <td className="py-2 px-2 text-text-primary">{formatCurrency(Number(p.amount || 0))}</td>
                    <td className="py-2 px-2">
                      <Badge className={p.status === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}>{p.status}</Badge>
                    </td>
                    <td className="py-2 px-2 text-text-muted">{formatDate(p.createdAt)}</td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr><td className="py-6 text-center text-text-muted" colSpan={4}>No payments yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
