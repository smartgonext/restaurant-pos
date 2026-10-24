import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ChefHat, Clock, Play, CheckCircle, XCircle, Printer, Utensils } from 'lucide-react';
import { cn, formatDateTime, resolveImageUrl } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';

const kotStatusColors: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-danger/10 border-danger/20', text: 'text-danger', label: 'PENDING' },
  in_kitchen: { bg: 'bg-blue-500/10 border-blue-500/20', text: 'text-blue-400', label: 'COOKING' },
  ready: { bg: 'bg-success/10 border-success/20', text: 'text-success', label: 'READY' },
  cancelled: { bg: 'bg-text-muted/10 border-text-muted/20', text: 'text-text-muted', label: 'CANCELLED' },
};

// ── KOT printing helpers ──────────────────────────────────────────────
function escapeHtml(value: any): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function kotTicketHtml(kot: any, restaurantName: string): string {
  const order = kot.order || {};
  const items = kot.items || [];
  const tableName = order.table?.name || 'Walk-in';
  const orderType = String(order.type || 'walk_in').replace(/_/g, ' ');
  const orderNumber = order.orderNumber || `#${kot.id}`;
  const time = formatDateTime(kot.createdAt);
  const totalQty = items.reduce((s: number, it: any) => s + (Number(it.quantity) || 1), 0);

  const itemRows = items.map((item: any) => {
    const mods = (item.modifiers || []).map((m: any) => `<div class="mod">+ ${escapeHtml(m.name)}</div>`).join('');
    const note = item.note ? `<div class="note">Note: ${escapeHtml(item.note)}</div>` : '';
    return (
      `<div class="item">
        <div class="item-head">
          <span class="qty">${Number(item.quantity) || 1}</span>
          <span class="name">${escapeHtml(item.menuItem?.name || 'Item')}</span>
        </div>
        ${note}${mods}
      </div>`
    );
  }).join('');

  return `
    <div class="ticket">
      <div class="h">
        <div class="rname">${escapeHtml(restaurantName)}</div>
        <div class="kottitle">KITCHEN ORDER TICKET</div>
        <div class="ordno">Order ${escapeHtml(orderNumber)}</div>
      </div>
      <div class="d"></div>
      <div class="row"><span>Table</span><span class="b">${escapeHtml(tableName)}</span></div>
      <div class="row"><span>Type</span><span class="b">${escapeHtml(orderType)}</span></div>
      <div class="row"><span>Time</span><span>${escapeHtml(time)}</span></div>
      <div class="row"><span>KOT #</span><span>${escapeHtml(kot.id)}</span></div>
      <div class="d"></div>
      ${itemRows}
      <div class="d"></div>
      <div class="foot">${totalQty} item${totalQty === 1 ? '' : 's'}</div>
    </div>`;
}

function buildKotkotsHtml(kots: any[], restaurantName: string): string {
  const tickets = kots.map((kot) => kotTicketHtml(kot, restaurantName)).join('<div class="pb"></div>');
  return `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>KOT</title>
        <style>
          *{margin:0;padding:0;box-sizing:border-box}
          body{font-family:'Courier New',monospace;color:#000;font-size:13px}
          .ticket{width:302px;margin:0 auto;padding:12px}
          .h{text-align:center;margin-bottom:8px}
          .rname{font-size:16px;font-weight:bold;text-transform:uppercase}
          .kottitle{font-size:13px;font-weight:bold;letter-spacing:1px;margin-top:2px}
          .ordno{font-size:11px;margin-top:2px}
          .d{border-top:1px dashed #000;margin:8px 0}
          .row{display:flex;justify-content:space-between;margin:2px 0;font-size:12px}
          .b{font-weight:bold}
          .item{margin:6px 0}
          .item-head{display:flex;gap:6px;font-weight:bold}
          .qty{color:#1a7fc4;width:22px;text-align:right;flex-shrink:0}
          .name{flex:1}
          .mod{padding-left:28px;font-size:11px;font-style:italic}
          .note{padding-left:28px;font-size:11px;font-weight:bold}
          .foot{text-align:center;font-size:11px;margin-top:4px}
          .pb{page-break-after:always}
          @media print{.ticket{margin:0}}
        </style>
      </head>
      <body>
        ${tickets}
      </body>
    </html>`;
}

function openPrintWindow(title: string, html: string): boolean {
  const w = window.open('', '_blank', 'width=420,height=760');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch { /* ignore */ } }, 350);
  return true;
}

export default function KitchenKOT() {
  const { data: kots, isLoading, refetch } = useQuery({
    queryKey: ['kitchen-kots'],
    queryFn: () => api.get('/restaurant/kots').then((r) => r.data.data),
    refetchInterval: 5000,
  });

  const { user } = useAuthStore();
  const restaurantName = user?.restaurant?.name || 'Restaurant';

  const printKot = (kot: any) => {
    const ok = openPrintWindow('KOT', buildKotkotsHtml([kot], restaurantName));
    if (!ok) toast.error('Popup blocked — allow popups to print');
  };

  const printAll = () => {
    if (!kots?.length) { toast.error('No orders to print'); return; }
    const ok = openPrintWindow('KOTs', buildKotkotsHtml(kots, restaurantName));
    if (!ok) toast.error('Popup blocked — allow popups to print');
  };

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
           <Button variant="secondary" size="sm" icon={<Printer size={14} />} onClick={printAll}>Print All</Button>
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
                      <Button variant="secondary" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => printKot(kot)}>
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
