import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { formatDate, getStatusColor, openNewTab } from '@/lib/utils';
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
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showModules, setShowModules] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [modulesEditId, setModulesEditId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    branchName: 'Main Branch',
    branchCode: '',
    adminName: '',
    adminEmail: '',
    password: 'admin123',
    packageId: 1,
    businessType: 'bakery',
    enabledModules: ['restaurant'] as string[],
    workerEmail: '',
    workerPassword: '',
    syncToCloud: false
  });
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
    if (!formData.email.trim()) {
      toast.error('Restaurant email is required');
      return;
    }
    const finalAdminEmail = formData.adminEmail.trim() || formData.email.trim();
    const finalAdminName = formData.adminName.trim() || `${formData.name.trim()} Admin`;

    if (!finalAdminEmail) {
      toast.error('Admin login email is required');
      return;
    }
    if (!editingId && !formData.password.trim()) {
      toast.error('Admin password is required');
      return;
    }
    if ((formData.workerEmail && !formData.workerPassword) || (!formData.workerEmail && formData.workerPassword)) {
      toast.error('Worker email and worker password must both be provided');
      return;
    }
    if (formData.enabledModules.length === 0) {
      toast.error('Select at least one module');
      return;
    }
    // Basic client-side validation to match server rules
    if (!formData.enabledModules.includes('restaurant') && !formData.enabledModules.includes('hotel')) {
      toast.error('At least one core module (Restaurant or Hotel) is required');
      return;
    }
    const hasAddon = ['cash_register', 'inventory', 'kitchens'].some((m) => formData.enabledModules.includes(m));
    if (hasAddon && !formData.enabledModules.includes('restaurant')) {
      toast.error('Addon modules require Restaurant module to be enabled');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingId) {
        const res = await api.put(`/superadmin/restaurants/${editingId}`, {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          address: formData.address,
          adminName: finalAdminName,
          adminEmail: finalAdminEmail,
          password: formData.password,
          branchName: formData.branchName,
          branchCode: formData.branchCode,
          businessType: formData.businessType,
          workerEmail: formData.workerEmail,
          workerPassword: formData.workerPassword,
        });
        // Update enabled modules via dedicated endpoint
        await api.put(`/superadmin/restaurants/${editingId}/modules`, {
          enabledModules: formData.enabledModules,
        });
        toast.success(res.data?.message || 'Restaurant updated!');
      } else {
        const res = await api.post('/superadmin/restaurants', {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          address: formData.address,
          branchName: formData.branchName,
          branchCode: formData.branchCode,
          adminName: finalAdminName,
          adminEmail: finalAdminEmail,
          adminPassword: formData.password,
          password: formData.password,
          packageId: Number(formData.packageId),
          businessType: formData.businessType,
          enabledModules: formData.enabledModules,
          workerEmail: formData.workerEmail,
          workerPassword: formData.workerPassword,
          syncToCloud: formData.syncToCloud,
        });
        toast.success(res.data?.message || 'Restaurant created!');
      }
      setShowAdd(false);
      setEditingId(null);
      resetForm();
      refetch();
      qc.invalidateQueries({ queryKey: ['superadmin-dashboard'] });
      qc.invalidateQueries({ queryKey: ['superadmin-restaurants-recent'] });
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
      qc.invalidateQueries({ queryKey: ['superadmin-dashboard'] });
      qc.invalidateQueries({ queryKey: ['superadmin-restaurants-recent'] });
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
      branchName: 'Main Branch',
      branchCode: '',
      adminName: `${restaurant.name} Admin`,
      adminEmail: restaurant.email,
      password: 'admin123',
      packageId: restaurant.subscription?.packageId || 1,
      businessType: restaurant.businessType || 'bakery',
      enabledModules: restaurant.enabledModules || ['restaurant'],
      workerEmail: '',
      workerPassword: '',
      syncToCloud: false,
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
      qc.invalidateQueries({ queryKey: ['superadmin-dashboard'] });
      qc.invalidateQueries({ queryKey: ['superadmin-restaurants-recent'] });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      address: '',
      branchName: 'Main Branch',
      branchCode: '',
      adminName: '',
      adminEmail: '',
      password: 'admin123',
      packageId: 1,
      businessType: 'bakery',
      enabledModules: ['restaurant'],
      workerEmail: '',
      workerPassword: '',
      syncToCloud: false
    });
    setEditingId(null);
  };

  const handleCloseModal = () => {
    setShowAdd(false);
    resetForm();
  };

  const handleImpersonate = async (id: number) => {
    try {
      const res = await api.post(`/superadmin/restaurants/${id}/impersonate`);
      const { token, user } = res.data.data;

      // Store impersonation data in sessionStorage for the new tab
      // Key: 'impersonate_session' — will be picked up by the new tab on load
      const payload = JSON.stringify({ token, user });
      sessionStorage.setItem('impersonate_session', payload);

      // Open the restaurant admin in a new tab
      openNewTab('/admin');
      toast.success(`Opening ${user.name}'s restaurant in new tab...`);
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
        <Button
          icon={<Plus className="w-4 h-4" />}
          onClick={() => setShowAdd(true)}
          data-testid="add-restaurant-btn"
          aria-label="Add restaurant"
        >
          Add Restaurant
        </Button>
      </div>

      {/* Search */}
      <div className="relative w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          className="glass-input w-full pl-10 text-sm"
          placeholder="Search restaurants..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="restaurants-search-input"
          aria-label="Search restaurants"
        />
      </div>

      {/* Table */}
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="restaurants-table" aria-label="Restaurants table">
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
                        <Button variant="ghost" size="sm" onClick={() => handleManageModules(r)} title="Manage modules" data-testid={`manage-modules-${r.id}`} aria-label={`Manage modules for ${r.name}`}>
                          <Settings className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(r)} title="Edit restaurant" data-testid={`edit-restaurant-${r.id}`} aria-label={`Edit ${r.name}`}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleImpersonate(r.id)} title="Impersonate/Login as" data-testid={`impersonate-restaurant-${r.id}`} aria-label={`Impersonate ${r.name}`}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id, r.name)} className="text-danger hover:bg-danger/10" title="Delete restaurant" data-testid={`delete-restaurant-${r.id}`} aria-label={`Delete ${r.name}`}>
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
            <Input label="Restaurant Email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="admin@restaurant.com" />
            <Input label="Phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="+1 555-0123" />
            <Input label="Branch Name" value={formData.branchName} onChange={(e) => setFormData({ ...formData, branchName: e.target.value })} placeholder="Main Branch" />
            <Input label="Branch Code" value={formData.branchCode} onChange={(e) => setFormData({ ...formData, branchCode: e.target.value })} placeholder="MAIN01" />
            <Input label="Admin Name" value={formData.adminName} onChange={(e) => setFormData({ ...formData, adminName: e.target.value })} placeholder="John Doe" />
            <Input label="Admin Login Email" type="email" value={formData.adminEmail} onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })} placeholder="owner@restaurant.com" />
            <Input label="Password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="Initial admin password" />
            <Input label="Worker Email" type="email" value={formData.workerEmail} onChange={(e) => setFormData({ ...formData, workerEmail: e.target.value })} placeholder="worker@restaurant.com" />
            <Input label="Worker Password" value={formData.workerPassword} onChange={(e) => setFormData({ ...formData, workerPassword: e.target.value })} placeholder="worker password" />
          </div>

          {!editingId && (
            <label className="flex items-center gap-3 cursor-pointer hover:bg-bg-tertiary/20 p-2.5 rounded-lg border border-border">
              <input
                type="checkbox"
                checked={formData.syncToCloud}
                onChange={(e) => setFormData({ ...formData, syncToCloud: e.target.checked })}
                className="w-4 h-4 text-primary rounded border-border cursor-pointer focus:ring-primary"
              />
              <div>
                <p className="text-sm font-semibold text-text-primary">Enable Warehouse & Production Sync (Cloud SaaS)</p>
                <p className="text-xs text-text-muted">Register this restaurant in the cloud backend instantly for online warehouse monitoring.</p>
              </div>
            </label>
          )}

          <Input label="Address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="123 Food Street" />

          <Select
            label="Business Type"
            value={formData.businessType}
            onChange={(e) => setFormData({ ...formData, businessType: e.target.value })}
          >
            <option value="bakery">Bakery</option>
            <option value="restaurant">Restaurant</option>
            <option value="cafe">Cafe</option>
            <option value="hotel">Hotel</option>
            <option value="cloud_kitchen">Cloud Kitchen</option>
          </Select>

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

          <div className="flex justify-end gap-3 mt-6">
            <Button variant="secondary" onClick={() => setShowAdd(false)} data-testid="cancel-restaurant-modal-btn" aria-label="Cancel restaurant form">Cancel</Button>
            <Button onClick={handleCreate} disabled={isSubmitting} data-testid="submit-restaurant-modal-btn" aria-label={editingId ? 'Update restaurant' : 'Create restaurant'}>{isSubmitting ? 'Saving...' : editingId ? 'Update Restaurant' : 'Create Restaurant'}</Button>
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
