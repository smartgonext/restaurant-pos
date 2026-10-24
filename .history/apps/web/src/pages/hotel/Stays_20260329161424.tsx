import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Search, History, BedDouble, User, Calendar, Receipt, ArrowRight, Filter, Clock, CheckCircle2 } from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import api from '@/lib/api';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';

interface Stay {
  id: number;
  status: string;
  checkInDatetime: string;
  checkOutDatetime: string | null;
  guest?: { name?: string };
  room?: { roomNumber?: string; roomType?: { name?: string } };
  folioCharges?: Array<{ amount: number | string }>;
  folioPayments?: Array<{ amount: number | string }>;
}

export default function Stays() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['hotel', 'stays', statusFilter],
    queryFn: async () => {
      const res = await api.get('/restaurant/hotel/stays', {
        params: { status: statusFilter === 'all' ? undefined : statusFilter },
      });
      return res.data;
    }
  });

  const stays: Stay[] = data?.data || [];
  const filtered = useMemo(() => {
    const text = search.toLowerCase();
    return stays.filter((stay) => 
      `${stay.id} ${stay.room?.roomNumber || ''} ${stay.guest?.name || ''}`.toLowerCase().includes(text)
    );
  }, [stays, search]);

  const getBalance = (stay: Stay) => {
    const charges = (stay.folioCharges || []).reduce((sum, c) => sum + Number(c.amount || 0), 0);
    const payments = (stay.folioPayments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
    return charges - payments;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <Badge variant="info" className="text-[9px] font-black uppercase tracking-widest rounded-lg px-2">In House</Badge>;
      case 'checked_out': return <Badge variant="success" className="text-[9px] font-black uppercase tracking-widest rounded-lg px-2">Completed</Badge>;
      default: return <Badge variant="secondary" className="text-[9px] font-black uppercase tracking-widest rounded-lg px-2">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-card/50 backdrop-blur-md border border-border p-5 rounded-2xl shadow-xl shadow-black/10">
        <div className="flex items-center gap-4">
           <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <History className="w-6 h-6 text-blue-400" />
           </div>
           <div>
              <h1 className="text-2xl font-black text-text-primary tracking-tight">Stay & Billing History</h1>
              <p className="text-sm text-text-muted mt-1 font-medium italic">Complete record of guest stays and folio settlements</p>
           </div>
        </div>
        <div className="flex items-center gap-3">
           <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                className="bg-bg-dark border border-border rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-blue-500/50 outline-none transition-all w-full md:w-64"
                placeholder="Search stay#, room or guest..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
           </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-center bg-bg-card/30 p-4 rounded-xl border border-border/40">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-text-muted mr-2">
          <Filter className="w-3.5 h-3.5" /> Quick Filter:
        </div>
        <div className="flex gap-1 bg-bg-dark p-1 rounded-xl border border-border/40">
           {['all', 'active', 'checked_out'].map(s => (
             <button
               key={s}
               onClick={() => setStatusFilter(s)}
               className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${statusFilter === s ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-text-muted hover:text-text-primary'}`}
             >
               {s.replace('_', ' ')}
             </button>
           ))}
        </div>
      </div>

      <Card padding={false} className="overflow-hidden border-border/40 rounded-2xl shadow-xl bg-bg-card/50">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-dark/50 text-[10px] font-black uppercase tracking-[0.15em] text-text-muted">
                <th className="text-left py-4 px-6 italic">Stay Identity</th>
                <th className="text-left py-4 px-6 italic">Room / Unit</th>
                <th className="text-left py-4 px-6 italic">Primary Guest</th>
                <th className="text-left py-4 px-6 italic">Check-In / Out</th>
                <th className="text-left py-4 px-6 italic">Folio Balance</th>
                <th className="text-left py-4 px-6 italic">Status</th>
                <th className="text-right py-4 px-6 italic">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={7} className="p-4"><Skeleton className="h-10 w-full rounded-lg" /></td></tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center">
                    <div className="w-16 h-16 bg-bg-dark rounded-2xl flex items-center justify-center mx-auto mb-4 border border-border/60">
                      <History className="w-8 h-8 text-text-muted/50" />
                    </div>
                    <p className="text-text-muted font-bold italic">No stay records found matching your criteria.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((stay) => {
                  const balance = getBalance(stay);
                  return (
                    <tr key={stay.id} className="group hover:bg-blue-500/[0.02] transition-colors">
                      <td className="py-4 px-6">
                         <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-bg-dark border border-border flex items-center justify-center text-[10px] font-black group-hover:border-blue-500/40 transition-colors">
                               #{stay.id}
                            </div>
                            <span className="text-[10px] font-black text-text-muted font-mono tracking-widest uppercase">STAY-{stay.id}</span>
                         </div>
                      </td>
                      <td className="py-4 px-6 font-black text-text-primary text-sm tracking-tight">
                         <div className="flex items-center gap-2">
                            <BedDouble className="w-4 h-4 text-blue-400/50" />
                            {stay.room?.roomNumber || '—'}
                         </div>
                      </td>
                      <td className="py-4 px-6 font-bold text-text-secondary text-sm">
                         <div className="flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-blue-400/50" />
                            {stay.guest?.name || 'Walk-In'}
                         </div>
                      </td>
                      <td className="py-4 px-6">
                         <div className="flex flex-col gap-1 text-[10px] font-bold text-text-muted">
                            <div className="flex items-center gap-1.5 hover:text-text-primary transition-colors">
                               <CheckCircle2 className="w-3 h-3 text-green-500/50" />
                               {formatDateTime(stay.checkInDatetime)}
                            </div>
                            <div className="flex items-center gap-1.5 hover:text-text-primary transition-colors">
                               <Clock className="w-3 h-3 text-amber-500/50" />
                               {stay.checkOutDatetime ? formatDateTime(stay.checkOutDatetime) : 'In Progress'}
                            </div>
                         </div>
                      </td>
                      <td className="py-4 px-6">
                         <div className={`text-sm font-black tracking-tight ${balance > 0 ? 'text-red-400' : 'text-green-500'}`}>
                            {formatCurrency(balance)}
                         </div>
                      </td>
                      <td className="py-4 px-6">
                         {getStatusBadge(stay.status)}
                      </td>
                      <td className="py-4 px-6 text-right">
                         <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                            <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-blue-500/10 hover:text-blue-400">
                               <Receipt className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-blue-500/10 hover:text-blue-400">
                               <ArrowRight className="w-3.5 h-3.5" />
                            </Button>
                         </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
