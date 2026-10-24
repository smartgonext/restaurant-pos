import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { BillReceipt } from '@/components/orders/BillReceipt';
import {
  X, Printer, XCircle, ArrowRight, CreditCard, Ban,
  CheckCircle2, Clock, ChefHat, UtensilsCrossed, Banknote,
  DollarSign
} from 'lucide-react';
import { formatCurrency, formatDateTime, cn, getStatusColor, resolveImageUrl } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const ORDER_STEPS = [
  { key: 'placed', label: 'Order Placed', icon: Clock },
  { key: 'confirmed', label: 'Confirmed', icon: CheckCircle2 },
  { key: 'preparing', label: 'Preparing', icon: ChefHat },
  { key: 'served', label: 'Served', icon: UtensilsCrossed },
  { key: 'paid', label: 'Paid', icon: Banknote },
];

const STATUS_ORDER = ['placed', 'confirmed', 'preparing', 'served', 'billed', 'paid'];

function getNextStatus(current: string) {
  const idx = STATUS_ORDER.indexOf(current);
  if (idx === -1 || idx >= STATUS_ORDER.length - 1) return null;
  return STATUS_ORDER[idx + 1];
}

interface OrderDetailPanelProps {
  orderId: number | null;
  open: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

export function OrderDetailPanel({ orderId, open, onClose, onUpdate }: OrderDetailPanelProps) {
  const [showBill, setShowBill] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [processing, setProcessing] = useState(false);

  const { data: order, isLoading, refetch } = useQuery({
    queryKey: ['order-detail', orderId],
    queryFn: () => api.get(`/restaurant/orders/${orderId}`).then((r) => r.data.data),
    enabled: !!orderId && open,
  });

  const updateStatus = async (status: string) => {
    try {
      await api.put(`/restaurant/orders/${orderId}`, { status });
      toast.success(`Order moved to ${status.replace('_', ' ')}`);
      refetch();
      onUpdate?.();
    } catch {
      toast.error('Failed to update status');
    }
  };

  const cancelOrder = async () => {
    if (!confirm('Are you sure you want to cancel this order?')) return;
    try {
      await api.post(`/restaurant/orders/${orderId}/cancel`, { reason: 'Cancelled by admin' });
      toast.success('Order cancelled');
      refetch();
      onUpdate?.();
    } catch {
      toast.error('Failed to cancel');
    }
  };

  const processPayment = async () => {
    if (!order) return;
    setProcessing(true);
    try {
      await api.post(`/restaurant/orders/${orderId}/payment`, {
        amount: Number(order.total),
        method: paymentMethod,
      });
      toast.success('Payment processed! Order is PAID');
      setShowPayment(false);
      refetch();
      onUpdate?.();
    } catch {
      toast.error('Payment failed');
    } finally {
      setProcessing(false);
    }
  };

  if (!open) return null;

  const settings = (globalThis as any).__RESTAURANT_SETTINGS__ || {};
  const sgstRate = Number(settings.sgstRate ?? 2.5);
  const cgstRate = Number(settings.cgstRate ?? 2.5);

  const nextStatus = order ? getNextStatus(order.status) : null;
  const items = order?.flatItems || [];
  const isCancelled = order?.status === 'cancelled';
  const isPaid = order?.status === 'paid';

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0	h-full w-full max-w-[480px] bg-bg-secondary border-l border-border z-50 flex flex-col shadow-2, overflow-hidden animate-in slide-in-from-right">

        {/* Header */}
        <div className="p-5 border-b border-border/50 bg-bg-tertiary/30 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-black text-text-primary uppercase tracking-tighter">
                Order #{order?.orderNumber?.split('-')[1] || '...'}
              </h2>
              {order && (
                <Badge className={cn(getStatusColor(order.status), 'uppercase font-black text-[9px]')}>
                  {order.status === 'paid' ? 'PAID' : order.status}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-text-muted font-mono">
                {order ? formatDateTime(order.createdAt) : ''}
              </span>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-hover transition-all">
                <X size={18} className="text-text-muted" />
              </button>
            </div>
          </div>

          {/* Customer / Waiter Info */}
          {order && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-text-primary">{order.customer?.name || 'Walk-in Guest'}</p>
                <p className="text-[10px] text-text-muted">{order.type?.replace('_', ' ')} • Table {order.table?.name || '—'}</p>
              </div>
              {order.staff && (
                <div className="flex items-center gap-2 bg-bg-tertiary/40 px-3 py-1.5 rounded-xl border border-border/50">
                  <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-[8px] font-black flex items-center justify-center">
                    {order.staff.name?.[0]}
                  </div>
                  <span className="text-[10px] font-bold text-text-secondary">{order.staff.name}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Status Stepper */}
        {order && !isCancelled && (
          <div className="px-5 py-4 border-b border-border/50 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-text-muted tracking-widest">Set Order Status</span>
              <Badge className={cn(getStatusColor(order.status), 'uppercase font-bold text-[9px]')}>
                {order.status.replace('_', ' ')}
              </Badge>
            </div>
            <div className="flex items-center justify-between mt-4 gap-1">
              {ORDER_STEPS.map((step, idx) => {
                const stepIndex = STATUS_ORDER.indexOf(step.key);
                const currentIndex = STATUS_ORDER.indexOf(order.status);
                const isCompleted = stepIndex <= currentIndex;
                const isCurrent = step.key === order.status;
                const StepIcon = step.icon;

                return (
                  <div key={step.key} className="flex items-center flex-1">
                    <div className="flex flex-col items-center gap-1 flex-1">
                      <div
                        className={cn(
                          'w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all',
                          isCompleted
                            ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/30'
                            : 'border-border bg-bg-tertiary text-text-muted'
                        )}
                      >
                        <StepIcon size={14} />
                      </div>
                    </div>
                    {idx < ORDER_STEPS.length - 1 && (
                      <div className={cn('h-0.5 flex-1 -mx-1', isCompleted ? 'bg-blue-600' : 'bg-border')} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {order && !isPaid && !isCancelled && (
          <div className="px-5 py-3 border-b border-border/50 flex gap-2 shrink-0">
            <button
              onClick={cancelOrder}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-danger/10 border border-danger/30 text-danger text-[11px] font-bold hover:bg-danger/20 transition-all"
            >
              <Ban size={14} /> Cancel Order
            </button>
            {nextStatus && (
              <button
                onClick={() => updateStatus(nextStatus)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
              >
                Move to {nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)} <ArrowRight size={14} />
              </button>
            )}
          </div>
        )}

        {/* Items Table */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-10 text-center text-text-muted text-sm">Loading order details...</div>
          ) : (
            <div className="p-5">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-text-muted font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2 text-left">Item Name</th>
                    <th className="py-2 text-center w-12">Qty</th>
                    <th className="py-2 text-right w-20">Price</th>
                    <th className="py-2 text-right w-20">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {items.map((item: any) => (
                    <tr key={item.id} className="group hover:bg-bg-tertiary/20">
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          {item.image && (
                            <img
                              src={resolveImageUrl(item.image)}
                              className="w-7 h-7 rounded-lg object-cover border border-border/50 shadow-sm"
                            />
                          )}
                          <span className="font-bold text-text-primary text-xs">{item.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-center font-black text-blue-400">{item.quantity}</td>
                      <td className="py-2.5 text-right text-text-secondary">{formatCurrency(item.price)}</td>
                      <td className="py-2.5 text-right font-bold text-text-primary">{formatCurrency(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div className="mt-4 p-4 bg-bg-tertiary/20 rounded-2xl border border-border/30 space-y-1.5 text-xs">
                <div className="flex justify-between text-text-muted">
                  <span>Items</span>
                  <span className="text-text-primary font-bold">{items.length}</span>
                </div>
                <div className="flex justify-between text-text-muted">
                  <span>Sub Total</span>
                  <span className="text-text-primary font-bold">{formatCurrency(Number(order?.subtotal || 0))}</span>
                </div>
                <div className="flex justify-between text-text-muted">
                  <span>SGST ({sgstRate}%)</span>
                  <span className="text-text-primary">{formatCurrency(Number(order?.sgst || 0))}</span>
                </div>
                <div className="flex justify-between text-text-muted">
                  <span>CGST ({cgstRate}%)</span>
                  <span className="text-text-primary">{formatCurrency(Number(order?.cgst || 0))}</span>
                </div>
                {Number(order?.discount || 0) > 0 && (
                  <div className="flex justify-between text-green-400">
                    <span>Discount</span>
                    <span>-{formatCurrency(Number(order?.discount || 0))}</span>
                  </div>
                )}
                <div className="border-t border-border/50 pt-2 mt-2 flex justify-between text-sm">
                  <span className="font-black text-text-primary uppercase">Total</span>
                  <span className="font-black text-white text-lg">{formatCurrency(Number(order?.total || 0))}</span>
                </div>
                {isPaid && order.payments?.length > 0 && (
                  <div className="flex justify-between text-text-muted mt-1">
                    <span>Balance Returned</span>
                    <span className="text-text-primary">{formatCurrency(0)}</span>
                  </div>
                )}
              </div>

              {/* Action Footer */}
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => setShowBill(true)}
                  className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl bg-bg-tertiary border border-border/50 hover:bg-bg-hover transition-all"
                >
                  <Printer size={18} className="text-text-muted" />
                  <span className="text-[10px] font-black uppercase text-text-primary">Print</span>
                </button>
                {!isPaid && !isCancelled && (
                  <>
                    <button
                      onClick={cancelOrder}
                      className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl bg-danger text-white hover:bg-danger/90 transition-all"
                    >
                      <XCircle size={18} />
                      <span className="text-[10px] font-black uppercase">Cancel</span>
                    </button>
                    <button
                      onClick={onClose}
                      className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl bg-bg-tertiary border border-border/50 hover:bg-bg-hover transition-all"
                    >
                      <X size={18} className="text-text-muted" />
                      <span className="text-[10px] font-black uppercase text-text-primary">Close</span>
                    </button>
                  </>
                )}
              </div>

              {/* Payment History */}
              {order?.payments?.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-[10px] font-black uppercase text-text-muted tracking-widest mb-3">Payment History</h4>
                  <div className="bg-bg-tertiary/20 rounded-xl border border-border/30 overflow-hidden">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b border-border/50 text-text-muted font-bold uppercase text-[9px]">
                          <th className="py-2 px-3 text-left">Amount</th>
                          <th className="py-2 px-3 text-left">Payment Method</th>
                          <th className="py-2 px-3 text-right">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.payments.map((p: any) => (
                          <tr key={p.id} className="border-t border-border/20">
                            <td className="py-2 px-3 font-bold text-text-primary">{formatCurrency(Number(p.amount))}</td>
                            <td className="py-2 px-3 capitalize text-text-secondary">{p.method}</td>
                            <td className="py-2 px-3 text-right text-text-muted text-[10px]">
                              {p.paidAt ? formatDateTime(p.paidAt) : 'Due'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Payment Button (if order is billed or served) */}
              {!isPaid && !isCancelled && ['served', 'billed'].includes(order?.status || '') && (
                <button
                  onClick={() => { setPaymentAmount(String(Number(order?.total || 0))); setShowPayment(true); }}
                  className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 text-white font-black text-sm uppercase hover:bg-green-700 transition-all shadow-lg shadow-green-500/20"
                >
                  <CreditCard size={16} /> Process Payment
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bill Modal */}
      <Modal open={showBill} onClose={() => setShowBill(false)} title="Bill Receipt" size="lg">
        {order && <BillReceipt order={order} onClose={() => setShowBill(false)} />}
      </Modal>

      {/* Payment Modal */}
      <Modal open={showPayment} onClose={() => setShowPayment(false)} title="Process Payment" size="md">
        <div className="space-y-6">
          <div className="text-center">
            <p className="text-[10px] font-black uppercase text-text-muted tracking-widest">Amount Due</p>
            <p className="text-4xl font-black text-white mt-1">{formatCurrency(Number(order?.total || 0))}</p>
          </div>

          {/* Quick Amounts */}
          <div className="flex gap-2 justify-center">
            {[50, 100, 500, 1000].map((amt) => (
              <button
                key={amt}
                onClick={() => setPaymentAmount(String(amt))}
                className={cn(
                  'px-4 py-2 rounded-xl text-xs font-bold border transition-all',
                  paymentAmount === String(amt)
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-bg-tertiary border-border/50 text-text-muted hover:text-white'
                )}
              >
                ${amt}
              </button>
            ))}
          </div>

          {/* Payment Method */}
          <div>
            <label className="text-[10px] font-black uppercase text-text-muted mb-2 block">Payment Method</label>
            <div className="grid grid-cols-5 gap-2">
              {[
                { id: 'cash', label: 'Cash', icon: '💵' },
                { id: 'upi', label: 'UPI', icon: '📱' },
                { id: 'card', label: 'Card', icon: '💳' },
                { id: 'bank', label: 'Bank', icon: '🏦' },
                { id: 'due', label: 'Due', icon: '📝' },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setPaymentMethod(m.id)}
                  className={cn(
                    'flex flex-col items-center gap-1 py-3 rounded-xl border-2 text-xs font-bold transition-all',
                    paymentMethod === m.id
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                      : 'border-border bg-bg-tertiary text-text-muted hover:text-white'
                  )}
                >
                  <span className="text-xl">{m.icon}</span>
                  <span className="text-[9px] uppercase font-black">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Change Calculation */}
          {paymentMethod !== 'due' && (
            <div className="p-3 bg-bg-tertiary/30 rounded-xl border border-border/30">
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">Change:</span>
                <span className="font-bold text-success">
                  {formatCurrency(Math.max(0, Number(paymentAmount || 0) - Number(order?.total || 0)))}
                </span>
              </div>
            </div>
          )}

          <button
            onClick={processPayment}
            disabled={processing}
            className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-black text-sm uppercase transition-all shadow-lg shadow-green-500/20 disabled:opacity-50"
          >
            {processing ? 'Processing...' : 'Process Payment'}
          </button>
        </div>
      </Modal>
    </>
  );
}
