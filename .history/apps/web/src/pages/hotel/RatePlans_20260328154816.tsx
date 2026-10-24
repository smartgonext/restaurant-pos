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

interface RatePlan {
  id: number;
  name: string;
  description?: string;
  roomTypeId: number;
  roomType?: { name: string };
  basePrice: number;
  seasonType: string;
  discount?: number;
  isActive: boolean;
  createdAt: string;
}

interface FormData {
  name: string;
  description: string;
  roomTypeId: string;
  basePrice: string;
  seasonType: string;
  discount: string;
  isActive: boolean;
}

export default function RatePlans() {
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    roomTypeId: '',
    basePrice: '',
    seasonType: 'standard',
    discount: '',
    isActive: true,
  });

  const { data: ratePlansData, isLoading: ratePlansLoading, refetch: refetchRatePlans } = useQuery({
    queryKey: ['hotel-rate-plans', search],
    queryFn: () => api.get('/restaurant/hotel/rate-plans').then((r) => r.data),
    staleTime: 30000,
  });

  const { data: roomTypesData } = useQuery({
    queryKey: ['hotel-room-types'],
    queryFn: () => api.get('/restaurant/hotel/room-types').then((r) => r.data),
  });

  const ratePlans = ratePlansData?.data || [];
  const roomTypes = roomTypesData?.data || [];

  const filteredData = useMemo(() => {
    return ratePlans.filter((rp: RatePlan) =>
      rp.name.toLowerCase().includes(search.toLowerCase()) ||
      (rp.roomType?.name && rp.roomType.name.toLowerCase().includes(search.toLowerCase()))
    );
  }, [ratePlans, search]);

  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error('Plan name is required');
      return;
    }
    if (!formData.roomTypeId) {
      toast.error('Room type is required');
      return;
    }
    if (!formData.basePrice || isNaN(Number(formData.basePrice))) {
      toast.error('Valid base price is required');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingId) {
        await api.put(`/restaurant/hotel/rate-plans/${editingId}`, {
          name: formData.name,
          description: formData.description,
          roomTypeId: Number(formData.roomTypeId),
          basePrice: Number(formData.basePrice),
          seasonType: formData.seasonType,
          discount: formData.discount ? Number(formData.discount) : 0,
          isActive: formData.isActive,
        });
        toast.success('Rate plan updated!');
      } else {
        await api.post('/restaurant/hotel/rate-plans', {
          name: formData.name,
          description: formData.description,
          roomTypeId: Number(formData.roomTypeId),
          basePrice: Number(formData.basePrice),
          seasonType: formData.seasonType,
          discount: formData.discount ? Number(formData.discount) : 0,
          isActive: formData.isActive,
        });
        toast.success('Rate plan created!');
      }
      setShowModal(false);
      resetForm();
      refetchRatePlans();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save rate plan');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (ratePlan: RatePlan) => {
    setEditingId(ratePlan.id);
    setFormData({
      name: ratePlan.name,
      description: ratePlan.description || '',
      roomTypeId: ratePlan.roomTypeId.toString(),
      basePrice: ratePlan.basePrice.toString(),
      seasonType: ratePlan.seasonType,
      discount: ratePlan.discount?.toString() || '',
      isActive: ratePlan.isActive,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await api.delete(`/restaurant/hotel/rate-plans/${id}`);
      toast.success('Rate plan deleted');
      refetchRatePlans();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  const resetForm = () => {
    setFormData({ name: '', description: '', roomTypeId: '', basePrice: '', seasonType: 'standard', discount: '', isActive: true });
    setEditingId(null);
  };

  const exportData = ratePlans.map((rp: RatePlan) => ({
    'Plan Name': rp.name,
    'Room Type': rp.roomType?.name || '—',
    'Base Price': formatCurrency(rp.basePrice),
    'Season': rp.seasonType,
    'Discount': rp.discount ? `${rp.discount}%` : '—',
    'Status': rp.isActive ? 'Active' : 'Inactive',
    'Created': formatDate(rp.createdAt),
  }));

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Rate Plans</h1>
          <p className="text-sm text-text-muted mt-1">{filteredData.length} rate plans</p>
        </div>
        <div className="flex gap-3">
          {ratePlans.length > 0 && <ExportDropdown data={exportData} filename="rate-plans" title="Rate Plans Report" size="md" />}
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowModal(true)}>Add Plan</Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          className="glass-input w-full pl-10 text-sm"
          placeholder="Search rate plans..."
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
                <th className="text-left py-3 px-5 font-medium">Plan Name</th>
                <th className="text-left py-3 px-5 font-medium">Room Type</th>
                <th className="text-left py-3 px-5 font-medium">Base Price</th>
                <th className="text-left py-3 px-5 font-medium">Season</th>
                <th className="text-left py-3 px-5 font-medium">Discount</th>
                <th className="text-left py-3 px-5 font-medium">Status</th>
                <th className="text-right py-3 px-5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {ratePlansLoading ? (
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
                    {search ? 'No rate plans found' : 'No rate plans yet. Create one to get started!'}
                  </td>
                </tr>
              ) : (
                paginatedData.map((ratePlan: RatePlan) => (
                  <tr key={ratePlan.id} className="table-row">
                    <td className="py-3 px-5 text-text-primary font-medium">{ratePlan.name}</td>
                    <td className="py-3 px-5 text-text-secondary">{ratePlan.roomType?.name || '—'}</td>
                    <td className="py-3 px-5 font-medium text-text-primary">{formatCurrency(ratePlan.basePrice)}</td>
                    <td className="py-3 px-5"><Badge className="bg-info/10 text-info">{ratePlan.seasonType}</Badge></td>
                    <td className="py-3 px-5 text-text-secondary">{ratePlan.discount ? `${ratePlan.discount}%` : '—'}</td>
                    <td className="py-3 px-5"><Badge className={ratePlan.isActive ? 'bg-success/10 text-success' : 'bg-text-muted/10 text-text-muted'}>{ratePlan.isActive ? 'Active' : 'Inactive'}</Badge></td>
                    <td className="py-3 px-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(ratePlan)} title="Edit">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(ratePlan.id, ratePlan.name)} className="text-danger hover:bg-danger/10" title="Delete">
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
      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editingId ? "Edit Rate Plan" : "Add Rate Plan"} size="lg">
        <div className="space-y-4">
          <Input
            label="Plan Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. Summer Peak"
          />
          <Input
            label="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Plan description"
          />
          <Select
            label="Room Type"
            value={formData.roomTypeId}
            onChange={(e) => setFormData({ ...formData, roomTypeId: e.target.value })}
          >
            <option value="">— Select Room Type —</option>
            {roomTypes.map((rt: any) => (
              <option key={rt.id} value={rt.id}>{rt.name}</option>
            ))}
          </Select>
          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Base Price"
              type="number"
              value={formData.basePrice}
              onChange={(e) => setFormData({ ...formData, basePrice: e.target.value })}
              placeholder="0.00"
            />
            <Select
              label="Season"
              value={formData.seasonType}
              onChange={(e) => setFormData({ ...formData, seasonType: e.target.value })}
            >
              <option value="standard">Standard</option>
              <option value="peak">Peak</option>
              <option value="offpeak">Off-Peak</option>
            </Select>
            <Input
              label="Discount %"
              type="number"
              value={formData.discount}
              onChange={(e) => setFormData({ ...formData, discount: e.target.value })}
              placeholder="0"
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm font-medium text-text-primary">Active</span>
          </label>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="secondary" onClick={() => { setShowModal(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editingId ? 'Update Plan' : 'Create Plan'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
