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
import { formatDate, getStatusColor } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface Room {
  id: number;
  roomNumber: string;
  roomTypeId: number;
  roomType?: { name: string; basePrice: number };
  floor: number;
  status: string;
  createdAt: string;
}

interface FormData {
  roomNumber: string;
  roomTypeId: string;
  floor: string;
  status: string;
}

export default function Rooms() {
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [formData, setFormData] = useState<FormData>({
    roomNumber: '',
    roomTypeId: '',
    floor: '',
    status: 'available',
  });

  const { data: roomsData, isLoading: roomsLoading, refetch: refetchRooms } = useQuery({
    queryKey: ['hotel-rooms', search],
    queryFn: () => api.get('/restaurant/hotel/rooms').then((r) => r.data),
    staleTime: 30000,
  });

  const { data: roomTypesData } = useQuery({
    queryKey: ['hotel-room-types'],
    queryFn: () => api.get('/restaurant/hotel/room-types').then((r) => r.data),
  });

  const rooms = roomsData?.data || [];
  const roomTypes = roomTypesData?.data || [];

  const filteredData = useMemo(() => {
    return rooms.filter((r: Room) =>
      r.roomNumber.toLowerCase().includes(search.toLowerCase()) ||
      (r.roomType?.name && r.roomType.name.toLowerCase().includes(search.toLowerCase()))
    );
  }, [rooms, search]);

  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  const handleCreate = async () => {
    if (!formData.roomNumber.trim()) {
      toast.error('Room number is required');
      return;
    }
    if (!formData.roomTypeId) {
      toast.error('Room type is required');
      return;
    }
    if (!formData.floor || isNaN(Number(formData.floor))) {
      toast.error('Valid floor number is required');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingId) {
        await api.put(`/restaurant/hotel/rooms/${editingId}`, {
          roomNumber: formData.roomNumber,
          roomTypeId: Number(formData.roomTypeId),
          floor: Number(formData.floor),
          status: formData.status,
        });
        toast.success('Room updated!');
      } else {
        await api.post('/restaurant/hotel/rooms', {
          roomNumber: formData.roomNumber,
          roomTypeId: Number(formData.roomTypeId),
          floor: Number(formData.floor),
          status: formData.status,
        });
        toast.success('Room created!');
      }
      setShowModal(false);
      resetForm();
      refetchRooms();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save room');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (room: Room) => {
    setEditingId(room.id);
    setFormData({
      roomNumber: room.roomNumber,
      roomTypeId: room.roomTypeId.toString(),
      floor: room.floor.toString(),
      status: room.status,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await api.delete(`/restaurant/hotel/rooms/${id}`);
      toast.success('Room deleted');
      refetchRooms();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  const resetForm = () => {
    setFormData({ roomNumber: '', roomTypeId: '', floor: '', status: 'available' });
    setEditingId(null);
  };

  const exportData = rooms.map((r: Room) => ({
    'Room Number': r.roomNumber,
    'Room Type': r.roomType?.name || '—',
    'Floor': r.floor,
    'Status': r.status,
    'Created': formatDate(r.createdAt),
  }));

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Rooms</h1>
          <p className="text-sm text-text-muted mt-1">{filteredData.length} rooms</p>
        </div>
        <div className="flex gap-3">
          {rooms.length > 0 && <ExportDropdown data={exportData} filename="rooms" title="Rooms Report" size="md" />}
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowModal(true)}>Add Room</Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          className="glass-input w-full pl-10 text-sm"
          placeholder="Search rooms..."
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
                <th className="text-left py-3 px-5 font-medium">Room Number</th>
                <th className="text-left py-3 px-5 font-medium">Room Type</th>
                <th className="text-left py-3 px-5 font-medium">Floor</th>
                <th className="text-left py-3 px-5 font-medium">Status</th>
                <th className="text-left py-3 px-5 font-medium">Created</th>
                <th className="text-right py-3 px-5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {roomsLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="table-row">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="py-3 px-5"><Skeleton className="h-4 w-20" /></td>
                    ))}
                  </tr>
                ))
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-text-muted">
                    {search ? 'No rooms found' : 'No rooms yet. Create one to get started!'}
                  </td>
                </tr>
              ) : (
                paginatedData.map((room: Room) => (
                  <tr key={room.id} className="table-row">
                    <td className="py-3 px-5 text-text-primary font-medium">{room.roomNumber}</td>
                    <td className="py-3 px-5 text-text-secondary">{room.roomType?.name || '—'}</td>
                    <td className="py-3 px-5 text-text-secondary">{room.floor}</td>
                    <td className="py-3 px-5"><Badge className={getStatusColor(room.status)}>{room.status}</Badge></td>
                    <td className="py-3 px-5 text-text-muted">{formatDate(room.createdAt)}</td>
                    <td className="py-3 px-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(room)} title="Edit">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(room.id, room.roomNumber)} className="text-danger hover:bg-danger/10" title="Delete">
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
      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editingId ? "Edit Room" : "Add Room"} size="md">
        <div className="space-y-4">
          <Input
            label="Room Number"
            value={formData.roomNumber}
            onChange={(e) => setFormData({ ...formData, roomNumber: e.target.value })}
            placeholder="e.g. 101"
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
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Floor"
              type="number"
              value={formData.floor}
              onChange={(e) => setFormData({ ...formData, floor: e.target.value })}
              placeholder="1"
            />
            <Select
              label="Status"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            >
              <option value="available">Available</option>
              <option value="occupied">Occupied</option>
              <option value="maintenance">Maintenance</option>
              <option value="reserved">Reserved</option>
            </Select>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="secondary" onClick={() => { setShowModal(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editingId ? 'Update Room' : 'Create Room'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
