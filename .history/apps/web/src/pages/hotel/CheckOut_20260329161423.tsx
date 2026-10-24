import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Search, LogOut, BedDouble, User, ArrowRight, Receipt, Clock, Info } from 'lucide-react';
import api from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/utils';

interface Stay {
  id: number;
  guest?: { name?: string };
  room?: { roomNumber?: string; roomType?: { name?: string } };
  checkInDatetime: string;
  checkOutDatetime: string;
  totalCharges?: number;
}

export default function CheckOut() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['hotel', 'check-out', 'pending'],
    queryFn: async () => {
      const res = await api.get('/restaurant/hotel/dashboard/departures');
      return res.data;
    }
  });

  const checkOutMutation = useMutation({
    mutationFn: async (stayId: number) => {
      return api.post(`/restaurant/hotel/check-out/${stayId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel'] });
      toast({ title: 'Guest checked out successfully', description: 'Room is now Vacant Dirty and ready for housekeeping.' });
      refetch();
    },
    onError: (err: any) => {
       toast({ 
         title: 'Check-Out Failed', 
         description: err.response?.data?.error || 'Could not complete check-out.',
         variant: 'destructive'
       });
    }
  });

  const items: Stay[] = data?.data || [];

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const text = `${item.id} ${item.guest?.name || ''} ${item.room?.roomNumber || ''}`.toLowerCase();
      return text.includes(search.toLowerCase());
    });
  }, [items, search]);

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-card/50 backdrop-blur-md border border-border p-5 rounded-2xl shadow-xl shadow-black/10">
        <div className="flex items-center gap-4">
           <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <LogOut className="w-6 h-6 text-red-400" />
           </div>
           <div>
              <h1 className="text-2xl font-black text-text-primary tracking-tight">Departures & Folio Settlement</h1>
              <p className="text-sm text-text-muted mt-1 font-medium italic">Finalizing stays for guests departing today.</p>
           </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              className="bg-bg-dark border border-border rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-red-500/50 outline-none transition-all w-full md:w-64"
              placeholder="Search stays..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="h-10 w-px bg-border mx-2 hidden md:block" />
          <div className="flex flex-col items-end">
             <span className="text-[10px] font-black uppercase text-red-400 tracking-widest">Pending Clear</span>
             <span className="text-xl font-black text-text-primary">{items.length}</span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-56 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-20 text-center border-dashed border-2 border-border/60 bg-bg-card/30 rounded-2xl">
          <LogOut className="w-12 h-12 text-text-muted mx-auto mb-4 opacity-20" />
          <h3 className="text-lg font-bold text-text-primary">No pending check-outs</h3>
          <p className="text-sm text-text-muted max-w-xs mx-auto mt-2">All departures for today have been completed. Great work!</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((item) => (
            <Card key={item.id} className="group overflow-hidden border-border/40 hover:border-red-500/40 rounded-2xl transition-all hover:shadow-2xl hover:shadow-red-500/5 bg-gradient-to-b from-bg-card/80 to-bg-card">
              <div className="p-5">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-[10px] font-mono font-bold text-text-muted tracking-widest uppercase mb-1">Stay Identity #{item.id}</p>
                    <h3 className="text-lg font-black text-text-primary group-hover:text-red-400 transition-colors uppercase tracking-tight">{item.guest?.name}</h3>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-red-500/5 border border-red-500/10 flex items-center justify-center">
                     <BedDouble className="w-5 h-5 text-red-400/50" />
                  </div>
                </div>

                <div className="bg-bg-dark/50 p-3 rounded-xl border border-border/40 space-y-2 mb-6 transition-all group-hover:bg-bg-dark">
                   <div className="flex items-center justify-between text-xs">
                      <span className="text-text-muted font-bold uppercase tracking-widest text-[9px]">Assign Room</span>
                      <span className="text-text-primary font-black">{item.room?.roomNumber} <span className="text-[9px] text-text-muted italic ml-1 font-medium">({item.room?.roomType?.name || 'Deluxe'})</span></span>
                   </div>
                   <div className="flex items-center justify-between text-xs">
                      <span className="text-text-muted font-bold uppercase tracking-widest text-[9px]">Folio Balance</span>
                      <span className="text-red-400 font-extrabold flex items-center gap-1">
                        <Receipt className="w-3 h-3" /> {formatCurrency(item.totalCharges || 0)}
                      </span>
                   </div>
                </div>

                <div className="pt-4 border-t border-border/40 flex items-center justify-between">
                   <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase text-text-muted tracking-widest">Policy Check</span>
                      <p className="text-[10px] text-green-500/80 font-black italic">Clear for Exit</p>
                   </div>
                   <Button
                      size="sm"
                      variant="outline"
                      onClick={() => checkOutMutation.mutate(item.id)}
                      isLoading={checkOutMutation.isPending && checkOutMutation.variables === item.id}
                      className="px-6 font-black uppercase tracking-widest text-[10px] border-red-500/20 hover:bg-red-500/10 text-red-400 h-9"
                   >
                     Complete Check Out <ArrowRight className="w-3 h-3 ml-2" />
                   </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Warning Panel */}
      <div className="mt-12 bg-red-500/5 border border-red-500/10 p-6 rounded-2xl flex flex-col md:flex-row items-center gap-6">
         <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center shrink-0">
            <Info className="w-8 h-8 text-red-400" />
         </div>
         <div className="flex-1 text-center md:text-left">
            <h4 className="text-base font-black text-text-primary uppercase tracking-tight">Final Folio Settlement Notice</h4>
            <p className="text-sm text-text-muted mt-1 font-medium italic">Ensure all pending room service charges, laundry, and mini-bar consumption are billed to the guest folio before finalizing the check-out process. Once finalized, the room will be marked for cleaning.</p>
         </div>
         <Button variant="ghost" className="font-bold text-xs uppercase tracking-widest text-text-muted hover:text-red-400">
            Export Folio
         </Button>
      </div>
    </div>
  );
}
