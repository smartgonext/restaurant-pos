import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatCurrency, formatDate } from '@/lib/utils';
import api from '@/lib/api';
import { StatCard } from '@/components/ui/StatCard';
import { Store, Users, DollarSign, TrendingUp, Receipt, CheckCircle, Clock, Wallet, Percent, ArrowUpRight } from 'lucide-react';

export default function Billing() {
  const { data: billing, isLoading } = useQuery({
    queryKey: ['superadmin-billing'],
    queryFn: () => api.get('/superadmin/billing').then((r) => r.data.data).catch(() => []),
  });

  const getAmount = (b: any) => {
    if (!b.package) return 0;
    return b.billingCycle === 'annual' ? Number(b.package.annualPrice) : Number(b.package.monthlyPrice) || 0;
  };

  const stats = {
    totalRevenue: billing?.reduce((acc: number, b: any) => acc + getAmount(b), 0) || 0,
    subscriptionFee: (billing?.reduce((acc: number, b: any) => acc + getAmount(b), 0) || 0) * 0.8,
    membershipFee: (billing?.reduce((acc: number, b: any) => acc + getAmount(b), 0) || 0) * 0.1,
    netProfit: (billing?.reduce((acc: number, b: any) => acc + getAmount(b), 0) || 0) * 0.7,
  };

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Billing & Subscriptions</h1>
          <p className="text-sm text-text-muted mt-1">Manage restaurant subscriptions and revenue</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total Revenue" value={formatCurrency(stats.totalRevenue)} icon={DollarSign} color="blue" change={12} />
        <StatCard label="Subscription Fee" value={formatCurrency(stats.subscriptionFee)} icon={Receipt} color="green" change={8} />
        <StatCard label="Membership Fee" value={formatCurrency(stats.membershipFee)} icon={Wallet} color="purple" change={5} />
        <StatCard label="Net Profit" value={formatCurrency(stats.netProfit)} icon={ArrowUpRight} color="cyan" change={15} />
      </div>

      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted bg-bg-tertiary/50">
                <th className="text-left py-3 px-5 font-medium">Restaurant</th>
                <th className="text-left py-3 px-5 font-medium">Package</th>
                <th className="text-left py-3 px-5 font-medium">Status</th>
                <th className="text-left py-3 px-5 font-medium">Billing Cycle</th>
                <th className="text-left py-3 px-5 font-medium">Amount</th>
                <th className="text-left py-3 px-5 font-medium">Next Payment</th>
                <th className="text-left py-3 px-5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="table-row">
                    {Array.from({ length: 7 }).map((_, j) => <td key={j} className="py-3 px-5"><Skeleton className="h-4 w-20" /></td>)}
                  </tr>
                ))
              ) : billing?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-text-muted">
                    <Receipt className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    No billing records found.
                  </td>
                </tr>
              ) : (
                billing?.map((b: any) => (
                  <tr key={b.id} className="table-row">
                    <td className="py-3 px-5 font-medium text-text-primary">{b.restaurant?.name || '—'}</td>
                    <td className="py-3 px-5 text-blue-400">{b.package?.name || '—'}</td>
                    <td className="py-3 px-5">
                      <Badge variant={b.status === 'active' ? 'success' : 'warning'} dot>{b.status}</Badge>
                    </td>
                    <td className="py-3 px-5 text-text-secondary capitalize">{b.billingCycle}</td>
                    <td className="py-3 px-5 font-semibold text-text-primary">{formatCurrency(Number(b.amount || 0))}</td>
                    <td className="py-3 px-5 text-text-muted">{b.nextPaymentDate ? formatDate(b.nextPaymentDate) : '—'}</td>
                    <td className="py-3 px-5">
                      <Button variant="secondary" size="sm">View Details</Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
