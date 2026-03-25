import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { 
  Calculator, 
  History, 
  ArrowRightCircle, 
  ArrowLeftCircle,
  AlertCircle,
  Banknote,
  CheckCircle2
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function CashRegister() {
  const queryClient = useQueryClient();
  const [openingBalance, setOpeningBalance] = useState('');
  const [closingBalance, setClosingBalance] = useState('');
  const [notes, setNotes] = useState('');

  const { data: session, isLoading } = useQuery({
    queryKey: ['cash-register', 'session'],
    queryFn: () => api.get('/restaurant/cash-register/session').then(r => r.data.data)
  });

  const { data: history } = useQuery({
    queryKey: ['cash-register', 'history'],
    queryFn: () => api.get('/restaurant/cash-register/history').then(r => r.data.data)
  });

  const openMutation = useMutation({
    mutationFn: (data: any) => api.post('/restaurant/cash-register/open', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-register'] });
      toast.success('Register opened');
      setOpeningBalance('');
      setNotes('');
    }
  });

  const closeMutation = useMutation({
    mutationFn: (data: any) => api.post('/restaurant/cash-register/close', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-register'] });
      toast.success('Register closed');
      setClosingBalance('');
      setNotes('');
    }
  });

  if (isLoading) return <div className="p-8 text-center text-text-muted">Loading...</div>;

  return (
    <div className="space-y-4 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Cash Register</h1>
          <p className="text-xs text-text-muted mt-1">Manage daily cash flow and sessions</p>
        </div>
        {session ? (
           <Badge variant="success" size="sm">Active</Badge>
        ) : (
           <Badge variant="warning" size="sm">Closed</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 space-y-4">
          {!session ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-primary">
                <ArrowRightCircle className="w-5 h-5" />
                <h3 className="text-lg font-bold">New Session</h3>
              </div>
              <p className="text-text-secondary text-xs">Set starting cash balance.</p>
              
              <div className="space-y-3 pt-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-text-muted uppercase">Opening Balance</label>
                  <div className="relative">
                    <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
                    <input 
                      type="number" 
                      value={openingBalance}
                      onChange={(e) => setOpeningBalance(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-bg-secondary border border-border rounded-lg py-2 pl-9 pr-3 outline-none focus:ring-1 focus:ring-primary/20 transition-all font-semibold text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-text-muted uppercase">Notes</label>
                  <textarea 
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-bg-secondary border border-border rounded-lg py-2 px-3 outline-none focus:ring-1 focus:ring-primary/20 transition-all h-16 text-xs resize-none"
                    placeholder="Optional details..."
                  />
                </div>
                <Button 
                  className="w-full" 
                  loading={openMutation.isPending}
                  onClick={() => openMutation.mutate({ openingBalance, notes })}
                  disabled={!openingBalance}
                  size="sm"
                >
                  Open Register
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border/50 pb-4">
                 <div className="flex items-center gap-2 text-success">
                    <CheckCircle2 className="w-5 h-5" />
                    <h3 className="text-lg font-bold">Open</h3>
                 </div>
                 <div className="text-right">
                    <p className="text-[10px] text-text-muted uppercase tracking-wider">Started By</p>
                    <p className="text-xs font-semibold text-text-primary capitalize">{session.openedBy?.name}</p>
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-bg-tertiary/30 p-4 rounded-xl border border-border">
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-text-muted uppercase font-bold">Opening Cash</p>
                    <p className="text-xl font-bold text-text-primary">{formatCurrency(session.openingBalance)}</p>
                  </div>
                  <div className="space-y-0.5 text-right">
                    <p className="text-[10px] text-text-muted uppercase font-bold">Start Time</p>
                    <p className="text-sm font-semibold text-text-primary">
                      {new Date(session.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-border/50 mt-4">
                <div className="flex items-center gap-2 text-red-400">
                  <ArrowLeftCircle className="w-5 h-5" />
                  <h3 className="text-lg font-bold">End Session</h3>
                </div>
                
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-muted uppercase">Cash in Drawer</label>
                    <div className="relative">
                      <Calculator className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
                      <input 
                        type="number" 
                        value={closingBalance}
                        onChange={(e) => setClosingBalance(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-bg-secondary border border-border rounded-lg py-2 pl-9 pr-3 outline-none focus:ring-1 focus:ring-primary/20 transition-all font-semibold text-sm"
                      />
                    </div>
                  </div>
                  <Button 
                    variant="danger" 
                    className="w-full" 
                    loading={closeMutation.isPending}
                    onClick={() => closeMutation.mutate({ closingBalance, notes })}
                    disabled={!closingBalance}
                    size="sm"
                  >
                    Close Session
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>

        <div className="space-y-4">
           <Card className="space-y-3">
             <div className="flex items-center gap-2 text-text-primary border-b border-border/50 pb-2">
               <History className="w-4 h-4" />
               <h3 className="font-bold text-sm">History</h3>
             </div>
             
             <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
               {history?.map((s: any) => (
                 <div key={s.id} className="p-3 rounded-lg bg-bg-secondary/50 border border-border/30 hover:bg-bg-secondary transition-all">
                    <div className="flex items-center justify-between mb-1.5">
                       <span className={`text-[9px] font-bold uppercase ${s.status === 'OPEN' ? 'text-success' : 'text-text-muted'}`}>
                          {s.status}
                       </span>
                       <span className="text-[9px] text-text-muted font-medium">
                          {new Date(s.openedAt).toLocaleDateString()}
                       </span>
                    </div>
                    <div className="flex justify-between items-end">
                       <div>
                          <p className="text-[9px] text-text-muted">Net Change</p>
                          <p className={`text-xs font-bold text-text-primary`}>
                            {s.closingBalance ? formatCurrency(s.closingBalance - s.openingBalance) : '---'}
                          </p>
                       </div>
                       <div className="text-right">
                          <p className={`text-[10px] font-bold ${s.expectedBalance !== s.closingBalance ? 'text-red-400' : 'text-success'}`}>
                             {s.closingBalance ? formatCurrency(s.closingBalance) : 'Live'}
                          </p>
                       </div>
                    </div>
                 </div>
               ))}
               {!history?.length && (
                 <div className="text-center py-4">
                    <p className="text-[10px] text-text-muted italic">No sessions found</p>
                 </div>
               )}
             </div>
           </Card>

           <Card className="bg-blue-600/5 border-blue-500/10 p-3">
              <h4 className="text-blue-400 font-bold mb-1.5 flex items-center gap-1.5 text-xs">
                 <AlertCircle className="w-3.5 h-3.5" />
                 Pro Tip
              </h4>
              <p className="text-[10px] text-text-muted leading-relaxed">
                 Double-check physical cash before closing. Discrepancies are logged for auditing.
              </p>
           </Card>
        </div>
      </div>
    </div>
  );
}
