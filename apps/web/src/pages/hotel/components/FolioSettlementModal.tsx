import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { Receipt, CreditCard, Banknote, Landmark, CheckCircle2, AlertCircle, Printer } from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';

interface FolioSettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  stayId: number | null;
  mode: 'checkout' | 'view'; // checkout allows payment and completes stay, view is read-only
}

export function FolioSettlementModal({ isOpen, onClose, stayId, mode }: FolioSettlementModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState('cash');

  const { data, isLoading } = useQuery({
    queryKey: ['hotel', 'folio', stayId],
    queryFn: async () => {
      if (!stayId) return null;
      const res = await api.get(`/restaurant/hotel/check-out/${stayId}/folio`);
      return res.data;
    },
    enabled: !!stayId && isOpen,
  });

  const folio = data?.data;

  useEffect(() => {
    if (folio?.summary?.balance_due !== undefined && mode === 'checkout') {
      setPaymentAmount(folio.summary.balance_due.toString());
    }
  }, [folio, mode]);

  const checkOutMutation = useMutation({
    mutationFn: async () => {
      return api.post(`/restaurant/hotel/check-out/${stayId}`, {
        paymentAmount: Number(paymentAmount) || 0,
        paymentMethod,
        notes: 'Final settlement on checkout'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel'] });
      toast({ 
        title: 'Check-out Complete', 
        description: 'Folio settled and room status updated.',
      });
      onClose();
    },
    onError: (err: any) => {
      toast({ 
        title: 'Check-Out Failed', 
        description: err.response?.data?.error || 'Could not process settlement.',
        variant: 'destructive'
      });
    }
  });

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'checkout' ? "Folio Settlement & Check-Out" : "Folio Review"}
      size="lg"
    >
      {isLoading || !folio ? (
        <div className="space-y-4 p-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-6 p-2">
          {/* Left Column: Charges & Payments */}
          <div className="flex-1 space-y-6">
            <div className="space-y-2">
              <h3 className="text-[10px] font-black uppercase text-text-muted tracking-widest flex items-center gap-2">
                <Receipt className="w-3.5 h-3.5" /> Itemized Charges
              </h3>
              <div className="bg-bg-dark/50 border border-border rounded-xl max-h-60 overflow-y-auto overflow-hidden">
                {folio.charges?.length === 0 ? (
                  <p className="p-4 text-center text-sm text-text-muted italic">No charges recorded.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-bg-dark/80 text-[9px] uppercase tracking-wider text-text-muted border-b border-border">
                      <tr>
                        <th className="text-left py-2 px-4">Date</th>
                        <th className="text-left py-2 px-4">Description</th>
                        <th className="text-right py-2 px-4">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {folio.charges.map((charge: any) => (
                        <tr key={charge.id} className="hover:bg-bg-card/50">
                          <td className="py-2 px-4 text-xs text-text-muted">{formatDateTime(charge.chargeDate).split(' ')[0]}</td>
                          <td className="py-2 px-4 font-medium text-text-primary">{charge.description}</td>
                          <td className="py-2 px-4 text-right font-black text-red-400">{formatCurrency(charge.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {folio.payments?.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-[10px] font-black uppercase text-text-muted tracking-widest">Applied Payments</h3>
                <div className="bg-bg-dark/50 border border-border rounded-xl max-h-32 overflow-y-auto">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-border/50">
                      {folio.payments.map((payment: any) => (
                        <tr key={payment.id} className="hover:bg-bg-card/50">
                          <td className="py-2 px-4 text-xs text-text-muted">{formatDateTime(payment.paymentDate).split(' ')[0]}</td>
                          <td className="py-2 px-4 capitalize font-medium text-text-primary">
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0">{payment.paymentMethod}</Badge> {payment.notes || 'Payment'}
                          </td>
                          <td className="py-2 px-4 text-right font-black text-green-500">{formatCurrency(payment.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Summary & Payment Form */}
          <div className="w-full md:w-80 flex flex-col gap-6">
            <div className="bg-bg-dark border border-border rounded-2xl p-5 space-y-4">
              <h3 className="text-[11px] font-black uppercase text-text-muted tracking-widest text-center border-b border-border/50 pb-2">Billing Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center text-text-secondary">
                  <span>Subtotal</span>
                  <span className="font-bold">{formatCurrency(folio.summary.subtotal)}</span>
                </div>
                <div className="flex justify-between items-center text-text-secondary">
                  <span>Total Paid</span>
                  <span className="font-bold text-green-500">-{formatCurrency(folio.summary.total_paid)}</span>
                </div>
                <div className="h-px bg-border/60 my-2" />
                <div className="flex justify-between items-center text-lg">
                  <span className="font-black text-text-primary">Balance Due</span>
                  <span className="font-black text-red-400">{formatCurrency(folio.summary.balance_due)}</span>
                </div>
              </div>
            </div>

            {mode === 'checkout' && folio.summary.balance_due > 0 && (
              <div className="space-y-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl p-5">
                <h3 className="text-[11px] font-black uppercase text-text-primary tracking-widest">Settle Balance</h3>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-[9px] uppercase text-text-muted font-bold tracking-wider">Payment Method</Label>
                    <div className="grid grid-cols-2 gap-2">
                       <Button 
                         type="button" 
                         variant="outline" 
                         onClick={() => setPaymentMethod('cash')}
                         className={`h-9 text-xs font-bold border-border/50 ${paymentMethod === 'cash' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' : ''}`}
                       >
                         <Banknote className="w-3.5 h-3.5 mr-1.5" /> Cash
                       </Button>
                       <Button 
                         type="button" 
                         variant="outline" 
                         onClick={() => setPaymentMethod('card')}
                         className={`h-9 text-xs font-bold border-border/50 ${paymentMethod === 'card' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' : ''}`}
                       >
                         <CreditCard className="w-3.5 h-3.5 mr-1.5" /> Card
                       </Button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[9px] uppercase text-text-muted font-bold tracking-wider">Amount Received</Label>
                    <Input 
                      type="number" 
                      value={paymentAmount}
                      onChange={e => setPaymentAmount(e.target.value)}
                      className="font-mono font-bold text-right"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>
            )}

            {mode === 'checkout' && folio.summary.balance_due <= 0 && paymentAmount === "0" && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-5 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto" />
                  <p className="text-sm font-bold text-green-500">Folio is fully settled.</p>
                  <p className="text-[10px] text-text-muted italic">Ready for check-out.</p>
                </div>
            )}

            <div className="mt-auto flex flex-col gap-3">
              {mode === 'checkout' ? (
                <>
                  {folio.summary.balance_due > 0 && Number(paymentAmount) < folio.summary.balance_due && (
                     <div className="flex items-start gap-2 text-[10px] text-amber-500 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>Checking out without full payment will leave an outstanding balance on this folio.</span>
                     </div>
                  )}
                  <Button 
                    variant="primary" 
                    className="w-full font-black uppercase tracking-widest text-[10px] h-11"
                    isLoading={checkOutMutation.isPending}
                    onClick={() => checkOutMutation.mutate()}
                  >
                    Confirm & Check Out
                  </Button>
                  <Button variant="ghost" onClick={onClose} className="w-full font-bold text-xs">Cancel</Button>
                </>
              ) : (
                <div className="space-y-3">
                  <Button variant="outline" onClick={() => window.print()} className="w-full font-black uppercase tracking-widest text-[10px] h-11 border-blue-500/20 hover:bg-blue-500/10 text-blue-400">
                    <Printer className="w-4 h-4 mr-2" /> Print Folio
                  </Button>
                  <Button variant="primary" onClick={onClose} className="w-full font-black uppercase tracking-widest text-[10px] h-11">Close Review</Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
