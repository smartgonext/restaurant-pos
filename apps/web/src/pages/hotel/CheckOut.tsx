import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  Search, LogOut, BedDouble, User, ArrowRight,
  Receipt, Info, X, CreditCard, CheckCircle2, Clock,
} from 'lucide-react';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import api from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { FolioSettlementModal } from './components/FolioSettlementModal';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Stay {
  id: number;
  status: string;
  checkInDatetime: string;
  checkOutDatetime: string | null;
  guest?: { name: string };
  room?: { roomNumber: string; roomType?: { name: string } };
  folioCharges?: any[];
  folioPayments?: any[];
}

export default function CheckOut() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedStayId, setSelectedStayId] = useState<number | null>(null);
  const [isFolioOpen, setIsFolioOpen] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['hotel', 'check-out', 'pending'],
    queryFn: () =>
      api.get('/restaurant/hotel/check-out/pending').then((r) => r.data),
    refetchInterval: 60_000,
  });

  const items: Stay[] = data?.data || [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        String(item.id).includes(q) ||
        (item.guest?.name || '').toLowerCase().includes(q) ||
        (item.room?.roomNumber || '').toLowerCase().includes(q)
    );
  }, [items, search]);

  const getBalanceDue = (stay: Stay): number => {
    const charges = (stay.folioCharges || []).reduce((s, c) => s + Number(c.amount || 0), 0);
    const payments = (stay.folioPayments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
    return Math.max(charges - payments, 0);
  };

  return (
    <>
      <div className="space-y-6 animate-in">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-card/50 backdrop-blur-md border border-border p-5 rounded-2xl shadow-xl shadow-black/10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <LogOut className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-text-primary tracking-tight">Hotel Check-Out</h1>
              <p className="text-sm text-text-muted mt-1 font-medium italic">
                Finalizing stays for departing guests
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                className="bg-bg-dark border border-border rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-red-500/50 outline-none transition-all w-full md:w-64"
                placeholder="Search stays..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="h-10 w-px bg-border hidden md:block" />
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black uppercase text-red-400 tracking-widest">Pending</span>
              <span className="text-xl font-black text-text-primary">{items.length}</span>
            </div>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-20 text-center border-dashed border-2 border-border/60 bg-bg-card/30 rounded-2xl">
            <div className="w-14 h-14 rounded-full border-2 border-border flex items-center justify-center mx-auto mb-4">
              <ArrowRight className="w-6 h-6 text-text-muted opacity-30" />
            </div>
            <h3 className="text-lg font-bold text-text-primary">No stays ready for check-out</h3>
            <p className="text-sm text-text-muted max-w-xs mx-auto mt-2">
              All departures have been completed or no guests are due today.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((item) => {
              const balance = getBalanceDue(item);
              return (
                <Card
                  key={item.id}
                  className="group overflow-hidden border-border/40 hover:border-red-500/40 rounded-2xl transition-all hover:shadow-2xl hover:shadow-red-500/5 bg-gradient-to-b from-bg-card/80 to-bg-card"
                >
                  <div className="p-5">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-[10px] font-mono font-bold text-text-muted tracking-widest uppercase mb-1">
                          STAY #{item.id}
                        </p>
                        <h3 className="text-lg font-black text-text-primary group-hover:text-red-400 transition-colors tracking-tight">
                          {item.guest?.name}
                        </h3>
                      </div>
                      <div className="w-10 h-10 rounded-xl bg-red-500/5 border border-red-500/10 flex items-center justify-center">
                        <BedDouble className="w-5 h-5 text-red-400/50" />
                      </div>
                    </div>

                    <div className="bg-bg-dark/50 p-3 rounded-xl border border-border/40 space-y-2 mb-5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-text-muted font-bold uppercase tracking-widest text-[9px]">Room</span>
                        <span className="text-text-primary font-black">
                          {item.room?.roomNumber}
                          <span className="text-[9px] text-text-muted ml-1 font-medium">
                            ({item.room?.roomType?.name || 'Standard'})
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-text-muted font-bold uppercase tracking-widest text-[9px] flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Check-in
                        </span>
                        <span className="text-text-primary font-bold text-[10px]">
                          {formatDate(item.checkInDatetime)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-text-muted font-bold uppercase tracking-widest text-[9px] flex items-center gap-1">
                          <Receipt className="w-3 h-3" /> Balance Due
                        </span>
                        <span className={`font-black text-sm ${balance > 0 ? 'text-red-400' : 'text-green-400'}`}>
                          {balance > 0 ? formatCurrency(balance) : 'Paid ✓'}
                        </span>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-border/40 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-text-muted">
                          Clear for Exit
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setSelectedStayId(item.id); setIsFolioOpen(true); }}
                        className="px-5 font-black uppercase tracking-widest text-[10px] border-red-500/20 hover:bg-red-500/10 text-red-400"
                      >
                        Check Out <ArrowRight className="w-3 h-3 ml-1.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Info Banner */}
        <div className="bg-red-500/5 border border-red-500/10 p-6 rounded-2xl flex flex-col md:flex-row items-center gap-6">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center shrink-0">
            <Info className="w-7 h-7 text-red-400" />
          </div>
          <div className="flex-1 text-center md:text-left">
            <h4 className="text-sm font-black text-text-primary uppercase tracking-tight">Folio Settlement Notice</h4>
            <p className="text-sm text-text-muted mt-1 font-medium">
              Ensure all room service, mini-bar, and extra charges are added to the folio before finalizing.
              The room will be marked Vacant Dirty and a housekeeping task will be auto-created.
            </p>
          </div>
        </div>
      </div>

      {/* Folio Settlement Modal */}
      <FolioSettlementModal
        isOpen={isFolioOpen}
        onClose={() => { setIsFolioOpen(false); setSelectedStayId(null); refetch(); }}
        stayId={selectedStayId}
        mode="checkout"
      />
    </>
  );
}