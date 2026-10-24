import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Plus, Search, Pencil, Trash2, BedDouble, Layers, CheckCircle, AlertCircle, MoreHorizontal } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import api from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

interface Room {
  id: number;
  roomNumber: string;
  roomTypeId: number;
  roomType?: { name: string; basePricePerNight: string };
  floor: number | null;
  status: string;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
}

export default function Rooms() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Room | null>(null);
  
  const [formData, setFormData] = useState({
    roomNumber: '',
    roomTypeId: '',
    floor: '',
    status: 'vacant_clean',
    notes: '',
    isActive: true
  });

  const { data: roomsData, isLoading: roomsLoading } = useQuery({
    queryKey: ['hotel', 'rooms'],
    queryFn: async () => {
      const res = await api.get('/restaurant/hotel/rooms');
      return res.data;
    }
  });

  const { data: roomTypesData } = useQuery({
    queryKey: ['hotel', 'room-types'],
    queryFn: async () => {
      const res = await api.get('/restaurant/hotel/room-types');
      return res.data;
    }
  });

  const mutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editingItem) {
        return api.put(`/restaurant/hotel/rooms/${editingItem.id}`, payload);
      }
      return api.post('/restaurant/hotel/rooms', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel', 'rooms'] });
      toast({ title: `Room ${editingItem ? 'updated' : 'created'} successfully` });
      handleCloseModal();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/restaurant/hotel/rooms/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel', 'rooms'] });
      toast({ title: 'Room deleted' });
    }
  });

  const handleOpenModal = (item?: Room) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        roomNumber: item.roomNumber,
        roomTypeId: item.roomTypeId.toString(),
        floor: item.floor?.toString() || '',
        status: item.status,
        notes: item.notes || '',
        isActive: item.isActive
      });
    } else {
      setEditingItem(null);
      setFormData({
        roomNumber: '',
        roomTypeId: '',
        floor: '',
        status: 'vacant_clean',
        notes: '',
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
      roomTypeId: parseInt(formData.roomTypeId),
      floor: formData.floor ? parseInt(formData.floor) : null
    });
  };

  const filteredData = useMemo(() => {
    const items = roomsData?.data || [];
    if (!search) return items;
    return items.filter((r: Room) => 
      r.roomNumber.toLowerCase().includes(search.toLowerCase()) ||
      (r.roomType?.name && r.roomType.name.toLowerCase().includes(search.toLowerCase()))
    );
  }, [roomsData, search]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'occupied': return <Badge className="bg-red-500/10 text-red-500 border-red-500/20 font-black tracking-widest text-[10px] uppercase px-2 py-0.5">Occupied</Badge>;
      case 'reserved': return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 font-black tracking-widest text-[10px] uppercase px-2 py-0.5">Reserved</Badge>;
      case 'vacant_dirty': return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 font-black tracking-widest text-[10px] uppercase px-2 py-0.5">Dirty</Badge>;
      case 'maintenance': return <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20 font-black tracking-widest text-[10px] uppercase px-2 py-0.5">Maintenance</Badge>;
      default: return <Badge className="bg-green-500/10 text-green-500 border-green-500/20 font-black tracking-widest text-[10px] uppercase px-2 py-0.5">Available</Badge>;
    }
  };

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-card/50 backdrop-blur-md border border-border p-5 rounded-2xl shadow-xl shadow-black/10">
        <div>
          <h1 className="text-2xl font-black text-text-primary tracking-tight">Room Inventory</h1>
          <p className="text-sm text-text-muted mt-1 font-medium">Manage individual rooms and their status</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              className="bg-bg-dark border border-border rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-blue-500/50 outline-none transition-all w-full md:w-64"
              placeholder="Search by room #..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Button onClick={() => handleOpenModal()} variant="primary" className="shadow-lg shadow-blue-500/30 font-extrabold px-6 text-xs uppercase tracking-widest">
            <Plus className="w-4 h-4 mr-2" />
            Add Room
          </Button>
        </div>
      </div>

      <Card padding={false} className="overflow-hidden border-border/40 rounded-2xl shadow-xl bg-bg-card/50">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-dark/50 text-[10px] font-black uppercase tracking-[0.15em] text-text-muted">
                <th className="text-left py-4 px-6 italic">Room Details</th>
                <th className="text-left py-4 px-6 italic">Category</th>
                <th className="text-left py-4 px-6 italic">Current Status</th>
                <th className="text-left py-4 px-6 italic">Availability</th>
                <th className="text-right py-4 px-6 italic">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {roomsLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="py-4 px-6"><Skeleton className="h-10 w-32 rounded-lg" /></td>
                    <td className="py-4 px-6"><Skeleton className="h-10 w-40 rounded-lg" /></td>
                    <td className="py-4 px-6"><Skeleton className="h-10 w-24 rounded-lg" /></td>
                    <td className="py-4 px-6"><Skeleton className="h-10 w-24 rounded-lg" /></td>
                    <td className="py-4 px-6 text-right"><Skeleton className="h-8 w-8 ml-auto rounded-full" /></td>
                  </tr>
                ))
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center font-bold text-text-muted italic opacity-50">
                    No rooms currently in inventory.
                  </td>
                </tr>
              ) : (
                filteredData.map((room: Room) => (
                  <tr key={room.id} className="group hover:bg-blue-500/[0.02] transition-colors">
                    <td className="py-4 px-6">
                       <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-bg-dark border border-border flex items-center justify-center text-text-primary font-black group-hover:border-blue-500/40 transition-colors">
                             {room.roomNumber}
                          </div>
                          <div>
                            <p className="font-black text-text-primary text-base leading-none tracking-tight">Floor {room.floor || 'G'}</p>
                            <p className="text-[10px] text-text-muted mt-1 font-mono uppercase tracking-widest">Added {formatDate(room.createdAt)}</p>
                          </div>
                       </div>
                    </td>
                    <td className="py-4 px-6">
                       <Badge variant="outline" className="border-border/60 text-[10px] font-bold py-0 bg-transparent text-text-secondary">
                          {room.roomType?.name || 'Uncategorized'}
                       </Badge>
                    </td>
                    <td className="py-4 px-6">
                       {getStatusBadge(room.status)}
                    </td>
                    <td className="py-4 px-6">
                       <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${room.isActive ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`} />
                          <span className={`text-[10px] font-black uppercase tracking-widest ${room.isActive ? 'text-green-500/80' : 'text-red-500/80'}`}>
                             {room.isActive ? 'Enabled' : 'Disabled'}
                          </span>
                       </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                       <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                          <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-blue-500/10 hover:text-blue-400" onClick={() => handleOpenModal(room)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-red-500/10 hover:text-red-400" onClick={() => deleteMutation.mutate(room.id)}>
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
        title={editingItem ? 'Edit Room Record' : 'Create Room Record'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="p-1 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Room # <span className="text-red-500 font-extrabold">*</span></Label>
              <Input
                value={formData.roomNumber}
                onChange={e => setFormData({ ...formData, roomNumber: e.target.value })}
                placeholder="e.g. 101"
                required
                className="font-black text-lg h-12"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Floor Level</Label>
              <Input
                type="number"
                value={formData.floor}
                onChange={e => setFormData({ ...formData, floor: e.target.value })}
                placeholder="0 for Ground"
                className="font-bold text-lg h-12"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Room Category <span className="text-red-500 font-extrabold">*</span></Label>
            <select
               className="w-full bg-bg-dark border border-border rounded-xl px-4 h-11 text-sm font-bold text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none transition-all cursor-pointer"
               value={formData.roomTypeId}
               onChange={e => setFormData({ ...formData, roomTypeId: e.target.value })}
               required
            >
              <option value="">Select Category</option>
              {(roomTypesData?.data || []).map((rt: any) => (
                <option key={rt.id} value={rt.id}>{rt.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Initial Status</Label>
              <select
                 className="w-full bg-bg-dark border border-border rounded-xl px-4 h-11 text-sm font-bold text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none transition-all cursor-pointer"
                 value={formData.status}
                 onChange={e => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="vacant_clean">Vacant Clean</option>
                <option value="vacant_dirty">Vacant Dirty</option>
                <option value="occupied">Occupied</option>
                <option value="reserved">Reserved</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Module Access</Label>
              <div className="flex items-center gap-2 h-11 px-4 bg-bg-dark border border-border rounded-xl">
                 <input 
                    type="checkbox" 
                    id="isActive"
                    checked={formData.isActive}
                    onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-4 h-4 rounded border-border text-blue-500 focus:ring-blue-500 focus:ring-offset-0 bg-transparent cursor-pointer"
                 />
                 <Label htmlFor="isActive" className="text-sm font-bold cursor-pointer">Available for Booking</Label>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Management Notes</Label>
            <textarea
              className="w-full h-24 bg-bg-dark border border-border rounded-xl p-4 text-text-primary text-sm focus:ring-2 focus:ring-blue-500/50 transition-all outline-none font-medium leading-relaxed italic"
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Internal notes about room history or issues..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-border mt-4">
            <Button type="button" variant="ghost" onClick={handleCloseModal} className="font-black uppercase tracking-widest text-[10px]">
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={mutation.isPending} className="px-10 font-black uppercase tracking-widest text-[10px]">
              {editingItem ? 'Update Room' : 'Create Room'}
            </Button>
          </div>
        </form>
      <Modal
        mode="slide"
    </div>
  );
}
