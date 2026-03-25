import React from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Search, CalendarDays, Clock, Users, Phone, X, Check } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function Reservations() {
  const queryClient = useQueryClient();
  const { data: reservationsRes, isLoading } = useQuery({
    queryKey: ['reservations'],
    queryFn: () => api.get('/restaurant/reservations').then(r => r.data.data)
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number, status: string }) => 
      api.put(`/restaurant/reservations/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      toast.success('Status updated');
    }
  });

  const reservations = reservationsRes || [];

  if (isLoading) return <div className="p-8 text-center text-text-muted">Loading reservations...</div>;

  return (
    <div className="space-y-4 animate-in">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Reservations</h1>
          <p className="text-xs text-text-muted mt-1">Manage table bookings and guests</p>
        </div>
        <Button size="sm" icon={<CalendarDays className="w-4 h-4" />}>New Booking</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="flex flex-col gap-1 bg-blue-500/5 border-blue-500/20">
          <span className="text-xs font-medium text-blue-400 uppercase tracking-wider">Today's Bookings</span>
          <span className="text-2xl font-bold text-text-primary">{reservations.length}</span>
        </Card>
        <Card className="flex flex-col gap-1">
          <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Total Guests</span>
          <span className="text-2xl font-bold text-text-primary">
            {reservations.reduce((sum: number, r: any) => sum + r.partySize, 0)}
          </span>
        </Card>
      </div>

      <Card padding={false}>
        <div className="p-3 border-b border-border/50 flex items-center justify-between">
          <div className="relative w-72">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
             <input className="glass-input w-full pl-9 h-9 text-sm" placeholder="Search customer name or phone..." />
          </div>
          <div className="flex gap-2">
            {['All', 'Today', 'Upcoming', 'Pending'].map(tab => (
               <button key={tab} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${tab === 'All' ? 'bg-bg-hover text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'}`}>
                 {tab}
               </button>
             ))}
          </div>
        </div>
        
        <div className="overflow-x-auto text-xs">
          <table className="w-full">
            <thead>
              <tr className="bg-bg-tertiary/30 border-b border-border text-left">
                <th className="py-3 px-4 font-medium text-text-secondary w-64">Customer</th>
                <th className="py-3 px-4 font-medium text-text-secondary">Date & Time</th>
                <th className="py-3 px-4 font-medium text-text-secondary">Details</th>
                <th className="py-3 px-4 font-medium text-text-secondary">Status</th>
                <th className="py-3 px-4 font-medium text-text-secondary text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {reservations.map((res: any) => (
                <tr key={res.id} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-3 px-4">
                    <p className="font-semibold text-text-primary">{res.customerName}</p>
                    <p className="text-text-muted text-[10px] flex items-center gap-1 mt-1"><Phone className="w-2.5 h-2.5"/> {res.customerPhone}</p>
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-medium text-text-primary flex items-center gap-2"><CalendarDays className="w-3 h-3 text-blue-400"/> {new Date(res.date).toLocaleDateString()}</p>
                    <p className="text-text-secondary flex items-center gap-2 mt-1"><Clock className="w-3 h-3 text-blue-400"/> {res.startTime}</p>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2">
                       <Badge variant="secondary" size="sm" className="bg-bg-tertiary border text-text-secondary border-border flex items-center gap-1"><Users className="w-2.5 h-2.5"/> {res.partySize} Pax</Badge>
                       {res.table && <Badge variant="info" size="sm" className="bg-blue-500/10 text-blue-400 border border-blue-500/20">{res.table.name}</Badge>}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant={res.status === 'confirmed' ? 'info' : res.status === 'arrived' ? 'success' : res.status === 'cancelled' ? 'danger' : 'warning'} size="sm" className="capitalize">
                      {res.status}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-right space-x-2">
                     <div className="flex items-center justify-end gap-1.5">
                       {res.status === 'pending' && (
                         <>
                           <Button size="sm" variant="secondary" className="!bg-success/20 !text-success !border-success/30 px-2 h-7" onClick={() => updateStatus.mutate({ id: res.id, status: 'confirmed' })} icon={<Check className="w-3 h-3"/>}>Approve</Button>
                           <Button size="sm" variant="secondary" className="!bg-danger/20 !text-danger !border-danger/30 px-2 h-7" onClick={() => updateStatus.mutate({ id: res.id, status: 'cancelled' })} icon={<X className="w-3 h-3"/>}>Decline</Button>
                         </>
                       )}
                       {res.status === 'confirmed' && (
                         <Button size="sm" className="px-2 h-7" variant="secondary" onClick={() => updateStatus.mutate({ id: res.id, status: 'arrived' })}>Mark Arrived</Button>
                       )}
                       <Button size="sm" variant="secondary" className="px-2 h-7">Edit</Button>
                     </div>
                  </td>
                </tr>
              ))}
              {reservations.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-text-muted italic">No reservations found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
