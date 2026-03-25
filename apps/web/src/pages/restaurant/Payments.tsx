import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Search, Download, CreditCard, Banknote, DollarSign } from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export default function Payments() {
  const { data: paymentsRes, isLoading } = useQuery({
    queryKey: ['order-payments'],
    queryFn: () => api.get('/restaurant/payments').then(r => r.data.data)
  });

  const payments = paymentsRes || [];

  const totalCaptured = payments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
  const onlinePayments = payments.filter((p: any) => p.method !== 'Cash').reduce((sum: number, p: any) => sum + Number(p.amount), 0);
  const cashCollected = payments.filter((p: any) => p.method === 'Cash').reduce((sum: number, p: any) => sum + Number(p.amount), 0);

  if (isLoading) return <div className="p-8 text-center text-text-muted">Loading transactions...</div>;

  return (
    <div className="space-y-4 animate-in">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Transactions</h1>
          <p className="text-xs text-text-muted mt-1">Order payment history and settlement records</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" icon={<DollarSign className="w-4 h-4" />}>Due</Button>
          <Button size="sm" icon={<Download className="w-4 h-4" />}>Export</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="flex flex-col gap-1">
          <span className="text-[10px] font-medium text-text-muted uppercase">Total Aggregated</span>
          <span className="text-xl font-bold text-text-primary">{formatCurrency(totalCaptured)}</span>
        </Card>
        <Card className="flex flex-col gap-1 bg-success/5 border-success/20">
          <span className="text-[10px] font-medium text-success uppercase">Online</span>
          <span className="text-xl font-bold text-success">{formatCurrency(onlinePayments)}</span>
        </Card>
        <Card className="flex flex-col gap-1">
          <span className="text-[10px] font-medium text-blue-400 uppercase">Cash</span>
          <span className="text-xl font-bold text-blue-400">{formatCurrency(cashCollected)}</span>
        </Card>
        <Card className="flex flex-col gap-1 bg-danger/5 border-danger/20">
          <span className="text-[10px] font-medium text-danger uppercase">Refunds</span>
          <span className="text-xl font-bold text-danger">$0.00</span>
        </Card>
      </div>

      <Card padding={false} className="border-border/50">
        <div className="p-3 border-b border-border/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <input className="glass-input w-full pl-9 h-9 text-xs" placeholder="Search Transaction / Order ID..." />
          </div>
        </div>

        <div className="overflow-x-auto text-[11px]">
          <table className="w-full">
            <thead>
              <tr className="bg-bg-tertiary/30 border-b border-border text-left">
                <th className="py-2.5 px-4 font-medium text-text-secondary w-56">ID & Date</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary">Order #</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary">Method</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary">Amount</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary">Status</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {payments.map((pay: any) => (
                <tr key={pay.id} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-3 px-4">
                    <p className="font-bold text-text-primary truncate max-w-[150px]">{pay.transactionId || `PAY-${pay.id}`}</p>
                    <p className="text-[10px] text-text-muted mt-0.5">{formatDateTime(pay.createdAt)}</p>
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-semibold text-blue-400">{pay.order?.orderNumber}</p>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5">
                      {pay.method === 'Cash' ? <Banknote className="w-3 h-3 text-success" /> : <CreditCard className="w-3 h-3 text-blue-400" />}
                      <span className="font-medium text-text-primary capitalize">{pay.method}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-bold text-text-primary">
                    {formatCurrency(pay.amount)}
                  </td>
                  <td className="py-3 px-4">
                    <Badge size="sm" variant={!pay.isDue ? 'success' : 'warning'} className="capitalize">
                      {!pay.isDue ? 'Paid' : 'Unpaid'}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button className="text-blue-400 hover:text-blue-300 p-1.5"><Download className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-text-muted italic">No payment records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
