import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Calendar, Search, LogIn, User, BedDouble, ArrowRight, Clock, ShieldCheck } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import api from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';

interface PendingReservation {
  id: number;
  reservationNumber: string;
  checkInDate: string;
  guest: { name: string };
  numberOfGuests: number;
  status: string;
  rooms?: Array<{ room?: { roomNumber?: string; roomType?: { name?: string } } }>;
}

export default function CheckIn() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['hotel', 'check-in', 'pending'],
    queryFn: async () => {
      const res = await api.get('/restaurant/hotel/dashboard/arrivals');
      return res.data;
    }
  });

  const checkInMutation = useMutation({
    mutationFn: async (reservationId: number) => {
      return api.post(`/restaurant/hotel/check-in/${reservationId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel'] });
      toast({ title: 'Guest checked in successfully', description: 'Room status updated to Occupied.' });
      refetch();
    },
    onError: (err: any) => {
       toast({ 
         title: 'Check-In Failed', 
         description: err.response?.data?.error || 'Could not complete check-in.',
         variant: 'destructive'
       });
    }
  });

  const items: PendingReservation[] = data?.data || [];

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const text = `${item.reservationNumber} ${item.guest?.name || ''}`.toLowerCase();
      // On the dashboard arrivals call, it might already be filtered by date.
      return text.includes(search.toLowerCase());
    });
  }, [items, search]);

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-card/50 backdrop-blur-md border border-border p-5 rounded-2xl shadow-xl shadow-black/10">
        <div className="flex items-center gap-4">
           <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <LogIn className="w-6 h-6 text-blue-400" />
           </div>
           <div>
              <h1 className="text-2xl font-black text-text-primary tracking-tight">Arrivals & Check-In</h1>
              <p className="text-sm text-text-muted mt-1 font-medium italic">Processing expected guests for {formatDate(new Date().toISOString())}</p>
           </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              className="bg-bg-dark border border-border rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-blue-500/50 outline-none transition-all w-full md:w-64"
              placeholder="Search arrivals..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="h-10 w-px bg-border mx-2 hidden md:block" />
          <div className="flex flex-col items-end">
             <span className="text-[10px] font-black uppercase text-blue-400 tracking-widest">Expected Today</span>
             <span className="text-xl font-black text-text-primary">{items.length}</span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-20 text-center border-dashed border-2 border-border/60 bg-bg-card/30 rounded-2xl">
          <Calendar className="w-12 h-12 text-text-muted mx-auto mb-4 opacity-20" />
          <h3 className="text-lg font-bold text-text-primary">No pending arrivals</h3>
          <p className="text-sm text-text-muted max-w-xs mx-auto mt-2">All guests for today have been processed or no arrivals are scheduled.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filtered.map((item) => (
            <Card key={item.id} className="group overflow-hidden border-border/40 hover:border-blue-500/40 rounded-2xl transition-all hover:shadow-2xl hover:shadow-blue-500/5 bg-gradient-to-b from-bg-card/80 to-bg-card">
              <div className="p-5">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-[10px] font-mono font-bold text-text-muted tracking-widest uppercase mb-1">{item.reservationNumber}</p>
                    <h3 className="text-lg font-black text-text-primary group-hover:text-blue-400 transition-colors uppercase tracking-tight">{item.guest?.name}</h3>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-blue-500/5 border border-blue-500/10 flex items-center justify-center">
                     <User className="w-5 h-5 text-blue-400/50" />
                  </div>
                </div>

                <div className="space-y-2 mb-6">
                   <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-text-muted font-bold uppercase tracking-widest text-[9px]">
                         <BedDouble className="w-3.5 h-3.5" /> Room Assignment
                      </span>
                      <span className="text-text-primary font-black">
                         {item.rooms?.[0]?.room?.roomNumber || 'TBD'} 
                         <span className="text-[9px] text-text-muted ml-1 italic">({item.rooms?.[0]?.room?.roomType?.name || 'Standard'})</span>
                      </span>
                   </div>
                   <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-text-muted font-bold uppercase tracking-widest text-[9px]">
                         <Clock className="w-3.5 h-3.5" /> Check-in Window
                      </span>
                      <span className="text-text-primary font-black">Starts 2:00 PM</span>
                   </div>
                </div>

                <div className="pt-4 border-t border-border/40 flex items-center justify-between">
                   <div className="flex -space-x-2">
                       {Array.from({length: Math.min(item.numberOfGuests, 3)}).map((_, i) => (
                         <div key={i} className="w-6 h-6 rounded-full bg-bg-dark border border-border flex items-center justify-center text-[8px] font-black text-text-muted">
                           G
                         </div>
                       ))}
                       {item.numberOfGuests > 3 && (
                         <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-[8px] font-black text-blue-400">
                           +{item.numberOfGuests - 3}
                         </div>
                       )}
                   </div>
                   <Button
                      size="sm"
                      variant="primary"
                      onClick={() => checkInMutation.mutate(item.id)}
                      isLoading={checkInMutation.isPending && checkInMutation.variables === item.id}
                      className="px-6 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-blue-500/20"
                   >
                     Process Check In <ArrowRight className="w-3 h-3 ml-2" />
                   </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Quick Verification Panel */}
      <div className="mt-12 bg-blue-500/5 border border-blue-500/10 p-6 rounded-2xl flex flex-col md:flex-row items-center gap-6">
         <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-8 h-8 text-blue-400" />
         </div>
         <div className="flex-1 text-center md:text-left">
            <h4 className="text-base font-black text-text-primary uppercase tracking-tight">Identity Verification Protocol</h4>
            <p className="text-sm text-text-muted mt-1 font-medium italic">Please ensure all guests provide a valid government ID and a signed registration card before proceeding with digital check-in.</p>
         </div>
         <Button variant="outline" className="font-bold text-xs uppercase tracking-widest border-blue-500/20 hover:bg-blue-500/10 text-blue-400">
            View Protocol
         </Button>
      </div>
    </div>
  );
}
