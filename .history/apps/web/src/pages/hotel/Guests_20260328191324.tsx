import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { Plus, Search, Pencil, Trash2, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface Guest {
  id: number;
  name: string;
  email: string;
  phone: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  createdAt: string;
}

interface FormData {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
}

export default function Guests() {
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    postalCode: '',
    country: '',
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['hotel-guests', search],
    queryFn: () => api.get('/restaurant/hotel/guests').then((r) => r.data),
    staleTime: 30000,
  });

  const guests = (data?.data || []) as Guest[];

  const filteredData = useMemo(() => {
    const q = search.toLowerCase();
    return guests.filter((g) => {
      const name = (g.name || '').toLowerCase();
      const email = (g.email || '').toLowerCase();
      const phone = String(g.phone || '');
      return name.includes(q) || email.includes(q) || phone.includes(search);
    });
  }, [guests, search]);

  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!formData.email.includes('@')) {
      toast.error('Valid email is required');
      return;
    }
    if (!formData.phone.trim()) {
      toast.error('Phone is required');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingId) {
        await api.put(`/restaurant/hotel/guests/${editingId}`, formData);
        toast.success('Guest updated!');
      } else {
        await api.post('/restaurant/hotel/guests', formData);
        toast.success('Guest created!');
      }
      setShowModal(false);
      resetForm();
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save guest');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (guest: Guest) => {
    setEditingId(guest.id);
    setFormData({
      name: guest.name,
      email: guest.email,
      phone: guest.phone,
      address: guest.address || '',
      city: guest.city || '',
      postalCode: guest.postalCode || '',
      country: guest.country || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete guest "${name}"?`)) return;
    try {
      await api.delete(`/restaurant/hotel/guests/${id}`);
      toast.success('Guest deleted');
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  const resetForm = () => {
    setFormData({ name: '', email: '', phone: '', address: '', city: '', postalCode: '', country: '' });
    setEditingId(null);
  };

  const exportData = guests.map((g: Guest) => ({
    'Name': `${g.firstName} ${g.lastName}`,
    'Email': g.email,
    'Phone': g.phone,
    'Address': g.address || '—',
    'City': g.city || '—',
    'Country': g.country || '—',
    'Created': formatDate(g.createdAt),
  }));

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Guests</h1>
          <p className="text-sm text-text-muted mt-1">{filteredData.length} guests</p>
        </div>
        <div className="flex gap-3">
          {guests.length > 0 && <ExportDropdown data={exportData} filename="guests" title="Guests Report" size="md" />}
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowModal(true)}>Add Guest</Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          className="glass-input w-full pl-10 text-sm"
          placeholder="Search guests..."
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
                <th className="text-left py-3 px-5 font-medium">Name</th>
                <th className="text-left py-3 px-5 font-medium">Email</th>
                <th className="text-left py-3 px-5 font-medium">Phone</th>
                <th className="text-left py-3 px-5 font-medium">City</th>
                <th className="text-left py-3 px-5 font-medium">Created</th>
                <th className="text-right py-3 px-5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
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
                    {search ? 'No guests found' : 'No guests yet. Create one to get started!'}
                  </td>
                </tr>
              ) : (
                paginatedData.map((guest: Guest) => (
                  <tr key={guest.id} className="table-row">
                    <td className="py-3 px-5 text-text-primary font-medium">{guest.name}</td>
                    <td className="py-3 px-5 text-text-secondary text-xs">{guest.email}</td>
                    <td className="py-3 px-5 text-text-secondary">{guest.phone}</td>
                    <td className="py-3 px-5 text-text-secondary">{guest.city || '—'}</td>
                    <td className="py-3 px-5 text-text-muted">{formatDate(guest.createdAt)}</td>
                    <td className="py-3 px-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(guest)} title="Edit">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(guest.id, `${guest.firstName} ${guest.lastName}`)} className="text-danger hover:bg-danger/10" title="Delete">
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
      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editingId ? "Edit Guest" : "Add Guest"} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="First Name"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              placeholder="John"
            />
            <Input
              label="Last Name"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              placeholder="Doe"
            />
            <Input
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="john@example.com"
            />
            <Input
              label="Phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+1 555-0123"
            />
          </div>
          <Input
            label="Address"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            placeholder="123 Main Street"
          />
          <div className="grid grid-cols-3 gap-4">
            <Input
              label="City"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              placeholder="New York"
            />
            <Input
              label="Postal Code"
              value={formData.postalCode}
              onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
              placeholder="10001"
            />
            <Input
              label="Country"
              value={formData.country}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              placeholder="USA"
            />
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="secondary" onClick={() => { setShowModal(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editingId ? 'Update Guest' : 'Create Guest'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
