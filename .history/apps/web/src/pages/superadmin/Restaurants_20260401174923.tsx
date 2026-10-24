import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { StatCard } from '@/components/ui/StatCard';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Store, Plus, Search, MoreVertical, Pencil, Trash2, Eye, Settings } from 'lucide-react';
import { formatDate, getStatusColor } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const MODULE_OPTIONS = [
  { id: 'restaurant', label: 'Restaurant', description: 'Core restaurant POS system', required: true },
  { id: 'hotel', label: 'Hotel', description: 'Hotel management with rooms & reservations', required: false },
  { id: 'cash_register', label: 'Cash Register', description: 'Advanced cash management', required: false },
  { id: 'inventory', label: 'Inventory', description: 'Stock & inventory tracking', required: false },
  { id: 'kitchens', label: 'Kitchens', description: 'Multi-kitchen KOT system', required: false },
] as const;

export default function Restaurants() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showModules, setShowModules] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [modulesEditId, setModulesEditId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', address: '', password: 'admin123', packageId: 1, enabledModules: ['restaurant'] as string[], workerEmail: '', workerPassword: '' });
  const [modulesList, setModulesList] = useState<string[]>(['restaurant']);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['superadmin-restaurants', search],
    queryFn: () => api.get(`/superadmin/restaurants?search=${search}`).then((r) => r.data),
  });

  const { data: packagesData } = useQuery({
    queryKey: ['superadmin-packages-options'],
    queryFn: () => api.get('/superadmin/packages').then((r) => r.data),
  });

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error('Restaurant name is required');
      return;
    }
    if (formData.enabledModules.length === 0) {
      toast.error('Select at least one module');
      return;
    }
    setIsSubmitting(true);
    try {
      if (editingId) {
        await api.put(`/superadmin/restaurants/${editingId}`, {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          address: formData.address,
        });
        toast.success('Restaurant updated!');
      } else {
        await api.post('/superadmin/restaurants', {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          address: formData.address,
          password: formData.password,
          packageId: Number(formData.packageId),
          enabledModules: formData.enabledModules,
        });
        toast.success('Restaurant created!');
      }
      setShowAdd(false);
      setEditingId(null);
      resetForm();
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveModules = async () => {
    if (modulesList.length === 0) {
      toast.error('Select at least one module');
      return;
    }
    if (!modulesList.includes('restaurant') && !modulesList.includes('hotel')) {
      toast.error('At least one core module (Restaurant or Hotel) is required');
      return;
    }
    setIsSubmitting(true);
    try {
      await api.put(`/superadmin/restaurants/${modulesEditId}/modules`, {
        enabledModules: modulesList,
      });
      toast.success('Modules updated!');
      setShowModules(false);
      setModulesEditId(null);
      setModulesList(['restaurant']);
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update modules');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleModule = (moduleId: string, isAdd: boolean = true) => {
    if (isAdd) {
      setFormData({ ...formData, enabledModules: [...formData.enabledModules, moduleId] });
    } else {
      setFormData({ ...formData, enabledModules: formData.enabledModules.filter(m => m !== moduleId) });
    }
  };

  const toggleModulesList = (moduleId: string) => {
    setModulesList(prev =>
      prev.includes(moduleId)
        ? prev.filter(m => m !== moduleId)
        : [...prev, moduleId]
    );
  };

  const handleEdit = (restaurant: any) => {
    setEditingId(restaurant.id);
    setFormData({
      name: restaurant.name,
      email: restaurant.email,
      phone: restaurant.phone,
      address: restaurant.address,
      password: 'admin123',
      packageId: restaurant.subscription?.packageId || 1,
      enabledModules: restaurant.enabledModules || ['restaurant'],
    });
    setShowAdd(true);
  };

  const handleManageModules = (restaurant: any) => {
    setModulesEditId(restaurant.id);
    setModulesList(restaurant.enabledModules || ['restaurant']);
    setShowModules(true);
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}"? This will remove all associated data.`)) return;
    try {
      await api.delete(`/superadmin/restaurants/${id}`);
      toast.success('Restaurant deleted');
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  const resetForm = () => {
    setFormData({ name: '', email: '', phone: '', address: '', password: 'admin123', packageId: 1, enabledModules: ['restaurant'] });
    setEditingId(null);
  };

  const handleCloseModal = () => {
    setShowAdd(false);
    resetForm();
  };

  const handleImpersonate = async (id: number) => {
    try {
      const res = await api.post(`/superadmin/restaurants/${id}/impersonate`);
      login(res.data.data);
      toast.success('Impersonating restaurant admin');
      setTimeout(() => navigate('/admin'), 100);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to impersonate');
    }
  };

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Restaurants</h1>
          <p className="text-sm text-text-muted mt-1">{data?.pagination?.total || 0} total restaurants</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowAdd(true)}>Add Restaurant</Button>
      </div>

      {/* Search */}
      <div className="relative w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input className="glass-input w-full pl-10 text-sm" placeholder="Search restaurants..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted bg-bg-tertiary/50">
                <th className="text-left py-3 px-5 font-medium">Restaurant</th>
                <th className="text-left py-3 px-5 font-medium">Email</th>
                <th className="text-left py-3 px-5 font-medium">Status</th>
                <th className="text-left py-3 px-5 font-medium">Package</th>
                <th className="text-left py-3 px-5 font-medium">Subscription</th>
                <th className="text-left py-3 px-5 font-medium">Staff</th>
                <th className="text-left py-3 px-5 font-medium">Orders</th>
                <th className="text-left py-3 px-5 font-medium">Created</th>
                <th className="text-right py-3 px-5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="table-row">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="py-3 px-5"><Skeleton className="h-4 w-20" /></td>
                    ))}
                  </tr>
                ))
              ) : (
                data?.data?.map((r: any) => (
                  <tr key={r.id} className="table-row">
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-gradient-primary flex items-center justify-center">
                          <Store className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <p className="font-medium text-text-primary">{r.name}</p>
                          <p className="text-xs text-text-muted">{r.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-5 text-text-secondary">{r.email}</td>
                    <td className="py-3 px-5"><Badge className={getStatusColor(r.status)} dot>{r.status}</Badge></td>
                    <td className="py-3 px-5 text-text-secondary">{r.subscription?.package?.name || '—'}</td>
                    <td className="py-3 px-5"><Badge className={getStatusColor(r.subscription?.status || 'inactive')}>{r.subscription?.status || 'none'}</Badge></td>
                    <td className="py-3 px-5 text-text-secondary">{r._count?.staff || 0}</td>
                    <td className="py-3 px-5 text-text-secondary">{r._count?.orders || 0}</td>
                    <td className="py-3 px-5 text-text-muted">{formatDate(r.createdAt)}</td>
                    <td className="py-3 px-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleManageModules(r)} title="Manage modules">
                          <Settings className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(r)} title="Edit restaurant">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleImpersonate(r.id)} title="Impersonate/Login as">
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id, r.name)} className="text-danger hover:bg-danger/10" title="Delete restaurant">
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

      {/* Add/Edit Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={editingId ? "Edit Restaurant" : "Add Restaurant"} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Restaurant Name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. The Spice Kitchen" />
            <Input label="Email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="admin@restaurant.com" />
            <Input label="Phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="+1 555-0123" />
            <Input label="Password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="Initial admin password" />
          </div>
          <Input label="Address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="123 Food Street" />

          {!editingId && (
            <Select
              label="Package"
              value={String(formData.packageId)}
              onChange={(e) => setFormData({ ...formData, packageId: Number(e.target.value) })}
            >
              {(packagesData?.data || []).map((pkg: any) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name} {pkg.isDefault ? '(Default)' : ''} - ${Number(pkg.monthlyPrice || 0)}/mo
                </option>
              ))}
            </Select>
          )}
          
          {!editingId && (
            <div className="space-y-3 p-4 bg-bg-tertiary/50 rounded-lg border border-border">
              <p className="text-sm font-medium text-text-primary">Enabled Modules</p>
              <div className="space-y-2">
                {MODULE_OPTIONS.map(module => (
                  <label key={module.id} className="flex items-start gap-3 cursor-pointer hover:bg-bg-secondary/50 p-2 rounded">
                    <input
                      type="checkbox"
                      checked={formData.enabledModules.includes(module.id)}
                      onChange={(e) => toggleModule(module.id, e.target.checked)}
                      className="mt-1 w-4 h-4 rounded border-border cursor-pointer"
                    />
                    <div>
                      <p className="text-sm font-medium text-text-primary">{module.label} {module.required && <span className="text-danger">*</span>}</p>
                      <p className="text-xs text-text-muted">{module.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={isSubmitting}>{isSubmitting ? 'Saving...' : editingId ? 'Update Restaurant' : 'Create Restaurant'}</Button>
          </div>
        </div>
      </Modal>

      {/* Manage Modules Modal */}
      <Modal open={showModules} onClose={() => { setShowModules(false); setModulesEditId(null); }} title="Manage Modules" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-text-muted">Select which modules are enabled for this restaurant</p>
          <div className="space-y-2 p-4 bg-bg-tertiary/50 rounded-lg border border-border">
            {MODULE_OPTIONS.map(module => (
              <label key={module.id} className="flex items-start gap-3 cursor-pointer hover:bg-bg-secondary/50 p-2 rounded">
                <input
                  type="checkbox"
                  checked={modulesList.includes(module.id)}
                  onChange={() => toggleModulesList(module.id)}
                  className="mt-1 w-4 h-4 rounded border-border cursor-pointer"
                />
                <div>
                  <p className="text-sm font-medium text-text-primary">{module.label} {module.required && <span className="text-danger">*</span>}</p>
                  <p className="text-xs text-text-muted">{module.description}</p>
                </div>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="secondary" onClick={() => { setShowModules(false); setModulesEditId(null); }}>Cancel</Button>
            <Button onClick={handleSaveModules} disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Update Modules'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
