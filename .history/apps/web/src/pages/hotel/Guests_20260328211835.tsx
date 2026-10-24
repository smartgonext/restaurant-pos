import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Pencil, Trash2, Search, User, Mail, Phone, MapPin, CreditCard, ChevronRight, MoreHorizontal } from 'lucide-react';
import api from '@/lib/api';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';

interface Guest {
  id: number;
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  idType: string | null;
  idNumber: string | null;
  notes: string | null;
  createdAt: string;
}

export default function Guests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Guest | null>(null);
  const [search, setSearch] = useState('');
  
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    country: '',
    postalCode: '',
    idType: '',
    idNumber: '',
    notes: ''
  });

  const { data, isLoading } = useQuery({
    queryKey: ['hotel', 'guests'],
    queryFn: async () => {
      const res = await api.get('/restaurant/hotel/guests');
      return res.data;
    }
  });

  const mutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editingItem) {
        return api.put(`/restaurant/hotel/guests/${editingItem.id}`, payload);
      }
      return api.post('/restaurant/hotel/guests', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel', 'guests'] });
      toast({ title: `Guest ${editingItem ? 'updated' : 'created'} successfully` });
      handleCloseModal();
    },
    onError: (err: any) => {
      toast({ 
        title: 'Error saving guest', 
        description: err.response?.data?.error || 'Something went wrong',
        variant: 'destructive' 
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/restaurant/hotel/guests/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel', 'guests'] });
      toast({ title: 'Guest profile deleted' });
    }
  });

  const handleOpenModal = (item?: Guest) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        firstName: item.firstName || '',
        lastName: item.lastName || '',
        email: item.email || '',
        phone: item.phone || '',
        address: item.address || '',
        city: item.city || '',
        state: item.state || '',
        country: item.country || '',
        postalCode: item.postalCode || '',
        idType: item.idType || '',
        idNumber: item.idNumber || '',
        notes: item.notes || ''
      });
    } else {
      setEditingItem(null);
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        state: '',
        country: '',
        postalCode: '',
        idType: '',
        idNumber: '',
        notes: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  const filteredData = useMemo(() => {
    const items = data?.data || [];
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((g: Guest) => 
      (g.name || '').toLowerCase().includes(q) ||
      (g.email || '').toLowerCase().includes(q) ||
      (g.phone || '').includes(search)
    );
  }, [data, search]);

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-card/50 backdrop-blur-md border border-border p-5 rounded-2xl shadow-xl shadow-black/10">
        <div>
          <h1 className="text-2xl font-black text-text-primary tracking-tight">Guest Directory</h1>
          <p className="text-sm text-text-muted mt-1 font-medium">Manage your guest profiles and history</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              className="bg-bg-dark border border-border rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-blue-500/50 outline-none transition-all w-full md:w-64"
              placeholder="Search by name, email, phone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Button onClick={() => handleOpenModal()} variant="primary" className="shadow-lg shadow-blue-500/30 font-bold px-6 text-xs uppercase tracking-widest">
            <Plus className="w-4 h-4 mr-2" />
            Add Guest
          </Button>
        </div>
      </div>

      <Card padding={false} className="overflow-hidden border-border/40 rounded-2xl shadow-xl bg-bg-card/50">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-dark/50 text-[10px] font-black uppercase tracking-[0.15em] text-text-muted">
                <th className="text-left py-4 px-6">Guest Identity</th>
                <th className="text-left py-4 px-6">Contact Info</th>
                <th className="text-left py-4 px-6">Location</th>
                <th className="text-left py-4 px-6">ID Verification</th>
                <th className="text-right py-4 px-6">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="py-4 px-6"><Skeleton className="h-10 w-40 rounded-lg" /></td>
                    <td className="py-4 px-6"><Skeleton className="h-10 w-40 rounded-lg" /></td>
                    <td className="py-4 px-6"><Skeleton className="h-10 w-32 rounded-lg" /></td>
                    <td className="py-4 px-6"><Skeleton className="h-10 w-32 rounded-lg" /></td>
                    <td className="py-4 px-6 text-right"><Skeleton className="h-8 w-8 ml-auto rounded-full" /></td>
                  </tr>
                ))
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                    <div className="w-16 h-16 bg-bg-dark rounded-2xl flex items-center justify-center mx-auto mb-4 border border-border/60">
                      <User className="w-8 h-8 text-text-muted/50" />
                    </div>
                    <p className="text-text-muted font-bold italic">No guest profiles found.</p>
                  </td>
                </tr>
              ) : (
                filteredData.map((guest: Guest) => (
                  <tr key={guest.id} className="group hover:bg-blue-500/[0.02] transition-colors">
                    <td className="py-4 px-6">
                       <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-black text-xs">
                             {(guest.firstName?.[0] || '') + (guest.lastName?.[0] || '') || guest.name[0]}
                          </div>
                          <div>
                            <p className="font-black text-text-primary text-base leading-none group-hover:text-blue-400 transition-colors uppercase tracking-tight">
                                {guest.firstName} {guest.lastName}
                            </p>
                            <p className="text-[10px] text-text-muted mt-1 font-mono uppercase tracking-widest">Added {formatDate(guest.createdAt)}</p>
                          </div>
                       </div>
                    </td>
                    <td className="py-4 px-6">
                       <div className="space-y-1 text-xs">
                          <div className="flex items-center gap-2 text-text-secondary group-hover:text-text-primary transition-colors">
                            <Mail className="w-3.5 h-3.5 text-blue-400/50" />
                            {guest.email || '—'}
                          </div>
                          <div className="flex items-center gap-2 text-text-secondary font-mono">
                            <Phone className="w-3.5 h-3.5 text-blue-400/50" />
                            {guest.phone || '—'}
                          </div>
                       </div>
                    </td>
                    <td className="py-4 px-6">
                       <div className="flex items-center gap-2 text-xs text-text-secondary">
                          <MapPin className="w-3.5 h-3.5 text-red-400/50" />
                          <span>{guest.city}{guest.city && guest.country ? ', ' : ''}{guest.country || '—'}</span>
                       </div>
                    </td>
                    <td className="py-4 px-6">
                       {guest.idType ? (
                         <div className="flex items-center gap-2">
                           <CreditCard className="w-3.5 h-3.5 text-purple-400/50" />
                           <Badge variant="outline" className="text-[10px] font-bold text-text-primary py-0 bg-transparent">
                             {guest.idType.toUpperCase()}: {guest.idNumber}
                           </Badge>
                         </div>
                       ) : (
                         <span className="text-[10px] text-text-muted italic opacity-50">Not Verified</span>
                       )}
                    </td>
                    <td className="py-4 px-6 text-right">
                       <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                          <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-blue-500/10 hover:text-blue-400" onClick={() => handleOpenModal(guest)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-red-500/10 hover:text-red-400" onClick={() => deleteMutation.mutate(guest.id)}>
                            <Trash2 className="w-4 h-4" />
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
        onClose={handleCloseModal}
        title={editingItem ? 'Edit Guest Profile' : 'Create Guest Profile'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="p-1 space-y-8">
          {/* Section: Basic Identity */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 mb-2">
               <User className="w-3 h-3" /> Basic Identity
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-text-muted">First Name <span className="text-red-500 font-black">*</span></Label>
                <Input
                  value={formData.firstName}
                  onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                  placeholder="e.g. John"
                  required
                  className="font-bold"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-text-muted">Last Name <span className="text-red-500 font-black">*</span></Label>
                <Input
                  value={formData.lastName}
                  onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                  placeholder="e.g. Doe"
                  required
                  className="font-bold"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-text-muted">Email Address</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  placeholder="john.doe@example.com"
                  className="font-medium"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-text-muted">Phone Number <span className="text-red-500 font-black">*</span></Label>
                <Input
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1 234 567 890"
                  required
                  className="font-mono font-bold"
                />
              </div>
            </div>
          </div>

          {/* Section: Residence Details */}
          <div className="space-y-4 pt-4 border-t border-border/40">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-red-400 mb-2">
               <MapPin className="w-3 h-3" /> Residence Details
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-text-muted">Complete Address</Label>
              <Input
                value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
                placeholder="Street address, building, floor"
                className="font-medium"
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-text-muted">City</Label>
                <Input value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })} placeholder="City" className="font-medium" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-text-muted">State</Label>
                <Input value={formData.state} onChange={e => setFormData({ ...formData, state: e.target.value })} placeholder="State" className="font-medium" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-text-muted">Country</Label>
                <Input value={formData.country} onChange={e => setFormData({ ...formData, country: e.target.value })} placeholder="Country" className="font-medium" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-text-muted">Zip Code</Label>
                <Input value={formData.postalCode} onChange={e => setFormData({ ...formData, postalCode: e.target.value })} placeholder="000000" className="font-mono" />
              </div>
            </div>
          </div>

          {/* Section: ID Verification */}
          <div className="space-y-4 pt-4 border-t border-border/40">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-purple-400 mb-2">
               <CreditCard className="w-3 h-3" /> Verification Identity
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-text-muted">ID Type</Label>
                <select
                   className="w-full bg-bg-dark border border-border rounded-xl px-4 h-10 text-sm font-bold text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none transition-all cursor-pointer"
                   value={formData.idType}
                   onChange={e => setFormData({ ...formData, idType: e.target.value })}
                >
                  <option value="">Select ID Type</option>
                  <option value="passport">Passport</option>
                  <option value="driving_license">Driving License</option>
                  <option value="national_id">National ID Card</option>
                  <option value="voter_id">Voter ID</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-text-muted">ID Number</Label>
                <Input
                  value={formData.idNumber}
                  onChange={e => setFormData({ ...formData, idNumber: e.target.value })}
                  placeholder="Document number"
                  className="font-mono font-bold"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-text-muted">Important Notes / Preferences</Label>
              <textarea
                className="w-full h-24 bg-bg-dark border border-border rounded-xl p-4 text-text-primary text-sm focus:ring-2 focus:ring-blue-500/50 transition-all outline-none font-medium leading-relaxed italic"
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Any dietary restrictions, room preferences, or previous issues..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-border mt-4">
            <Button type="button" variant="ghost" onClick={handleCloseModal} className="font-black uppercase tracking-widest text-[10px]">
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={mutation.isPending} className="px-10 font-black uppercase tracking-widest text-[10px]">
              {editingItem ? 'Update Profile' : 'Save Profile'}
            </Button>
          </div>
        </form>
      <Modal
        mode="slide"
    </div>
  );
}
