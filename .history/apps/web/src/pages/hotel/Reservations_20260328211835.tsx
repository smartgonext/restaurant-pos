import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Plus, Search, Pencil, Trash2, Calendar, User, CreditCard, Clock, CheckCircle2, XCircle, MoreVertical, FileText, ArrowRight, BedDouble } from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/utils';
import api from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

interface Reservation {
  id: number;
  reservationNumber: string;
  guestId: number;
  guest?: { firstName: string; lastName: string; email: string; phone: string };
  checkInDate: string;
  checkOutDate: string;
  numberOfRooms: number;
  totalPrice: string;
  status: string;
  createdAt: string;
}

export default function Reservations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Reservation | null>(null);

  const [formData, setFormData] = useState({
    guestId: '',
    checkInDate: '',
    checkOutDate: '',
    numberOfRooms: '1',
    totalPrice: '',
    status: 'confirmed'
  });

  const { data: reservationsRes, isLoading: reservationsLoading } = useQuery({
    queryKey: ['hotel', 'reservations'],
    queryFn: async () => {
      const res = await api.get('/restaurant/hotel/reservations');
      return res.data;
    }
  });

  const { data: guestsRes } = useQuery({
    queryKey: ['hotel', 'guests'],
    queryFn: async () => {
      const res = await api.get('/restaurant/hotel/guests');
      return res.data;
    }
  });

  const mutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editingItem) return api.put(`/restaurant/hotel/reservations/${editingItem.id}`, payload);
      return api.post('/restaurant/hotel/reservations', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel', 'reservations'] });
      toast({ title: `Reservation ${editingItem ? 'updated' : 'created'} successfully` });
      setIsModalOpen(false);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/restaurant/hotel/reservations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel', 'reservations'] });
      toast({ title: 'Reservation cancelled' });
    }
  });

  const reservations: Reservation[] = reservationsRes?.data || [];
  const guests = guestsRes?.data || [];

  const filteredData = useMemo(() => {
    return reservations.filter((r) => {
      const matchesSearch = !search || 
        (r.guest?.firstName + ' ' + r.guest?.lastName).toLowerCase().includes(search.toLowerCase()) ||
        r.reservationNumber.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [reservations, search, statusFilter]);

  const handleOpenModal = (item?: Reservation) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        guestId: item.guestId.toString(),
        checkInDate: item.checkInDate.split('T')[0],
        checkOutDate: item.checkOutDate.split('T')[0],
        numberOfRooms: item.numberOfRooms.toString(),
        totalPrice: item.totalPrice,
        status: item.status
      });
    } else {
      setEditingItem(null);
      setFormData({
        guestId: '',
        checkInDate: new Date().toISOString().split('T')[0],
        checkOutDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        numberOfRooms: '1',
        totalPrice: '',
        status: 'confirmed'
      });
    }
    setIsModalOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed': return <Badge variant="success" className="text-[9px] font-black uppercase tracking-widest rounded-lg px-2">Confirmed</Badge>;
      case 'cancelled': return <Badge variant="destructive" className="text-[9px] font-black uppercase tracking-widest rounded-lg px-2">Cancelled</Badge>;
      case 'checked_in': return <Badge variant="info" className="text-[9px] font-black uppercase tracking-widest rounded-lg px-2">Checked In</Badge>;
      default: return <Badge variant="secondary" className="text-[9px] font-black uppercase tracking-widest rounded-lg px-2">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-card/50 backdrop-blur-md border border-border p-5 rounded-2xl shadow-xl shadow-black/10">
        <div>
          <h1 className="text-2xl font-black text-text-primary tracking-tight">Reservations</h1>
          <p className="text-sm text-text-muted mt-1 font-medium italic">Manage confirmed and pending bookings</p>
        </div>
        <div className="flex items-center gap-3">
           <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                className="bg-bg-dark border border-border rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-blue-500/50 outline-none transition-all w-full md:w-64"
                placeholder="Search by name or ID..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
           </div>
           <Button onClick={() => handleOpenModal()} variant="primary" className="shadow-lg shadow-blue-500/30 font-black px-6 text-[10px] uppercase tracking-widest h-10">
              <Plus className="w-4 h-4 mr-2" /> New Booking
           </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
         {['all', 'confirmed', 'pending', 'checked_in', 'cancelled'].map(s => (
           <button
             key={s}
             onClick={() => setStatusFilter(s)}
             className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border ${statusFilter === s ? 'bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-bg-card/50 border-border text-text-muted hover:text-text-primary'}`}
           >
             {s.replace('_', ' ')}
           </button>
         ))}
      </div>

      <Card padding={false} className="overflow-hidden border-border/40 rounded-2xl shadow-xl bg-bg-card/50">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-dark/50 text-[10px] font-black uppercase tracking-[0.15em] text-text-muted">
                <th className="text-left py-4 px-6 italic">Reservation Details</th>
                <th className="text-left py-4 px-6 italic">Stay Period</th>
                <th className="text-left py-4 px-6 italic">Occupancy</th>
                <th className="text-left py-4 px-6 italic">Total Folio</th>
                <th className="text-left py-4 px-6 italic">Status</th>
                <th className="text-right py-4 px-6 italic">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {reservationsLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={6} className="p-4"><Skeleton className="h-10 w-full rounded-lg" /></td></tr>
                ))
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-20 text-center">
                    <div className="w-16 h-16 bg-bg-dark rounded-2xl flex items-center justify-center mx-auto mb-4 border border-border/60">
                      <Calendar className="w-8 h-8 text-text-muted/50" />
                    </div>
                    <p className="text-text-muted font-bold italic">No active reservations found.</p>
                  </td>
                </tr>
              ) : (
                filteredData.map((res) => (
                  <tr key={res.id} className="group hover:bg-blue-500/[0.02] transition-colors">
                    <td className="py-4 px-6">
                       <div>
                          <p className="text-[10px] font-mono font-bold text-text-muted mb-0.5 tracking-widest uppercase">{res.reservationNumber}</p>
                          <h3 className="font-black text-text-primary text-base uppercase tracking-tight group-hover:text-blue-400 transition-colors">
                             {res.guest?.firstName} {res.guest?.lastName}
                          </h3>
                       </div>
                    </td>
                    <td className="py-4 px-6">
                       <div className="flex items-center gap-3 text-xs font-bold text-text-secondary">
                          <div className="flex flex-col">
                             <span className="text-[9px] text-text-muted uppercase font-black tracking-widest leading-none mb-1">Check In</span>
                             <span>{formatDate(res.checkInDate)}</span>
                          </div>
                          <ArrowRight className="w-3 h-3 text-text-muted/40" />
                          <div className="flex flex-col">
                             <span className="text-[9px] text-text-muted uppercase font-black tracking-widest leading-none mb-1">Check Out</span>
                             <span>{formatDate(res.checkOutDate)}</span>
                          </div>
                       </div>
                    </td>
                    <td className="py-4 px-6">
                       <div className="flex items-center gap-2 text-xs font-bold text-text-secondary">
                          <BedDouble className="w-3.5 h-3.5 text-blue-400/50" />
                          <span>{res.numberOfRooms} Room(s)</span>
                       </div>
                    </td>
                    <td className="py-4 px-6">
                       <span className="text-sm font-black text-text-primary tracking-tight">{formatCurrency(res.totalPrice)}</span>
                    </td>
                    <td className="py-4 px-6">
                       {getStatusBadge(res.status)}
                    </td>
                    <td className="py-4 px-6 text-right">
                       <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                          <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-blue-500/10 hover:text-blue-400" onClick={() => handleOpenModal(res)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-red-500/10 hover:text-red-400" onClick={() => deleteMutation.mutate(res.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                       </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? 'Edit Reservation' : 'Create New Reservation'}
        size="lg"
      >
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(formData); }} className="p-1 space-y-6">
           <div className="space-y-4">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 mb-2">
                 <User className="w-3 h-3" /> Guest Selection
              </div>
              <div className="space-y-2">
                 <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Primary Guest <span className="text-red-500">*</span></Label>
                 <select
                    className="w-full bg-bg-dark border border-border rounded-xl px-4 h-11 text-sm font-bold text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none transition-all cursor-pointer"
                    value={formData.guestId}
                    onChange={e => setFormData({ ...formData, guestId: e.target.value })}
                    required
                 >
                   <option value="">Select Guest profile</option>
                   {guests.map((g: any) => <option key={g.id} value={g.id.toString()}>{g.firstName} {g.lastName} ({g.email})</option>)}
                 </select>
              </div>
           </div>

           <div className="space-y-4 pt-4 border-t border-border/40">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-red-400 mb-2">
                 <Calendar className="w-3 h-3" /> Stay Duration
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                    <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Check-In Date</Label>
                    <Input type="date" value={formData.checkInDate} onChange={e => setFormData({...formData, checkInDate: e.target.value})} required className="font-bold h-11" />
                 </div>
                 <div className="space-y-2">
                    <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Check-Out Date</Label>
                    <Input type="date" value={formData.checkOutDate} onChange={e => setFormData({...formData, checkOutDate: e.target.value})} required className="font-bold h-11" />
                 </div>
              </div>
           </div>

           <div className="space-y-4 pt-4 border-t border-border/40">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-green-400 mb-2">
                 <CreditCard className="w-3 h-3" /> Configuration & Financials
              </div>
              <div className="grid grid-cols-3 gap-4">
                 <div className="space-y-2">
                    <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">No. of Rooms</Label>
                    <Input type="number" value={formData.numberOfRooms} onChange={e => setFormData({...formData, numberOfRooms: e.target.value})} min="1" required className="font-bold h-11" />
                 </div>
                 <div className="space-y-2">
                    <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Total Price ($)</Label>
                    <Input type="number" value={formData.totalPrice} onChange={e => setFormData({...formData, totalPrice: e.target.value})} placeholder="0.00" className="font-black h-11 bg-green-500/5 border-green-500/30 text-green-500" />
                 </div>
                 <div className="space-y-2">
                    <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Initial Status</Label>
                    <select
                       className="w-full bg-bg-dark border border-border rounded-xl px-4 h-11 text-sm font-bold text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none transition-all cursor-pointer"
                       value={formData.status}
                       onChange={e => setFormData({ ...formData, status: e.target.value })}
                    >
                      <option value="pending">Pending</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                 </div>
              </div>
           </div>

           <div className="flex justify-end gap-3 pt-6 border-t border-border mt-4">
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)} className="font-black uppercase tracking-widest text-[10px]">Cancel</Button>
              <Button type="submit" variant="primary" isLoading={mutation.isPending} className="px-10 font-black uppercase tracking-widest text-[10px]">
                {editingItem ? 'Update Booking' : 'Confirm Booking'}
              </Button>
           </div>
        </form>
      <Modal
        mode="slide"
    </div>
  );
}
