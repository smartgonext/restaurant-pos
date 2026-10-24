import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Plus, Search, Users2, ShoppingBag, Star, Edit, Trash2, Settings } from 'lucide-react';
import { formatDate, getInitials } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function Customers() {
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [search, setSearch] = useState('');
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', address: '' });

  const [loyaltyConfig, setLoyaltyConfig] = useState({
    rupeesPerPoint: 100,    // Customer spends ₹X to earn 1 point
    minClaimPoints: 50,     // Minimum points to claim discount
    maxClaimPercent: 20,    // Max % of bill discount from points
    isActive: true
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['customers', search],
    queryFn: () => api.get(`/restaurant/customers?search=${search}`).then((r) => r.data),
  });

  const { data: configData } = useQuery({
    queryKey: ['loyalty-config'],
    queryFn: () => api.get('/restaurant/loyalty/config').then(r => r.data)
  });

  useEffect(() => {
    if (configData?.data) {
      setLoyaltyConfig({
        rupeesPerPoint: Number(configData.data.rupeesPerPoint ?? 100),
        minClaimPoints: Number(configData.data.minClaimPoints ?? 50),
        maxClaimPercent: Number(configData.data.maxClaimPercent ?? 20),
        isActive: configData.data.isActive ?? true
      });
    }
  }, [configData]);

  const saveSettings = async () => {
    try {
      await api.put('/restaurant/loyalty/config', loyaltyConfig);
      toast.success('Loyalty settings saved!');
      setShowSettings(false);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to save settings');
    }
  };

  const handleCreate = async () => {
    try {
      await api.post('/restaurant/customers', formData);
      toast.success('Customer added!');
      setShowAdd(false);
      setFormData({ name: '', email: '', phone: '', address: '' });
      refetch();
    } catch (err: any) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const handleEdit = async () => {
    try {
      await api.put(`/restaurant/customers/${editingCustomer.id}`, formData);
      toast.success('Customer updated!');
      setShowEdit(false);
      setEditingCustomer(null);
      setFormData({ name: '', email: '', phone: '', address: '' });
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update customer');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/restaurant/customers/${id}`);
      setCustomerToDelete(null);
      toast.success('Customer deleted!');
      refetch();
    } catch (err: any) {
      setCustomerToDelete(null);
      toast.error(err?.response?.data?.error || 'Failed to delete customer');
    }
  };

  const [customerToDelete, setCustomerToDelete] = useState<any>(null);

  const customers = data?.data || [];

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Customers</h1>
          <p className="text-sm text-text-muted mt-1">{data?.pagination?.total || 0} customers</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" icon={<Settings className="w-4 h-4" />} onClick={() => setShowSettings(true)}>
            Loyalty Settings
          </Button>
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowAdd(true)}>
            Add Customer
          </Button>
        </div>
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
                        <button className="p-1.5 rounded hover:bg-bg-hover" onClick={() => { setEditingCustomer(c); setFormData({ name: c.name, email: c.email || '', phone: c.phone || '', address: c.address || '' }); setShowEdit(true); }}><Edit className="w-3.5 h-3.5 text-text-muted" /></button>
                        <button className="p-1.5 rounded hover:bg-danger/10" onClick={() => setCustomerToDelete(c)}><Trash2 className="w-3.5 h-3.5 text-danger" /></button>
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

      <Modal open={showEdit} onClose={() => { setShowEdit(false); setEditingCustomer(null); setFormData({ name: '', email: '', phone: '', address: '' }); }} title="Edit Customer">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Alice Johnson" />
            <Input label="Phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="+1 555-0001" />
            <Input label="Email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="alice@example.com" />
          </div>
          <Input label="Address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="123 Main St" />
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="secondary" onClick={() => { setShowEdit(false); setEditingCustomer(null); setFormData({ name: '', email: '', phone: '', address: '' }); }}>Cancel</Button>
            <Button onClick={handleEdit}>Save Changes</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!customerToDelete} onClose={() => setCustomerToDelete(null)} title="Delete Customer">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Are you sure you want to delete this customer?
            {customerToDelete && <span className="font-semibold text-text-primary"> "{customerToDelete.name}"</span>} This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="secondary" onClick={() => setCustomerToDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => handleDelete(customerToDelete.id)}>Delete</Button>
          </div>
        </div>
      </Modal>

      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Loyalty Settings" size="lg">
        <div className="space-y-5">
          {/* Info Box */}
          <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 p-4 rounded-xl text-sm">
            <p className="font-bold text-blue-400 mb-2 text-xs uppercase tracking-wider">How It Works</p>
            <ul className="list-disc list-inside space-y-1.5 text-sm text-text-secondary">
              <li><strong className="text-text-primary">Rupees Per Point:</strong> Set ₹{loyaltyConfig.rupeesPerPoint} = Customer spends ₹{loyaltyConfig.rupeesPerPoint} to earn 1 point</li>
              <li><strong className="text-text-primary">Min Points:</strong> Customer needs {loyaltyConfig.minClaimPoints} points minimum to claim discount</li>
              <li><strong className="text-text-primary">Max Claim:</strong> Points discount can cover max {loyaltyConfig.maxClaimPercent}% of the bill</li>
            </ul>
            <div className="mt-3 pt-3 border-t border-blue-500/20 text-xs text-blue-300">
              <p>Example: ₹2000 bill → {Math.floor(2000 / loyaltyConfig.rupeesPerPoint)} pts earned • {loyaltyConfig.minClaimPoints} pts → ₹{Math.floor((loyaltyConfig.minClaimPoints / Math.max(loyaltyConfig.minClaimPoints, 1)) * 100)} discount (up to {loyaltyConfig.maxClaimPercent}% of bill)</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Input 
                label="Spend Amount Per Point (₹)" 
                type="number"
                step="1"
                min="1"
                value={loyaltyConfig.rupeesPerPoint} 
                onChange={(e) => setLoyaltyConfig({ ...loyaltyConfig, rupeesPerPoint: Number(e.target.value) })}
                placeholder="100"
              />
              <p className="text-[10px] text-text-muted mt-1 ml-1">e.g. ₹100 spent = 1 point</p>
            </div>
            <div>
              <Input 
                label="Minimum Points to Claim" 
                type="number" 
                min="1"
                value={loyaltyConfig.minClaimPoints} 
                onChange={(e) => setLoyaltyConfig({ ...loyaltyConfig, minClaimPoints: Number(e.target.value) })}
                placeholder="50"
              />
              <p className="text-[10px] text-text-muted mt-1 ml-1">Customer needs this many pts</p>
            </div>
            <div>
              <Input 
                label="Max Claim (% of Bill)" 
                type="number" 
                min="1"
                max="100"
                value={loyaltyConfig.maxClaimPercent} 
                onChange={(e) => setLoyaltyConfig({ ...loyaltyConfig, maxClaimPercent: Number(e.target.value) })}
                placeholder="20"
              />
              <p className="text-[10px] text-text-muted mt-1 ml-1">e.g. 20% of bill max</p>
            </div>
          </div>
          
          <Select 
            label="Program Status" 
            value={loyaltyConfig.isActive ? 'true' : 'false'}
            onChange={(e) => setLoyaltyConfig({ ...loyaltyConfig, isActive: e.target.value === 'true' })}
          >
            <option value="true">Active</option>
            <option value="false">Disabled</option>
          </Select>
          
          <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-border/50">
            <Button variant="secondary" onClick={() => setShowSettings(false)}>Cancel</Button>
            <Button onClick={saveSettings}>Save Settings</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}