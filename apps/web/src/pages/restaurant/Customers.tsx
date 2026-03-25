import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Plus, Search, Users2, ShoppingBag, Star, Edit, Trash2 } from 'lucide-react';
import { formatDate, getInitials } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function Customers() {
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', address: '' });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['customers', search],
    queryFn: () => api.get(`/restaurant/customers?search=${search}`).then((r) => r.data),
  });

  const handleCreate = async () => {
    try {
      await api.post('/restaurant/customers', formData);
      toast.success('Customer added!');
      setShowAdd(false);
      setFormData({ name: '', email: '', phone: '', address: '' });
      refetch();
    } catch (err: any) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const customers = data?.data || [];

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Customers</h1>
          <p className="text-sm text-text-muted mt-1">{data?.pagination?.total || 0} customers</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowAdd(true)}>Add Customer</Button>
      </div>

      <div className="relative w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input className="glass-input w-full pl-10 text-sm" placeholder="Search by name, email, phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted bg-bg-tertiary/50">
                <th className="text-left py-3 px-5 font-medium">Customer</th>
                <th className="text-left py-3 px-5 font-medium">Email</th>
                <th className="text-left py-3 px-5 font-medium">Phone</th>
                <th className="text-left py-3 px-5 font-medium">Total Orders</th>
                <th className="text-left py-3 px-5 font-medium">Loyalty Points</th>
                <th className="text-left py-3 px-5 font-medium">Joined</th>
                <th className="text-left py-3 px-5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="table-row">{Array.from({ length: 7 }).map((_, j) => <td key={j} className="py-3 px-5"><Skeleton className="h-4 w-20" /></td>)}</tr>
                ))
              ) : customers.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center">
                  <Users2 className="w-12 h-12 text-text-muted mx-auto mb-3" />
                  <p className="text-text-muted">No customers yet</p>
                </td></tr>
              ) : (
                customers.map((c: any) => (
                  <tr key={c.id} className="table-row">
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-primary flex items-center justify-center text-white text-xs font-bold">{getInitials(c.name)}</div>
                        <span className="font-medium text-text-primary">{c.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-5 text-text-secondary">{c.email || '—'}</td>
                    <td className="py-3 px-5 text-text-secondary">{c.phone || '—'}</td>
                    <td className="py-3 px-5"><Badge variant="info"><ShoppingBag className="w-3 h-3 mr-1" />{c.totalOrders}</Badge></td>
                    <td className="py-3 px-5"><Badge variant="warning"><Star className="w-3 h-3 mr-1" />{c.loyaltyPoints} pts</Badge></td>
                    <td className="py-3 px-5 text-text-muted">{formatDate(c.createdAt)}</td>
                    <td className="py-3 px-5">
                      <div className="flex gap-1">
                        <button className="p-1.5 rounded hover:bg-bg-hover"><Edit className="w-3.5 h-3.5 text-text-muted" /></button>
                        <button className="p-1.5 rounded hover:bg-danger/10"><Trash2 className="w-3.5 h-3.5 text-danger" /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Customer">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Alice Johnson" />
            <Input label="Phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="+1 555-0001" />
            <Input label="Email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="alice@example.com" />
          </div>
          <Input label="Address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="123 Main St" />
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Add Customer</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
