import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Pencil, Trash2, Users, X, Search, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

interface RoomType {
  id: number;
  name: string;
  description: string | null;
  baseOccupancy: number;
  maxOccupancy: number;
  basePricePerNight: string;
  amenities: string[] | null;
  status: string;
}

export default function RoomTypes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RoomType | null>(null);
  const [newAmenity, setNewAmenity] = useState('');
  const [search, setSearch] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    baseOccupancy: 1,
    maxOccupancy: 2,
    basePricePerNight: '',
    amenities: [] as string[],
    status: 'active'
  });

  const { data, isLoading } = useQuery({
    queryKey: ['hotel', 'room-types'],
    queryFn: async () => {
      const res = await api.get('/restaurant/hotel/room-types');
      return res.data;
    }
  });

  const mutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editingItem) {
        return api.put(`/restaurant/hotel/room-types/${editingItem.id}`, payload);
      }
      return api.post('/restaurant/hotel/room-types', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel', 'room-types'] });
      toast({ title: `Room type ${editingItem ? 'updated' : 'created'} successfully` });
      handleCloseModal();
    },
    onError: (err: any) => {
      toast({ 
        title: 'Error saving room type', 
        description: err.response?.data?.error || 'Something went wrong',
        variant: 'destructive' 
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/restaurant/hotel/room-types/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel', 'room-types'] });
      toast({ title: 'Room type deleted' });
    }
  });

  const handleOpenModal = (item?: RoomType) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        name: item.name,
        description: item.description || '',
        baseOccupancy: item.baseOccupancy,
        maxOccupancy: item.maxOccupancy,
        basePricePerNight: item.basePricePerNight,
        amenities: Array.isArray(item.amenities) ? item.amenities : [],
        status: item.status
      });
    } else {
      setEditingItem(null);
      setFormData({
        name: '',
        description: '',
        baseOccupancy: 1,
        maxOccupancy: 2,
        basePricePerNight: '',
        amenities: [],
        status: 'active'
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setNewAmenity('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  const addAmenity = () => {
    if (newAmenity.trim() && !formData.amenities.includes(newAmenity.trim())) {
      setFormData(prev => ({
        ...prev,
        amenities: [...prev.amenities, newAmenity.trim()]
      }));
      setNewAmenity('');
    }
  };

  const removeAmenity = (index: number) => {
    setFormData(prev => ({
      ...prev,
      amenities: prev.amenities.filter((_, i) => i !== index)
    }));
  };

  const filteredData = useMemo(() => {
    const items = data?.data || [];
    if (!search) return items;
    return items.filter((rt: RoomType) => 
      rt.name.toLowerCase().includes(search.toLowerCase()) ||
      (rt.description && rt.description.toLowerCase().includes(search.toLowerCase()))
    );
  }, [data, search]);

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-card/50 backdrop-blur-md border border-border p-5 rounded-2xl shadow-xl shadow-black/10">
        <div>
          <h1 className="text-2xl font-black text-text-primary tracking-tight">Room Types</h1>
          <p className="text-sm text-text-muted mt-1 font-medium">Configure categories with occupancy and amenities</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              className="bg-bg-dark border border-border rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-blue-500/50 outline-none transition-all w-full md:w-64"
              placeholder="Search types..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Button onClick={() => handleOpenModal()} variant="primary" className="shadow-lg shadow-blue-500/30 font-bold px-6">
            <Plus className="w-4 h-4 mr-2 stroke-[3px]" />
            New Category
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-72 w-full rounded-2xl" />)}
        </div>
      ) : filteredData.length === 0 ? (
        <Card className="p-12 text-center border-dashed border-2 border-border/60 bg-bg-card/30">
          <div className="w-16 h-16 bg-bg-dark rounded-2xl flex items-center justify-center mx-auto mb-4 border border-border">
            <Users className="w-8 h-8 text-text-muted" />
          </div>
          <h3 className="text-lg font-bold text-text-primary">No room types found</h3>
          <p className="text-sm text-text-muted max-w-xs mx-auto mt-2">Start by adding your first room category to manage your hotel rooms.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredData.map((item: RoomType) => (
            <Card key={item.id} className="group overflow-hidden border-border/40 hover:border-blue-500/40 transition-all hover:shadow-2xl hover:shadow-blue-500/5 rounded-2xl flex flex-col h-full bg-gradient-to-b from-bg-card/80 to-bg-card">
              <div className="p-6 flex-1">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <Badge variant={item.status === 'active' ? 'success' : 'secondary'} className="mb-2 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest bg-blue-500/10 text-blue-400 border-blue-500/20">
                      {item.status}
                    </Badge>
                    <h3 className="text-xl font-black text-text-primary leading-tight group-hover:text-blue-400 transition-colors">{item.name}</h3>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity translate-x-2 group-hover:translate-x-0">
                    <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-blue-500/10 hover:text-blue-400" onClick={() => handleOpenModal(item)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-red-500/10 hover:text-red-400" onClick={() => deleteMutation.mutate(item.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <p className="text-sm text-text-muted line-clamp-2 mb-5 font-medium leading-relaxed italic">
                  {item.description || 'No description provided.'}
                </p>

                <div className="grid grid-cols-2 gap-3 mb-5">
                   <div className="bg-bg-dark/50 border border-border/40 p-2.5 rounded-xl flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        <Users className="w-3.5 h-3.5 text-blue-400" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-text-muted font-bold uppercase leading-none mb-1">Base Occ.</span>
                        <span className="text-sm font-black text-text-primary leading-none">{item.baseOccupancy}</span>
                      </div>
                   </div>
                   <div className="bg-bg-dark/50 border border-border/40 p-2.5 rounded-xl flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center">
                        <Users className="w-3.5 h-3.5 text-purple-400" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-text-muted font-bold uppercase leading-none mb-1">Max Occ.</span>
                        <span className="text-sm font-black text-text-primary leading-none">{item.maxOccupancy}</span>
                      </div>
                   </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-2">
                  {Array.isArray(item.amenities) && item.amenities.length > 0 ? (
                    item.amenities.map((amenity, idx) => (
                      <span key={idx} className="text-[10px] font-bold bg-bg-dark text-text-secondary px-2.5 py-1 rounded-lg border border-border/60 group-hover:border-blue-500/20 group-hover:bg-blue-500/5 transition-all">
                        {amenity}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs italic text-text-muted font-medium opacity-50">No amenities configured</span>
                  )}
                </div>
              </div>

              <div className="px-6 py-4 bg-bg-dark/20 border-t border-border/40 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-black text-text-muted tracking-[0.2em] mb-0.5">Base Rate</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-blue-400 tracking-tight">${item.basePricePerNight}</span>
                    <span className="text-[10px] text-text-muted font-bold uppercase">/ night</span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-500/5 border border-blue-500/10 flex items-center justify-center">
                   <ArrowRight className="w-5 h-5 text-blue-400/50 group-hover:text-blue-400 transition-all group-hover:translate-x-0.5" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        mode="slide"
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingItem ? 'Edit Room Category' : 'Create New Category'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="p-1 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest text-text-muted">General Information</Label>
              <Input
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="Category Name (e.g. Deluxe Suite)"
                required
                className="h-12 text-base font-bold"
              />
            </div>

            <div className="space-y-2">
              <textarea
                className="w-full h-24 bg-bg-dark border border-border rounded-xl p-4 text-text-primary text-sm focus:ring-2 focus:ring-blue-500/50 transition-all outline-none font-medium leading-relaxed"
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="Detailed description of the room category features..."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest text-text-muted">Base Occupancy</Label>
              <Input
                type="number"
                min="1"
                value={formData.baseOccupancy}
                onChange={e => setFormData({ ...formData, baseOccupancy: parseInt(e.target.value) })}
                required
                className="font-bold"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest text-text-muted">Max Occupancy</Label>
              <Input
                type="number"
                min="1"
                value={formData.maxOccupancy}
                onChange={e => setFormData({ ...formData, maxOccupancy: parseInt(e.target.value) })}
                required
                className="font-bold"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest text-text-muted">Rate ($) Per Night</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.basePricePerNight}
                onChange={e => setFormData({ ...formData, basePricePerNight: e.target.value })}
                placeholder="0.00"
                required
                className="font-bold border-blue-500/30 bg-blue-500/5"
              />
            </div>
          </div>

          <div className="space-y-4">
            <Label className="text-xs font-black uppercase tracking-widest text-text-muted">Amenities & Features</Label>
            <div className="flex gap-2">
              <Input
                value={newAmenity}
                onChange={e => setNewAmenity(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addAmenity())}
                placeholder="Type feature (e.g. Balcony) and press Enter"
                className="flex-1 font-medium"
              />
              <Button type="button" onClick={addAmenity} variant="primary" className="shrink-0 font-bold px-6">
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 p-4 bg-bg-dark/50 border border-border rounded-xl min-h-[60px]">
              {formData.amenities.length === 0 ? (
                <div className="flex items-center gap-2 text-text-muted text-xs italic opacity-60">
                   <Plus className="w-3 h-3" /> Add features to see them here
                </div>
              ) : (
                formData.amenities.map((amenity, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-blue-500/10 text-blue-400 px-3 py-1.5 rounded-xl border border-blue-500/20 text-xs font-bold transition-all hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 group">
                    {amenity}
                    <button type="button" onClick={() => removeAmenity(idx)}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-border">
            <Button type="button" variant="ghost" onClick={handleCloseModal} className="font-bold uppercase tracking-widest text-[10px]">
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={mutation.isPending} className="px-10 font-black uppercase tracking-widest text-[10px]">
              {editingItem ? 'Update Category' : 'Create Category'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

const ArrowRight = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
);
