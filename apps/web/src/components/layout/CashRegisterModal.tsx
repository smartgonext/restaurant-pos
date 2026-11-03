import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Landmark, CheckCircle2, AlertCircle, ArrowUpRight, ArrowDownLeft, X, RefreshCcw, Clock, Lock, Unlock } from 'lucide-react';

interface CashRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CashRegisterModal({ isOpen, onClose }: CashRegisterModalProps) {
  const queryClient = useQueryClient();
  const [openingBalance, setOpeningBalance] = useState<string>('1000');
  const [openNotes, setOpenNotes] = useState<string>('');

  const [closingBalance, setClosingBalance] = useState<string>('');
  const [closeNotes, setCloseNotes] = useState<string>('');

  const [cashInOutType, setCashInOutType] = useState<'cash_in' | 'cash_out'>('cash_in');
  const [cashInOutAmount, setCashInOutAmount] = useState<string>('');
  const [cashInOutReason, setCashInOutReason] = useState<string>('');
  const [showCashInOut, setShowCashInOut] = useState<boolean>(false);

  // Fetch Current Register Session
  const { data: sessionData, isLoading, refetch } = useQuery({
    queryKey: ['cash-register-session'],
    queryFn: () => api.get('/restaurant/cash-register/session').then(r => r.data.data),
    enabled: isOpen,
  });

  // Open Session Mutation
  const openSessionMutation = useMutation({
    mutationFn: (data: { openingBalance: number; notes: string }) =>
      api.post('/restaurant/cash-register/open', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-register-session'] });
      queryClient.invalidateQueries({ queryKey: ['reports', 'cash-register'] });
      refetch();
    },
  });

  // Close Session Mutation
  const closeSessionMutation = useMutation({
    mutationFn: (data: { closingBalance?: number; notes: string }) =>
      api.post('/restaurant/cash-register/close', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-register-session'] });
      queryClient.invalidateQueries({ queryKey: ['reports', 'cash-register'] });
      refetch();
    },
  });

  // Cash In / Out Mutation
  const cashInOutMutation = useMutation({
    mutationFn: (data: { type: string; amount: number; reason: string }) =>
      api.post('/restaurant/cash-register/cash-in-out', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-register-session'] });
      setCashInOutAmount('');
      setCashInOutReason('');
      setShowCashInOut(false);
      refetch();
    },
  });

  if (!isOpen) return null;

  const session = sessionData;
  const isSessionOpen = Boolean(session && session.status === 'open');

  const handleOpenShift = (e: React.FormEvent) => {
    e.preventDefault();
    const balance = parseFloat(openingBalance) || 0;
    openSessionMutation.mutate({ openingBalance: balance, notes: openNotes || 'Morning shift open' });
  };

  const handleCloseShift = (e: React.FormEvent) => {
    e.preventDefault();
    const balance = closingBalance !== '' ? parseFloat(closingBalance) : session?.expectedCash;
    closeSessionMutation.mutate({ closingBalance: balance, notes: closeNotes || 'Shift closed' });
  };

