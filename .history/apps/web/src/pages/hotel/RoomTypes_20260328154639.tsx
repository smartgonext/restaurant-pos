import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { Plus, Search, Pencil, Trash2, Loader2 } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface RoomType {
  id: number;
  name: string;
  description?: string;
  basePrice: number;
  maxOccupancy: number;
  amenities?: string[];
  category?: string;
  createdAt: string;
}

interface FormData {
  name: string;
  description: string;
  basePrice: string;
  maxOccupancy: string;
  category: string;
}

export default function RoomTypes() {
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    basePrice: '',
    maxOccupancy: '',
    category: 'standard',
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['hotel-room-types', search],
    queryFn: () => api.get('/restaurant/hotel/room-types').then((r) => r.data),
    staleTime: 30000,
  });

  const roomTypes = data?.data || [];

  // Filter and paginate
  const filteredData = useMemo(() => {
    return roomTypes.filter((rt: RoomType) =>
      rt.name.toLowerCase().includes(search.toLowerCase()) ||
      (rt.description && rt.description.toLowerCase().includes(search.toLowerCase()))
    );
  }, [roomTypes, search]);

  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error('Room type name is required');
      return;
    }
    if (!formData.basePrice || isNaN(Number(formData.basePrice))) {
      toast.error('Valid base price is required');
      return;
    }
    if (!formData.maxOccupancy || isNaN(Number(formData.maxOccupancy))) {
      toast.error('Valid max occupancy is required');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingId) {
        await api.put(`/restaurant/hotel/room-types/${editingId}`, {
          name: formData.name,
          description: formData.description,
          basePrice: Number(formData.basePrice),
          maxOccupancy: Number(formData.maxOccupancy),
          category: formData.category,
        });
        toast.success('Room type updated!');
      } else {
        await api.post('/restaurant/hotel/room-types', {
          name: formData.name,
          description: formData.description,
          basePrice: Number(formData.basePrice),
          maxOccupancy: Number(formData.maxOccupancy),
          category: formData.category,
        });
        toast.success('Room type created!');
      }
      setShowModal(false);
      resetForm();
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save room type');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (roomType: RoomType) => {
    setEditingId(roomType.id);
    setFormData({
      name: roomType.name,
      description: roomType.description || '',
      basePrice: roomType.basePrice.toString(),
      maxOccupancy: roomType.maxOccupancy.toString(),
      category: roomType.category || 'standard',
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await api.delete(`/restaurant/hotel/room-types/${id}`);
      toast.success('Room type deleted');
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  const resetForm = () => {
    setFormData({ name: '', description: '', basePrice: '', maxOccupancy: '', category: 'standard' });
    setEditingId(null);
  };

  const exportData = roomTypes.map((rt: RoomType) => ({
    'Room Type': rt.name,
    'Description': rt.description || '—',
    'Base Price': formatCurrency(rt.basePrice),
    'Max Occupancy': rt.maxOccupancy,
    'Category': rt.category || 'standard',
    'Created': formatDate(rt.createdAt),
  }));

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Room Types</h1>
          <p className="text-sm text-text-muted mt-1">{filteredData.length} room types</p>
        </div>
        <div className="flex gap-3">
          {roomTypes.length > 0 && <ExportDropdown data={exportData} filename="room-types" title="Room Types Report" size="md" />}
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowModal(true)}>Add Room Type</Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          className="glass-input w-full pl-10 text-sm"
          placeholder="Search room types..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCurrentPage(1);
          }}
        />
      </div>

      {/* Table */}
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted bg-bg-tertiary/50">
                <th className="text-left py-3 px-5 font-medium">Room Type</th>
                <th className="text-left py-3 px-5 font-medium">Description</th>
                <th className="text-left py-3 px-5 font-medium">Base Price</th>
                <th className="text-left py-3 px-5 font-medium">Max Occupancy</th>
                <th className="text-left py-3 px-5 font-medium">Category</th>
                <th className="text-left py-3 px-5 font-medium">Created</th>
                <th className="text-right py-3 px-5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="table-row">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="py-3 px-5"><Skeleton className="h-4 w-20" /></td>
                    ))}
                  </tr>
                ))
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-text-muted">
                    {search ? 'No room types found' : 'No room types yet. Create one to get started!'}
                  </td>
                </tr>
              ) : (
                paginatedData.map((roomType: RoomType) => (
                  <tr key={roomType.id} className="table-row">
                    <td className="py-3 px-5 text-text-primary font-medium">{roomType.name}</td>
                    <td className="py-3 px-5 text-text-secondary text-xs">{roomType.description || '—'}</td>
                    <td className="py-3 px-5 font-medium text-text-primary">{formatCurrency(roomType.basePrice)}</td>
                    <td className="py-3 px-5 text-text-secondary">{roomType.maxOccupancy} guests</td>
                    <td className="py-3 px-5"><Badge className="bg-info/10 text-info">{roomType.category || 'standard'}</Badge></td>
                    <td className="py-3 px-5 text-text-muted">{formatDate(roomType.createdAt)}</td>
                    <td className="py-3 px-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(roomType)} title="Edit">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(roomType.id, roomType.name)} className="text-danger hover:bg-danger/10" title="Delete">
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-border bg-bg-secondary/30">
            <p className="text-xs text-text-muted">Page {currentPage} of {totalPages}</p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Modal */}
      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editingId ? "Edit Room Type" : "Add Room Type"} size="md">
        <div className="space-y-4">
          <Input
            label="Room Type Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. Deluxe Double"
          />
          <Input
            label="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Room description and features"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Base Price"
              type="number"
              value={formData.basePrice}
              onChange={(e) => setFormData({ ...formData, basePrice: e.target.value })}
              placeholder="0.00"
            />
            <Input
              label="Max Occupancy"
              type="number"
              value={formData.maxOccupancy}
              onChange={(e) => setFormData({ ...formData, maxOccupancy: e.target.value })}
              placeholder="2"
            />
          </div>
          <Select
            label="Category"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          >
            <option value="standard">Standard</option>
            <option value="deluxe">Deluxe</option>
            <option value="suite">Suite</option>
            <option value="premium">Premium</option>
          </Select>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="secondary" onClick={() => { setShowModal(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editingId ? 'Update Room Type' : 'Create Room Type'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
