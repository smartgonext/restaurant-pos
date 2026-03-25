import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Search, MapPin, Navigation, Bike, Plus, AlertCircle, UserPlus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export default function Delivery() {
  const { data: ordersRes, isLoading: ordersLoading } = useQuery({
    queryKey: ['delivery-orders'],
    queryFn: () => api.get('/restaurant/orders', { params: { type: 'delivery' } }).then(r => r.data.data)
  });

  const { data: executivesRes } = useQuery({
    queryKey: ['delivery-executives'],
    queryFn: () => api.get('/restaurant/delivery-executives').then(r => r.data.data)
  });

  const orders = ordersRes || [];
  const activeDeliveries = orders.filter((o: any) => o.status !== 'delivered' && o.status !== 'cancelled');

  if (ordersLoading) return <div className="p-8 text-center text-text-muted">Loading deliveries...</div>;

  return (
    <div className="space-y-4 animate-in">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Delivery Management</h1>
          <p className="text-xs text-text-muted mt-1">Track external and in-house delivery partners</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" icon={<Bike className="w-4 h-4" />}>Fleet Status</Button>
          <Button size="sm" icon={<UserPlus className="w-4 h-4" />}>Add Executive</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="flex flex-col gap-1">
          <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Active Deliveries</span>
          <span className="text-2xl font-bold text-text-primary">{activeDeliveries.length}</span>
        </Card>
        <Card className="flex flex-col gap-1 bg-blue-500/5 border-blue-500/20">
          <span className="text-xs font-medium text-blue-400 uppercase tracking-wider">Executives Online</span>
          <span className="text-2xl font-bold text-text-primary">{(executivesRes || []).length}</span>
        </Card>
      </div>

      <Card padding={false} className="border-border/50">
        <div className="p-3 border-b border-border/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
             <input className="glass-input w-full pl-9 h-9 text-sm" placeholder="Search order ID or delivery partner..." />
          </div>
          <div className="flex bg-bg-tertiary rounded-lg p-1 border border-border">
             <button className="px-3 py-1 rounded-md bg-bg-secondary text-text-primary text-xs font-medium shadow-sm">All</button>
             <button className="px-3 py-1 rounded-md text-text-muted hover:text-text-primary text-xs font-medium">In-House</button>
             <button className="px-3 py-1 rounded-md text-text-muted hover:text-text-primary text-xs font-medium">External</button>
          </div>
        </div>

        <div className="grid grid-cols-1 divide-y divide-border/50">
          {activeDeliveries.map((order: any) => (
            <div key={order.id} className="p-4 flex flex-col lg:flex-row gap-4 lg:items-center justify-between hover:bg-bg-hover/20 transition-colors">
               <div className="flex gap-4 items-center flex-1">
                 <div className="p-2.5 bg-bg-tertiary rounded-lg border border-border shrink-0">
                   <Bike className={`w-5 h-5 ${order.status === 'out_for_delivery' ? 'text-blue-400' : 'text-warning'}`} />
                 </div>
                 <div className="space-y-0.5">
                   <div className="flex items-center gap-2">
                     <h3 className="font-bold text-text-primary text-base">{order.orderNumber}</h3>
                     <Badge variant={order.status === 'out_for_delivery' ? 'info' : 'warning'} size="sm" className="capitalize">
                       {order.status.replace('_', ' ')}
                     </Badge>
                   </div>
                   <div className="flex items-center gap-4 text-[11px] text-text-muted">
                     <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {order.customer?.name} • {order.customer?.address || 'No address'}</span>
                   </div>
                 </div>
               </div>
               
               <div className="flex items-center gap-4 lg:pl-4 lg:border-l border-border/50">
                  <div className="text-right space-y-0.5 min-w-[120px]">
                    <p className="font-medium text-text-primary text-xs">{order.deliveryExecutive?.name || 'Unassigned'}</p>
                    <p className="text-[10px] text-text-muted">{new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  {!order.deliveryExecutiveId ? (
                    <Button variant="primary" size="sm" className="h-8 text-xs" icon={<Plus className="w-3 h-3" />}>Assign</Button>
                  ) : (
                    <Button variant="secondary" size="sm" className="h-8 text-xs" icon={<Navigation className="w-3 h-3" />}>Track</Button>
                  )}
               </div>
            </div>
          ))}

          {activeDeliveries.length === 0 && (
             <div className="p-10 text-center flex flex-col items-center">
               <AlertCircle className="w-10 h-10 text-text-muted/30 mb-2" />
               <p className="text-text-muted text-sm font-medium">No active deliveries</p>
             </div>
          )}
        </div>
      </Card>
    </div>
  );
}
