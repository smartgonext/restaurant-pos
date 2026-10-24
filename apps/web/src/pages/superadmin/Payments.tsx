import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { CreditCard } from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import api from '@/lib/api';

export default function Payments() {
  const { data: payments, isLoading } = useQuery({
    queryKey: ['superadmin-payments'],
    queryFn: () => api.get('/superadmin/payments').then((r) => r.data.data ?? []).catch(() => []),
  });

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Payments</h1>
          <p className="text-sm text-text-muted mt-1">Transaction history</p>
        </div>
      </div>

      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted bg-bg-tertiary/50">
                <th className="text-left py-3 px-5 font-medium">Transaction ID</th>
                <th className="text-left py-3 px-5 font-medium">Restaurant</th>
                <th className="text-left py-3 px-5 font-medium">Amount</th>
                <th className="text-left py-3 px-5 font-medium">Gateway</th>
                <th className="text-left py-3 px-5 font-medium">Status</th>
                <th className="text-left py-3 px-5 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="table-row">
                    {Array.from({ length: 6 }).map((_, j) => <td key={j} className="py-3 px-5"><Skeleton className="h-4 w-20" /></td>)}
                  </tr>
                ))
              ) : payments?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-text-muted">
                    <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    No payments found.
                  </td>
                </tr>
              ) : (
                payments?.map((p: any) => (
                  <tr key={p.id} className="table-row">
                    <td className="py-3 px-5 font-mono text-xs">{p.gatewayTxnId || `TXN-${p.id}`}</td>
                    <td className="py-3 px-5 font-medium text-text-primary">{p.subscription?.restaurant?.name || '—'}</td>
                    <td className="py-3 px-5 font-semibold text-text-primary">{formatCurrency(Number(p.amount || 0))}</td>
                    <td className="py-3 px-5 capitalize text-text-secondary">{p.gateway || 'Manual'}</td>
                    <td className="py-3 px-5">
                      <Badge variant={p.status === 'success' ? 'success' : 'default'}>{p.status}</Badge>
                    </td>
                    <td className="py-3 px-5 text-text-muted">{p.createdAt ? formatDateTime(p.createdAt) : '—'}</td>
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
