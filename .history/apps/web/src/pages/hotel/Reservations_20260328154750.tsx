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
import { Plus, Search, Pencil, Trash2, Loader2, Eye } from 'lucide-react';
import { formatDate, formatCurrency, getStatusColor } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface Reservation {
  id: number;
  guestId: number;
  guest?: { firstName: string; lastName: string; email: string };
  checkInDate: string;
  checkOutDate: string;
  numberOfRooms: number;
  totalPrice: number;
  status: string;
  createdAt: string;
}

interface FormData {
  guestId: string;
  checkInDate: string;
  checkOutDate: string;
  numberOfRooms: string;
  totalPrice: string;
  status: string;
}

export default function Reservations() {
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [formData, setFormData] = useState<FormData>({
    guestId: '',
    checkInDate: '',
    checkOutDate: '',
    numberOfRooms: '',
    totalPrice: '',
    status: 'confirmed',
  });

  const { data: reservationsData, isLoading: reservationsLoading, refetch: refetchReservations } = useQuery({
    queryKey: ['hotel-reservations', search],
    queryFn: () => api.get('/restaurant/hotel/reservations').then((r) => r.data),
    staleTime: 30000,
  });

  const { data: guestsData } = useQuery({
    queryKey: ['hotel-guests'],
    queryFn: () => api.get('/restaurant/hotel/guests').then((r) => r.data),
  });

  const reservations = reservationsData?.data || [];
  const guests = guestsData?.data || [];

  const filteredData = useMemo(() => {
    return reservations.filter((r: Reservation) =>
      (r.guest?.firstName && r.guest.firstName.toLowerCase().includes(search.toLowerCase())) ||
      (r.guest?.lastName && r.guest.lastName.toLowerCase().includes(search.toLowerCase())) ||
      r.status.toLowerCase().includes(search.toLowerCase())
    );
  }, [reservations, search]);

  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  const handleCreate = async () => {
    if (!formData.guestId) {
      toast.error('Guest is required');
      return;
    }
    if (!formData.checkInDate || !formData.checkOutDate) {
      toast.error('Check-in and check-out dates are required');
      return;
    }
    if (!formData.numberOfRooms || isNaN(Number(formData.numberOfRooms))) {
      toast.error('Valid number of rooms is required');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingId) {
        await api.put(`/restaurant/hotel/reservations/${editingId}`, {
          guestId: Number(formData.guestId),
          checkInDate: formData.checkInDate,
          checkOutDate: formData.checkOutDate,
          numberOfRooms: Number(formData.numberOfRooms),
          totalPrice: Number(formData.totalPrice) || 0,
          status: formData.status,
        });
        toast.success('Reservation updated!');
      } else {
        await api.post('/restaurant/hotel/reservations', {
          guestId: Number(formData.guestId),
          checkInDate: formData.checkInDate,
          checkOutDate: formData.checkOutDate,
          numberOfRooms: Number(formData.numberOfRooms),
          totalPrice: Number(formData.totalPrice) || 0,
          status: formData.status,
        });
        toast.success('Reservation created!');
      }
      setShowModal(false);
      resetForm();
      refetchReservations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save reservation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (reservation: Reservation) => {
    setEditingId(reservation.id);
    setFormData({
      guestId: reservation.guestId.toString(),
      checkInDate: reservation.checkInDate,
      checkOutDate: reservation.checkOutDate,
      numberOfRooms: reservation.numberOfRooms.toString(),
      totalPrice: reservation.totalPrice.toString(),
      status: reservation.status,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm(`Delete this reservation?`)) return;
    try {
      await api.delete(`/restaurant/hotel/reservations/${id}`);
      toast.success('Reservation deleted');
      refetchReservations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  const resetForm = () => {
    setFormData({ guestId: '', checkInDate: '', checkOutDate: '', numberOfRooms: '', totalPrice: '', status: 'confirmed' });
    setEditingId(null);
  };

  const exportData = reservations.map((r: Reservation) => ({
    'Guest': r.guest ? `${r.guest.firstName} ${r.guest.lastName}` : '—',
    'Check-In': formatDate(r.checkInDate),
    'Check-Out': formatDate(r.checkOutDate),
    'Rooms': r.numberOfRooms,
    'Total Price': formatCurrency(r.totalPrice),
    'Status': r.status,
    'Created': formatDate(r.createdAt),
  }));

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Reservations</h1>
          <p className="text-sm text-text-muted mt-1">{filteredData.length} reservations</p>
        </div>
        <div className="flex gap-3">
          {reservations.length > 0 && <ExportDropdown data={exportData} filename="reservations" title="Reservations Report" size="md" />}
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowModal(true)}>New Reservation</Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          className="glass-input w-full pl-10 text-sm"
          placeholder="Search reservations..."
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
                <th className="text-left py-3 px-5 font-medium">Guest</th>
                <th className="text-left py-3 px-5 font-medium">Check-In</th>
                <th className="text-left py-3 px-5 font-medium">Check-Out</th>
                <th className="text-left py-3 px-5 font-medium">Rooms</th>
                <th className="text-left py-3 px-5 font-medium">Total Price</th>
                <th className="text-left py-3 px-5 font-medium">Status</th>
                <th className="text-right py-3 px-5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reservationsLoading ? (
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
                    {search ? 'No reservations found' : 'No reservations yet. Create one to get started!'}
                  </td>
                </tr>
              ) : (
                paginatedData.map((reservation: Reservation) => (
                  <tr key={reservation.id} className="table-row">
                    <td className="py-3 px-5 text-text-primary font-medium">
                      {reservation.guest ? `${reservation.guest.firstName} ${reservation.guest.lastName}` : '—'}
                    </td>
                    <td className="py-3 px-5 text-text-secondary">{formatDate(reservation.checkInDate)}</td>
                    <td className="py-3 px-5 text-text-secondary">{formatDate(reservation.checkOutDate)}</td>
                    <td className="py-3 px-5 text-text-secondary">{reservation.numberOfRooms}</td>
                    <td className="py-3 px-5 font-medium text-text-primary">{formatCurrency(reservation.totalPrice)}</td>
                    <td className="py-3 px-5"><Badge className={getStatusColor(reservation.status)}>{reservation.status}</Badge></td>
                    <td className="py-3 px-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(reservation)} title="Edit">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(reservation.id)} className="text-danger hover:bg-danger/10" title="Delete">
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
      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editingId ? "Edit Reservation" : "New Reservation"} size="lg">
        <div className="space-y-4">
          <Select
            label="Guest"
            value={formData.guestId}
            onChange={(e) => setFormData({ ...formData, guestId: e.target.value })}
          >
            <option value="">— Select Guest —</option>
            {guests.map((g: any) => (
              <option key={g.id} value={g.id}>{g.firstName} {g.lastName}</option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Check-In Date"
              type="date"
              value={formData.checkInDate}
              onChange={(e) => setFormData({ ...formData, checkInDate: e.target.value })}
            />
            <Input
              label="Check-Out Date"
              type="date"
              value={formData.checkOutDate}
              onChange={(e) => setFormData({ ...formData, checkOutDate: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Number of Rooms"
              type="number"
              value={formData.numberOfRooms}
              onChange={(e) => setFormData({ ...formData, numberOfRooms: e.target.value })}
              placeholder="1"
            />
            <Input
              label="Total Price"
              type="number"
              value={formData.totalPrice}
              onChange={(e) => setFormData({ ...formData, totalPrice: e.target.value })}
              placeholder="0.00"
            />
            <Select
              label="Status"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            >
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="secondary" onClick={() => { setShowModal(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editingId ? 'Update Reservation' : 'Create Reservation'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
