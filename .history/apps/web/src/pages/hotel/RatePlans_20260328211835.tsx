import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Plus, Search, Pencil, Trash2, Tag, Percent, ShieldCheck, Info, ArrowRight } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import api from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

interface RatePlan {
  id: number;
  name: string;
  planType: string;
  cancellationHours: number | null;
  cancellationFeePercent: string | null;
  description: string | null;
  isActive: boolean;
  status: string;
  createdAt: string;
}

export default function RatePlans() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RatePlan | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    planType: 'EP',
    cancellationHours: '24',
    cancellationFeePercent: '100',
    description: '',
    isActive: true
  });

  const { data, isLoading } = useQuery({
    queryKey: ['hotel', 'rate-plans'],
    queryFn: async () => {
      const res = await api.get('/restaurant/hotel/rate-plans');
      return res.data;
    }
  });

  const mutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editingItem) return api.put(`/restaurant/hotel/rate-plans/${editingItem.id}`, payload);
      return api.post('/restaurant/hotel/rate-plans', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel', 'rate-plans'] });
      toast({ title: `Rate plan ${editingItem ? 'updated' : 'created'} successfully` });
      handleCloseModal();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/restaurant/hotel/rate-plans/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel', 'rate-plans'] });
      toast({ title: 'Rate plan deleted' });
    }
  });

  const handleOpenModal = (item?: RatePlan) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        name: item.name,
        planType: item.planType,
        cancellationHours: item.cancellationHours?.toString() || '',
        cancellationFeePercent: item.cancellationFeePercent || '',
        description: item.description || '',
        isActive: item.isActive
      });
    } else {
      setEditingItem(null);
      setFormData({
        name: '',
        planType: 'EP',
        cancellationHours: '24',
        cancellationFeePercent: '100',
        description: '',
        isActive: true
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
    mutation.mutate({
      ...formData,
      cancellationHours: formData.cancellationHours ? parseInt(formData.cancellationHours) : null
    });
  };

  const filteredData = useMemo(() => {
    const items = data?.data || [];
    if (!search) return items;
    return items.filter((rp: RatePlan) => 
      rp.name.toLowerCase().includes(search.toLowerCase()) ||
      rp.planType.toLowerCase().includes(search.toLowerCase())
    );
  }, [data, search]);

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-card/50 backdrop-blur-md border border-border p-5 rounded-2xl shadow-xl shadow-black/10">
        <div>
          <h1 className="text-2xl font-black text-text-primary tracking-tight">Rate Strategy</h1>
          <p className="text-sm text-text-muted mt-1 font-medium">Define pricing plans and cancellation policies</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              className="bg-bg-dark border border-border rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-blue-500/50 outline-none transition-all w-full md:w-64"
              placeholder="Search plans..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Button onClick={() => handleOpenModal()} variant="primary" className="shadow-lg shadow-blue-500/30 font-extrabold px-6 text-xs uppercase tracking-widest">
            <Plus className="w-4 h-4 mr-2" />
            New Plan
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          [1, 2, 3].map(i => <Skeleton key={i} className="h-64 rounded-2xl" />)
        ) : filteredData.length === 0 ? (
          <Card className="col-span-full p-12 text-center border-dashed border-2 border-border/60 bg-bg-card/30 rounded-2xl">
             <Tag className="w-12 h-12 text-text-muted mx-auto mb-4 opacity-20" />
             <h3 className="text-lg font-bold text-text-primary">No rate plans found</h3>
             <p className="text-sm text-text-muted mt-2">Create custom pricing strategies for different seasons or guest types.</p>
          </Card>
        ) : (
          filteredData.map((plan: RatePlan) => (
            <Card key={plan.id} className="group overflow-hidden border-border/40 hover:border-blue-500/40 transition-all hover:shadow-2xl hover:shadow-blue-500/5 rounded-2xl h-full bg-gradient-to-b from-bg-card/80 to-bg-card">
               <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                     <div>
                        <Badge variant="primary" className="mb-2 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest bg-blue-500/10 text-blue-400 border-blue-500/20">
                          {plan.planType} PLAN
                        </Badge>
                        <h3 className="text-xl font-black text-text-primary group-hover:text-blue-400 transition-colors uppercase tracking-tight">{plan.name}</h3>
                     </div>
                     <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleOpenModal(plan)}><Pencil className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500/50 hover:text-red-500 hover:bg-red-500/10" onClick={() => deleteMutation.mutate(plan.id)}><Trash2 className="w-4 h-4" /></Button>
                     </div>
                  </div>

                  <p className="text-xs text-text-muted mb-6 font-medium leading-relaxed italic line-clamp-2">
                     {plan.description || 'No special terms or description provided for this rate plan.'}
                  </p>

                  <div className="space-y-3">
                     <div className="flex items-center justify-between p-3 bg-bg-dark/40 rounded-xl border border-border/40">
                        <div className="flex items-center gap-2.5">
                           <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                              <ShieldCheck className="w-4 h-4 text-red-400" />
                           </div>
                           <span className="text-[10px] uppercase font-black text-text-muted tracking-wider">Cancellation</span>
                        </div>
                        <span className="text-xs font-bold text-text-primary">Within {plan.cancellationHours || '0'} Hrs</span>
                     </div>
                     <div className="flex items-center justify-between p-3 bg-bg-dark/40 rounded-xl border border-border/40">
                        <div className="flex items-center gap-2.5">
                           <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                              <Percent className="w-4 h-4 text-green-400" />
                           </div>
                           <span className="text-[10px] uppercase font-black text-text-muted tracking-wider">Penalty Fee</span>
                        </div>
                        <span className="text-xs font-bold text-text-primary">{plan.cancellationFeePercent || '0'}% of Package</span>
                     </div>
                  </div>
               </div>

               <div className="px-6 py-4 bg-bg-dark/20 border-t border-border/40 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                     <div className={`w-2 h-2 rounded-full ${plan.isActive ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`} />
                     <span className={`text-[10px] font-black uppercase tracking-widest ${plan.isActive ? 'text-green-500/80' : 'text-red-500/80'}`}>
                        {plan.isActive ? 'Active' : 'Archived'}
                     </span>
                  </div>
                  <div className="text-[10px] font-mono text-text-muted uppercase italic">Enabled {formatDate(plan.createdAt)}</div>
               </div>
            </Card>
          ))
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingItem ? 'Edit Rate Strategy' : 'Configure New Strategy'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="p-1 space-y-6">
          <div className="space-y-4">
             <div className="space-y-2">
                <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Strategy Name <span className="text-red-500">*</span></Label>
                <Input
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Early Bird Special"
                  required
                  className="font-black h-12 text-lg"
                />
             </div>

             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                   <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Plan Type</Label>
                   <select
                      className="w-full bg-bg-dark border border-border rounded-xl px-4 h-11 text-sm font-bold text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none transition-all cursor-pointer"
                      value={formData.planType}
                      onChange={e => setFormData({ ...formData, planType: e.target.value })}
                   >
                     <option value="EP">EP (Room Only)</option>
                     <option value="CP">CP (Breakfast)</option>
                     <option value="MAP">MAP (Half Board)</option>
                     <option value="AP">AP (Full Board)</option>
                     <option value="NR">Non-Refundable</option>
                   </select>
                </div>
                <div className="flex items-center gap-3 mt-8 ml-4">
                  <input 
                     type="checkbox" 
                     id="isActivePlan"
                     checked={formData.isActive}
                     onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                     className="w-4 h-4 rounded border-border"
                  />
                  <Label htmlFor="isActivePlan" className="text-xs font-black uppercase tracking-widest cursor-pointer">Live Strategy</Label>
                </div>
             </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-border/40">
             <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-red-400">
                <ShieldCheck className="w-3 h-3" /> Cancellation Policy
             </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                   <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Free Cancellation Within</Label>
                   <div className="relative">
                      <Input
                        type="number"
                        value={formData.cancellationHours}
                        onChange={e => setFormData({ ...formData, cancellationHours: e.target.value })}
                        className="font-bold h-11 pr-12"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-text-muted">HRS</span>
                   </div>
                </div>
                <div className="space-y-2">
                   <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Penalty Percent</Label>
                   <div className="relative">
                      <Input
                        type="number"
                        value={formData.cancellationFeePercent}
                        onChange={e => setFormData({ ...formData, cancellationFeePercent: e.target.value })}
                        className="font-bold h-11 pr-12"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-text-muted">%</span>
                   </div>
                </div>
             </div>
             <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl flex gap-3 text-xs text-blue-400/80 font-medium italic">
                <Info className="w-4 h-4 shrink-0" />
                Penalty is calculated on the total package amount.
             </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Plan Description & Inclusion</Label>
            <textarea
              className="w-full h-24 bg-bg-dark border border-border rounded-xl p-4 text-text-primary text-sm focus:ring-2 focus:ring-blue-500/50 transition-all outline-none font-medium leading-relaxed italic"
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="Detail what is included in this rate plan..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-border mt-4">
            <Button type="button" variant="ghost" onClick={handleCloseModal} className="font-black uppercase tracking-widest text-[10px]">
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={mutation.isPending} className="px-10 font-black uppercase tracking-widest text-[10px]">
              {editingItem ? 'Update Strategy' : 'Save Strategy'}
            </Button>
          </div>
        </form>
      <Modal
        mode="slide"
    </div>
  );
}
