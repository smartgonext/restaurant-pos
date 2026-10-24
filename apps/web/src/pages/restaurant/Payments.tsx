import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { Search, CreditCard, Banknote, Wallet } from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

// Visual metadata for known payment methods used in grouping/labels.
const METHOD_META: Record<string, { label: string; icon: any; color: string; chip: string }> = {
  cash: { label: 'Cash', icon: Banknote, color: 'text-emerald-400', chip: '#10b981' },
  upi: { label: 'UPI', icon: CreditCard, color: 'text-violet-400', chip: '#8b5cf6' },
  card: { label: 'Card', icon: CreditCard, color: 'text-blue-400', chip: '#3b82f6' },
  'bank transfer': { label: 'Bank Transfer', icon: CreditCard, color: 'text-cyan-400', chip: '#06b6d4' },
  online: { label: 'Online', icon: CreditCard, color: 'text-amber-400', chip: '#f59e0b' },
  other: { label: 'Other', icon: Wallet, color: 'text-text-secondary', chip: '#9ca3af' },
};

const normalizeMethod = (m: any) => String(m || '').toLowerCase();

export default function Payments() {
  const { data: paymentsRes, isLoading } = useQuery({
    queryKey: ['order-payments'],
    queryFn: () => api.get('/restaurant/payments').then(r => r.data.data)
  });

  const payments = paymentsRes || [];
  const [query, setQuery] = useState('');
  const [activeMethod, setActiveMethod] = useState<string>('all');

  // Group payments by method and aggregate subtotals for each.
  const byMethod = useMemo(() => {
    const map: Record<string, any> = {};
    payments.forEach((p: any) => {
      const key = METHOD_META[normalizeMethod(p.method)] ? normalizeMethod(p.method) : 'other';
      if (!map[key]) {
        map[key] = {
          key,
          label: METHOD_META[key].label,
          icon: METHOD_META[key].icon,
          color: METHOD_META[key].color,
          chip: METHOD_META[key].chip,
          amount: 0,
          count: 0,
          items: [] as any[],
        };
      }
      map[key].items.push(p);
      map[key].amount += Number(p.amount || 0);
      map[key].count++;
    });
    return Object.values(map).sort((a: any, b: any) => b.amount - a.amount);
  }, [payments]);

  const totalCaptured = payments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);

  // Search + method filter applied to rows that will render.
  const visiblePayments = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = activeMethod === 'all'
      ? payments
      : (byMethod.find(g => g.key === activeMethod)?.items || []);
    if (!q) return base;
    return base.filter((p: any) => {
      const tx = (p.transactionId || `PAY-${p.id}`).toLowerCase();
      const orderNo = (p.order?.orderNumber || '').toLowerCase();
      const method = (p.method || '').toLowerCase();
      return tx.includes(q) || orderNo.includes(q) || method.includes(q);
    });
  }, [payments, byMethod, activeMethod, query]);

  // Regroup visible rows by method so section subtotals stay correct while filtering.
  const visibleByMethod = useMemo(() => {
    const grouped: Record<string, any> = {};
    visiblePayments.forEach((p: any) => {
      const key = METHOD_META[normalizeMethod(p.method)] ? normalizeMethod(p.method) : 'other';
      if (!grouped[key]) grouped[key] = { amount: 0, count: 0, items: [] as any[] };
      grouped[key].items.push(p);
      grouped[key].amount += Number(p.amount || 0);
      grouped[key].count++;
    });
    return Object.entries(grouped).map(([key, g]: any) => ({ ...METHOD_META[key], key, ...g }));
  }, [visiblePayments]);

  if (isLoading) return <div className="p-8 text-center text-text-muted">Loading transactions...</div>;

  return (
    <div className="space-y-4 animate-in">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Transactions</h1>
          <p className="text-xs text-text-muted mt-1">Order payment history grouped by payment method</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" icon={<Wallet className="w-4 h-4" />}>Due</Button>
          <ExportDropdown data={payments} filename="payments" title="Payment Transactions" size="sm" />
        </div>
      </div>

      {/* Per-method summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <Card className="flex flex-col gap-1">
          <span className="text-[10px] font-medium text-text-muted uppercase">Total</span>
          <span className="text-xl font-bold text-text-primary">{formatCurrency(totalCaptured)}</span>
          <span className="text-[10px] text-text-muted">{payments.length} transactions</span>
        </Card>
        <Card className="flex flex-col gap-1">
          <span className="text-[10px] font-medium text-danger uppercase">Refunds</span>
          <span className="text-xl font-bold text-danger">
            {formatCurrency(payments.filter((p: any) => p.isRefund || Number(p.amount) < 0).reduce((s: number, p: any) => s + Math.abs(Number(p.amount || 0)), 0))}
          </span>
        </Card>
        {byMethod.map((g: any, i: number) => {
          const Icon = g.icon;
          return (
            <button
              key={i}
              onClick={() => setActiveMethod(activeMethod === g.key ? 'all' : g.key)}
              className={`flex flex-col gap-1 text-left ${activeMethod === g.key ? 'ring-2 ring-blue-400/50' : ''}`}
            >
              <div className="flex items-center gap-1.5">
                <Icon className={`w-3.5 h-3.5 ${g.color}`} />
                <span className={`text-[10px] font-medium uppercase ${g.color}`}>{g.label}</span>
              </div>
              <span className="text-lg font-bold text-text-primary">{formatCurrency(g.amount)}</span>
              <span className="text-[10px] text-text-muted">{g.count} transactions</span>
            </button>
          );
        })}
      </div>

      {/* Method filter + search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <select
          value={activeMethod}
          onChange={e => setActiveMethod(e.target.value)}
          className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-xs outline-none text-text-primary"
        >
          <option value="all">All Methods</option>
          {byMethod.map((g: any) => (
            <option key={g.key} value={g.key}>{g.label} ({formatCurrency(g.amount)})</option>
          ))}
        </select>
        <div className="flex items-center gap-2 px-3 h-9 bg-bg-secondary border border-border/50 rounded-lg w-full sm:max-w-sm">
          <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full text-xs bg-transparent outline-none placeholder:text-text-muted"
            placeholder="Search Transaction / Order ID / Method..."
          />
        </div>
      </div>

      <Card padding={false} className="border-border/50">
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
              {visibleByMethod.map((g: any) => {
                const Icon = g.icon;
                return [
                  <tr key={`grp-${g.key}`} className="bg-bg-tertiary/20">
                    <td colSpan={6} className="py-2 px-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.chip }} />
                          <Icon className={`w-3.5 h-3.5 ${g.color}`} />
                          <span className="font-bold text-text-primary capitalize">{g.label}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px]">
                          <span className="text-text-muted">{g.count} payments</span>
                          <span className="font-semibold text-text-primary">{formatCurrency(g.amount)}</span>
                        </div>
                      </div>
                    </td>
                  </tr>,
                  ...g.items.map((pay: any) => (
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
                          <Icon className={`w-3 h-3 ${g.color}`} />
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
                        <button className="text-blue-400 hover:text-blue-300 p-1.5" title="View Receipt"><CreditCard className="w-3.5 h-3.5" /></button>
                      </td>
                    </tr>
                  )),
                ];
              })}
              {visibleByMethod.length === 0 && (
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
