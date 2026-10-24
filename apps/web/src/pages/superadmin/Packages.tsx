import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Package, Plus, Check, Star, Edit, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function Packages() {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '', description: '', monthlyPrice: '', annualPrice: '', lifetimePrice: '',
    isRecommended: false, isDefault: false, trialDays: '14',
    modules: ['menu', 'orders', 'tables', 'pos', 'customers', 'staff', 'reports'],
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['superadmin-packages'],
    queryFn: () => api.get('/superadmin/packages').then((r) => r.data.data ?? []),
  });

  const allModules = [
    'Menu', 'Orders', 'Tables', 'POS', 'Customers', 'Staff', 'Reports',
    'Inventory', 'Kitchen', 'Expenses', 'Cash Register', 'Reservations',
    'AI Insights', 'Loyalty', 'Delivery', 'Webhooks', 'WhatsApp', 'Kiosk',
    'Customer Display', 'Order Board', 'Area Management', 'Modifier Groups',
    'Branch Management', 'Role Management', 'Theme Setting', 'Export Reports',
    'Payment Integration', 'KOT System', 'QR Menu'
  ];

  const toggleModule = (mod: string) => {
    setFormData((prev) => ({
      ...prev,
      modules: prev.modules.includes(mod) ? prev.modules.filter((m) => m !== mod) : [...prev.modules, mod],
    }));
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error('Package name is required');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        monthlyPrice: formData.monthlyPrice ? Number(formData.monthlyPrice) : null,
        annualPrice: formData.annualPrice ? Number(formData.annualPrice) : null,
        lifetimePrice: formData.lifetimePrice ? Number(formData.lifetimePrice) : null,
        trialDays: Number(formData.trialDays),
      };

      if (editingId) {
        await api.put(`/superadmin/packages/${editingId}`, payload);
        toast.success('Package updated!');
      } else {
        await api.post('/superadmin/packages', payload);
        toast.success('Package created!');
      }

      setShowAdd(false);
      setEditingId(null);
      resetForm();
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save package');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (pkg: any) => {
    setEditingId(pkg.id);
    setFormData({
      name: pkg.name,
      description: pkg.description || '',
      monthlyPrice: pkg.monthlyPrice ? pkg.monthlyPrice.toString() : '',
      annualPrice: pkg.annualPrice ? pkg.annualPrice.toString() : '',
      lifetimePrice: pkg.lifetimePrice ? pkg.lifetimePrice.toString() : '',
      isRecommended: pkg.isRecommended || false,
      isDefault: pkg.isDefault || false,
      trialDays: (pkg.trialDays || 14).toString(),
      modules: pkg.modules || [],
    });
    setShowAdd(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      monthlyPrice: '',
      annualPrice: '',
      lifetimePrice: '',
      isRecommended: false,
      isDefault: false,
      trialDays: '14',
      modules: ['menu', 'orders', 'tables', 'pos', 'customers', 'staff', 'reports'],
    });
    setEditingId(null);
  };

  const handleCloseModal = () => {
    setShowAdd(false);
    resetForm();
  };

  if (isLoading) return <div className="grid grid-cols-1 md:grid-cols-3 gap-6">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-72" />)}</div>;

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Packages</h1>
          <p className="text-sm text-text-muted mt-1">Manage subscription packages</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowAdd(true)}>Create Package</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {data?.map((pkg: any) => (
          <Card key={pkg.id} className={`relative ${pkg.isRecommended ? 'ring-2 ring-blue-500 shadow-glow' : ''}`}>
            {pkg.isRecommended && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge variant="info" className="flex items-center gap-1"><Star className="w-3 h-3" /> Recommended</Badge>
              </div>
            )}
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mx-auto mb-3">
                <Package className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-text-primary">{pkg.name}</h3>
              <p className="text-sm text-text-muted mt-1">{pkg.description || 'No description'}</p>
            </div>

            <div className="text-center mb-4">
              {pkg.monthlyPrice && (
                <div>
                  <span className="text-3xl font-bold text-text-primary">{formatCurrency(Number(pkg.monthlyPrice))}</span>
                  <span className="text-text-muted text-sm">/mo</span>
                </div>
              )}
              {pkg.annualPrice && <p className="text-xs text-text-muted">{formatCurrency(Number(pkg.annualPrice))}/year</p>}
            </div>

            <div className="space-y-2 mb-4">
              {(pkg.modules as string[])?.slice(0, 6).map((mod: string) => (
                <div key={mod} className="flex items-center gap-2 text-sm text-text-secondary">
                  <Check className="w-3.5 h-3.5 text-success" />{mod.charAt(0).toUpperCase() + mod.slice(1)}
                </div>
              ))}
              {(pkg.modules as string[])?.length > 6 && (
                <p className="text-xs text-blue-400">+{(pkg.modules as string[]).length - 6} more modules</p>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border">
              <span className="text-xs text-text-muted">{pkg._count?.subscriptions || 0} subscribers</span>
              <div className="flex gap-1">
                <button onClick={() => handleEdit(pkg)} className="p-1.5 rounded hover:bg-blue-500/10 transition-colors"><Edit className="w-3.5 h-3.5 text-blue-400" /></button>
                <button onClick={() => {
                  if (confirm(`Delete "${pkg.name}"? This cannot be undone.`)) {
                    api.delete(`/superadmin/packages/${pkg.id}`).then(() => {
                      toast.success('Package deleted');
                      refetch();
                    }).catch((err: any) => toast.error(err.response?.data?.error || 'Failed'));
                  }
                }} className="p-1.5 rounded hover:bg-danger/10 transition-colors"><Trash2 className="w-3.5 h-3.5 text-danger" /></button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={showAdd} onClose={handleCloseModal} title={editingId ? "Edit Package" : "Create Package"} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Package Name*" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Professional" />
            <Input label="Trial Days" type="number" value={formData.trialDays} onChange={(e) => setFormData({ ...formData, trialDays: e.target.value })} />
          </div>
          <Input label="Description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Brief description" />
          <div className="grid grid-cols-3 gap-4">
            <Input label="Monthly Price" type="number" value={formData.monthlyPrice} onChange={(e) => setFormData({ ...formData, monthlyPrice: e.target.value })} placeholder="29" />
            <Input label="Annual Price" type="number" value={formData.annualPrice} onChange={(e) => setFormData({ ...formData, annualPrice: e.target.value })} placeholder="290" />
            <Input label="Lifetime Price" type="number" value={formData.lifetimePrice} onChange={(e) => setFormData({ ...formData, lifetimePrice: e.target.value })} placeholder="999" />
          </div>
          
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={formData.isRecommended} onChange={(e) => setFormData({ ...formData, isRecommended: e.target.checked })} />
              Mark as Recommended
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={formData.isDefault} onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })} />
              Set as Default
            </label>
          </div>

          <div>
            <label className="text-sm font-medium text-text-secondary mb-2 block">Modules</label>
            <div className="flex flex-wrap gap-2">
              {allModules.map((mod) => (
                <button key={mod} onClick={() => toggleModule(mod)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${formData.modules.includes(mod) ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-bg-tertiary text-text-muted border border-border hover:bg-bg-hover'}`}>
                  {mod}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="secondary" onClick={handleCloseModal} disabled={isSubmitting}>Cancel</Button>
            <Button onClick={handleCreate} disabled={isSubmitting}>{isSubmitting ? 'Saving...' : editingId ? 'Update Package' : 'Create Package'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