  const handleCashInOut = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(cashInOutAmount);
    if (!amount || amount <= 0) return;
    cashInOutMutation.mutate({ type: cashInOutType, amount, reason: cashInOutReason });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-bg-secondary border border-border rounded-2xl shadow-2xl overflow-hidden text-text-primary">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-bg-tertiary/40">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${isSessionOpen ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                Cash Register Control
                {isSessionOpen ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Shift Active
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 font-semibold border border-rose-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span> Shift Closed
                  </span>
                )}
              </h2>
              <p className="text-xs text-text-muted">Morning float balance, daytime sales & shift close</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCcw className="w-6 h-6 animate-spin text-emerald-400" />
            </div>
          ) : isSessionOpen ? (
            /* OPEN SESSION DISPLAY & CLOSE OPTIONS */
            <div className="space-y-5">
              
              {/* Session Live Stat Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-bg-tertiary/60 border border-border">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Opening Float</p>
                  <p className="text-base font-bold text-blue-400 mt-1">{formatCurrency(session.openingBalance)}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-bg-tertiary/60 border border-border">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Cash Sales Today</p>
                  <p className="text-base font-bold text-emerald-400 mt-1">+{formatCurrency(session.totalCashReceived || 0)}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Expected Cash</p>
                  <p className="text-base font-bold text-emerald-400 mt-1">{formatCurrency(session.expectedCash || session.openingBalance)}</p>
                </div>
              </div>

              {/* Session Details */}
              <div className="p-3.5 rounded-xl bg-bg-tertiary/30 border border-border/50 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-text-muted flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-text-muted" /> Opened At</span>
                  <span className="font-mono text-text-secondary">{new Date(session.openedAt).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-muted flex items-center gap-1.5"><Unlock className="w-3.5 h-3.5 text-text-muted" /> Cashier</span>
                  <span className="font-semibold text-text-primary">{session.cashier?.name || 'Main Cashier'}</span>
                </div>
              </div>

              {/* Quick Actions (Cash In / Out toggle) */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowCashInOut(!showCashInOut)}
                  className="w-full text-xs font-semibold py-2 px-3 rounded-lg border border-border bg-bg-tertiary hover:bg-bg-hover text-text-secondary flex items-center justify-between transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" /> Log Cash In / Out (Float / Petty Expense)
                  </span>
                  <span>{showCashInOut ? '▲ Hide' : '▼ Expand'}</span>
                </button>

                {showCashInOut && (
                  <form onSubmit={handleCashInOut} className="mt-3 p-3.5 rounded-xl bg-bg-tertiary/50 border border-border space-y-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCashInOutType('cash_in')}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1 transition-colors ${cashInOutType === 'cash_in' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-bg-secondary text-text-muted'}`}
                      >
                        <ArrowDownLeft className="w-3.5 h-3.5" /> Cash In (+Float)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCashInOutType('cash_out')}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1 transition-colors ${cashInOutType === 'cash_out' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'bg-bg-secondary text-text-muted'}`}
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" /> Cash Out (-Expense)
                      </button>
                    </div>

                    <div>
                      <input
                        type="number"
                        placeholder="Amount (₹)"
                        value={cashInOutAmount}
                        onChange={e => setCashInOutAmount(e.target.value)}
                        className="glass-input w-full text-xs py-2 px-3"
                        required
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Reason (e.g. Milk purchase, Added change float)"
                        value={cashInOutReason}
                        onChange={e => setCashInOutReason(e.target.value)}
                        className="glass-input w-full text-xs py-2 px-3"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={cashInOutMutation.isPending}
                      className="w-full py-2 bg-gradient-primary text-white text-xs font-bold rounded-lg hover:opacity-90 transition-opacity"
                    >
                      {cashInOutMutation.isPending ? 'Logging...' : 'Save Cash Entry'}
                    </button>
                  </form>
                )}
              </div>

              <hr className="border-border" />

              {/* Close Shift Form */}
              <form onSubmit={handleCloseShift} className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-rose-400" /> End Shift / Close Register
                </h3>

                <div>
                  <label className="text-xs font-medium text-text-muted block mb-1">
                    Counted Closing Cash (Leave blank to use Expected {formatCurrency(session.expectedCash)})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder={`Expected: ₹${session.expectedCash || session.openingBalance}`}
                    value={closingBalance}
                    onChange={e => setClosingBalance(e.target.value)}
                    className="glass-input w-full text-sm py-2 px-3 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-text-muted block mb-1">Shift Notes / Remarks</label>
                  <input
                    type="text"
                    placeholder="e.g. Balanced shift, Night close"
                    value={closeNotes}
                    onChange={e => setCloseNotes(e.target.value)}
                    className="glass-input w-full text-xs py-2 px-3"
                  />
                </div>

                <button
                  type="submit"
                  disabled={closeSessionMutation.isPending}
                  className="w-full py-3 bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-500/20 flex items-center justify-center gap-2 transition-all"
                >
                  {closeSessionMutation.isPending ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  Close Register Session
                </button>
              </form>
            </div>
          ) : (
            /* CLOSED SESSION — START NEW SHIFT FORM */
            <form onSubmit={handleOpenShift} className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-sm">
                  <CheckCircle2 className="w-4 h-4" /> Start Morning Cash Register Shift
                </p>
                <p className="text-emerald-400/80">Enter the morning float cash placed in the register drawer to begin processing cash orders.</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-text-secondary block mb-1.5">
                  Morning Opening Balance (Float Cash ₹) *
                </label>
                <input
                  type="number"
                  step="1"
                  required
                  placeholder="1000"
                  value={openingBalance}
                  onChange={e => setOpeningBalance(e.target.value)}
                  className="glass-input w-full text-base py-2.5 px-3 font-mono font-bold text-emerald-400"
                />
                <p className="text-[10px] text-text-muted mt-1">Default change float is ₹1,000</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-text-secondary block mb-1.5">Shift Notes / Opening Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. Morning shift start - Main cashier"
                  value={openNotes}
                  onChange={e => setOpenNotes(e.target.value)}
                  className="glass-input w-full text-xs py-2 px-3"
                />
              </div>

              <button
                type="submit"
                disabled={openSessionMutation.isPending}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all"
              >
                {openSessionMutation.isPending ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                Open Register Session
              </button>
            </form>
          )}
        </div>

      </div>
    </div>
  );
}
