import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AlertTriangle, CreditCard, Search } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function DuePayments() {
  const { data: dues = [], isLoading } = useQuery({
    queryKey: ['due-payments'],
    queryFn: () => api.get('/restaurant/due-payments').then(r => r.data.data),
  });

  const markPaid = async (id: number) => {
    try {
      await api.post(`/restaurant/due-payments/${id}/pay`);
      toast.success('Payment marked resolved');
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Unable to resolve payment');
    }
  };

  return (
    <div className="space-y-4 animate-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold">Due Payments</h1>
          <p className="text-xs text-text-muted">Track pending amounts awaiting clearance</p>
        </div>
        <Button size="sm" icon={<CreditCard className="w-4 h-4" />}>Refresh</Button>
      </div>

      <Card>
        <div className="p-3 border-b border-border flex items-center gap-2">
          <Search className="w-4 h-4 text-text-muted" />
          <input className="glass-input w-full h-9 text-sm" placeholder="Search due invoices..." disabled />
        </div>

        <div className="p-4 space-y-3">
          {isLoading ? (
            <p className="text-text-muted">Loading...</p>
          ) : dues.length === 0 ? (
            <div className="flex items-center gap-2 text-slate-400">
              <AlertTriangle className="w-4 h-4" />
              <span>No due payments at this time.</span>
            </div>
          ) : dues.map((d: any) => (
            <div key={d.id} className="flex flex-col md:flex-row md:items-center md:justify-between border border-border rounded-lg p-3 gap-2">
              <div>
                <h3 className="font-semibold">{d.customerName || 'Customer'} - #{d.invoiceNumber}</h3>
                <p className="text-xs text-text-muted">Due: {new Date(d.dueDate).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-lg">{new Intl.NumberFormat('en-US', { style: 'currency', currency: d.currency || 'USD' }).format(d.amount)}</span>
                <Button size="sm" onClick={() => markPaid(d.id)}>Mark Paid</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
