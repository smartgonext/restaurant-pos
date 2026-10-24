import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ChefHat, Clock, Play, CheckCircle, XCircle, Printer, Utensils } from 'lucide-react';
import { cn, formatDateTime, resolveImageUrl } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const SERVER_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

const kotStatusColors: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-danger/10 border-danger/20', text: 'text-danger', label: 'PENDING' },
  in_kitchen: { bg: 'bg-blue-500/10 border-blue-500/20', text: 'text-blue-400', label: 'COOKING' },
  ready: { bg: 'bg-success/10 border-success/20', text: 'text-success', label: 'READY' },
  cancelled: { bg: 'bg-text-muted/10 border-text-muted/20', text: 'text-text-muted', label: 'CANCELLED' },
};

export default function KitchenKOT() {
  const { data: kots, isLoading, refetch } = useQuery({
    queryKey: ['kitchen-kots'],
    queryFn: () => api.get('/restaurant/kots').then((r) => r.data.data),
    refetchInterval: 5000,
  });

  const updateKotStatus = async (id: number, status: string) => {
    try {
      await api.put(`/restaurant/kots/${id}/status`, { status });
      toast.success(`KOT updated to ${status}`);
      refetch();
    } catch { toast.error('Failed'); }
  };

  if (isLoading) return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>;

  return (
    <div className="space-y-4 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Kitchen Display (KOT)</h1>
          <p className="text-xs text-text-muted mt-0.5">{kots?.length || 0} active orders in kitchen</p>
        </div>
        <div className="flex gap-2">
           <Badge variant="info" dot className="animate-pulse">Live Updates</Badge>
           <Button variant="secondary" size="sm" icon={<Printer size={14} />}>Print All</Button>
        </div>
      </div>

      {kots?.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 bg-bg-secondary/50 border-dashed">
          <ChefHat className="w-12 h-12 text-text-muted/30 mb-4" />
          <h3 className="text-sm font-bold text-text-primary">Great job, Chef!</h3>
          <p className="text-xs text-text-muted mt-1">No pending orders at the moment.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {kots?.map((kot: any) => {
            const statusConfig = kotStatusColors[kot.status] || kotStatusColors.pending;
            const elapsedMinutes = Math.floor((new Date().getTime() - new Date(kot.createdAt).getTime()) / 60000);
            
            return (
              <Card key={kot.id} padding={false} className={cn(
                'overflow-hidden border-t-4 transition-all hover:scale-[1.02]',
                kot.status === 'pending' ? 'border-t-danger shadow-lg shadow-danger/10' : 
                kot.status === 'in_kitchen' ? 'border-t-blue-500 shadow-lg shadow-blue-500/10' : 'border-t-success shadow-lg shadow-success/10'
              )}>
                <div className="p-3 border-b border-border/50 flex items-center justify-between bg-bg-tertiary/20">
                   <div>
                      <p className="text-xs font-black text-text-primary uppercase tracking-tighter">{kot.kotNumber}</p>
                      <p className="text-[10px] text-text-muted">#{kot.order?.orderNumber}</p>
                   </div>
                   <div className="flex flex-col items-end">
                      <span className={cn('text-[9px] font-black px-1.5 py-0.5 rounded uppercase', statusConfig.bg, statusConfig.text)}>
                        {statusConfig.label}
                      </span>
                      {elapsedMinutes > 0 && <span className="text-[9px] text-text-muted mt-1 font-mono">{elapsedMinutes}m ago</span>}
                   </div>
                </div>

                <div className="p-3 space-y-2">
                   <div className="flex gap-2 text-[10px] text-text-muted font-bold uppercase tracking-wider">
                      <span className="bg-bg-tertiary px-1.5 py-0.5 rounded">{kot.order?.table?.name || 'Walk-in'}</span>
                      <span className="bg-bg-tertiary px-1.5 py-0.5 rounded">{kot.order?.type?.replace('_', ' ')}</span>
                   </div>

                   <div className="space-y-1.5 py-2">
                      {kot.items?.map((item: any) => (
                        <div key={item.id} className="flex items-start justify-between gap-3 p-1.5 rounded-lg bg-bg-primary/40">
                           <div className="flex gap-2">
                               <span className="text-sm font-black text-blue-400 mt-0.5">{item.quantity}</span>
                               <div className="w-8 h-8 rounded bg-bg-tertiary overflow-hidden shrink-0 border border-border/50">
                                  {item.menuItem?.image ? (
                                    <img src={resolveImageUrl(item.menuItem.image)} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[10px]">🍽️</div>
                                  )}
                               </div>
                               <div className="flex flex-col">
                                 <span className="text-xs font-bold text-text-primary leading-none">{item.menuItem?.name}</span>
                                 {item.note && <span className="text-[9px] text-danger font-medium mt-1 leading-tight">Note: {item.note}</span>}
                                 {item.modifiers && (
                                   <div className="flex flex-wrap gap-1 mt-1">
                                      {item.modifiers.map((m: any, idx: number) => (
                                         <span key={idx} className="text-[8px] px-1 bg-white/5 text-text-muted rounded italic">+{m.name}</span>
                                      ))}
                                   </div>
                                 )}
                              </div>
                           </div>
                        </div>
                      ))}
                   </div>

                   <div className="pt-2 flex gap-2">
                      {kot.status === 'pending' && (
                        <Button size="sm" className="flex-1 h-8 text-[10px] uppercase font-black" onClick={() => updateKotStatus(kot.id, 'in_kitchen')}>
                           Confirm Order
                        </Button>
                      )}
                      {kot.status === 'in_kitchen' && (
                        <Button size="sm" variant="success" className="flex-1 h-8 text-[10px] uppercase font-black" onClick={() => updateKotStatus(kot.id, 'ready')}>
                           Mark as Ready
                        </Button>
                      )}
                      <Button variant="secondary" size="sm" className="h-8 w-8 p-0 shrink-0">
                         <Printer size={14} />
                      </Button>
                   </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
