import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Plus, Search, Shield, Edit, Trash2, Mail, Download, Eye, EyeOff } from 'lucide-react';
import { formatDate, getStatusColor, getInitials } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

const roleColors: Record<string, string> = {
  admin: 'bg-purple-500/10 text-purple-400',
  branch_head: 'bg-blue-500/10 text-blue-400',
  branch_admin: 'bg-blue-500/10 text-blue-400',
  billing_staff: 'bg-orange-500/10 text-orange-400',
  waiter: 'bg-success/10 text-success',
  chef: 'bg-kot/10 text-kot',
};

export default function Staff() {
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [search, setSearch] = useState('');
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', password: 'staff123', role: 'waiter', phone: '', isActive: true });
  const [editData, setEditData] = useState<any>(null);
  const [deleteData, setDeleteData] = useState<{ id: number; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  
  const { user } = useAuthStore();

  const { data: staff, isLoading, refetch } = useQuery({
    queryKey: ['staff'],
    queryFn: () => api.get('/restaurant/staff').then((r) => r.data.data),
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get('/restaurant/roles').then((r) => r.data.data),
  });

  const handleCreate = async () => {
    try {
      await api.post('/restaurant/staff', formData);
      toast.success('Staff member added!');
      setShowAdd(false);
      setFormData({ name: '', email: '', password: 'staff123', role: 'waiter', phone: '', isActive: true });
      refetch();
    } catch (err: any) { 
      toast.error(err.response?.data?.error || 'Failed to add staff'); 
    }
  };

  const handleUpdate = async () => {
    try {
      await api.put(`/restaurant/staff/${editData.id}`, editData);
      toast.success('Staff member updated!');
      setShowEdit(false);
      setEditData(null);
      refetch();
    } catch (err: any) { 
      toast.error(err.response?.data?.error || 'Failed to update staff'); 
    }
  };

  const handleDelete = async () => {
    if (!deleteData) return;
    setDeleting(true);
    try {
      await api.delete(`/restaurant/staff/${deleteData.id}`);
      toast.success('Staff member deleted');
      setDeleteData(null);
      refetch();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete staff member');
    } finally {
      setDeleting(false);
    }
  };

  const handleUpdateRole = async (staffId: number, role: string) => {
    try {
      await api.put(`/restaurant/staff/${staffId}/role`, { role });
      toast.success('Role updated successfully');
      refetch();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update role');
      refetch(); // Refetch to revert to original state
    }
  };

  const handleExport = async () => {
    try {
      const response = await api.get('/restaurant/staff/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `staff_export_${new Date().getTime()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (error) {
      toast.error('Failed to export staff data');
    }
  };

  const openEditModal = (s: any) => {
    setEditData({ ...s, password: '' });
    setShowEdit(true);
  };

  const filtered = staff?.filter((s: any) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Staff</h1>
          <p className="text-sm text-text-muted mt-1">{staff?.length || 0} team members</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" icon={<Download className="w-4 h-4" />} onClick={handleExport}>
            Export
          </Button>
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowAdd(true)}>
            Add Staff
          </Button>
        </div>
      </div>

      <div className="relative w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input className="glass-input w-full pl-10 text-sm" placeholder="Search staff..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted bg-bg-tertiary/50">
                <th className="text-left py-3 px-5 font-medium">Staff Member</th>
                <th className="text-left py-3 px-5 font-medium">Email</th>
                <th className="text-left py-3 px-5 font-medium">Role</th>
                <th className="text-left py-3 px-5 font-medium">Branch</th>
                <th className="text-left py-3 px-5 font-medium">Phone</th>
                <th className="text-left py-3 px-5 font-medium">Status</th>
                <th className="text-left py-3 px-5 font-medium">Last Login</th>
                <th className="text-left py-3 px-5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="py-3 px-5"><Skeleton className="h-4 w-20" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered?.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-text-muted">No staff found</td></tr>
              ) : (
                filtered?.map((s: any) => (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-bg-tertiary/50 transition-colors">
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-gradient-primary flex items-center justify-center text-white text-xs font-bold">
                          {getInitials(s.name)}
                        </div>
                        <span className="font-medium text-text-primary">{s.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-5 text-text-secondary">
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-text-muted" />
                        {s.email}
                      </div>
                    </td>
                    <td className="py-3 px-5">
                      {user?.id === s.id ? (
                        <div className="flex flex-col gap-1">
                          <Badge className={roleColors[s.role] || ''}><Shield className="w-3 h-3 mr-1" />{s.role}</Badge>
                          <span className="text-[10px] text-text-muted">Cannot change own role</span>
                        </div>
                      ) : (
                        <select 
                          className="glass-input py-1 px-2 text-xs capitalize" 
                          value={s.role} 
                          onChange={(e) => handleUpdateRole(s.id, e.target.value)}
                        >
                          <option value="admin">Admin</option>
                          <option value="branch_admin">Branch Admin</option>
                          <option value="billing_staff">Billing Staff</option>
                          <option value="branch_head">Branch Head</option>
                          <option value="waiter">Waiter</option>
                          <option value="chef">Chef</option>
                          {roles.map((r: any) => (
                            <option key={r.id} value={r.name}>{r.name}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="py-3 px-5 text-text-secondary">{s.branch?.name || 'All'}</td>
                    <td className="py-3 px-5 text-text-muted">{s.phone || '—'}</td>
                    <td className="py-3 px-5"><Badge variant={s.isActive ? 'success' : 'danger'} dot>{s.isActive ? 'Active' : 'Inactive'}</Badge></td>
                    <td className="py-3 px-5 text-text-muted text-xs">{s.lastLoginAt ? formatDate(s.lastLoginAt) : 'Never'}</td>
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-1">
                        <button 
                          className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-brand-primary transition-colors"
                          onClick={() => openEditModal(s)}
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          className={`p-1.5 rounded-lg transition-colors ${
                            user?.id === s.id 
                              ? 'text-text-muted/50 cursor-not-allowed' 
                              : 'text-text-muted hover:bg-danger/10 hover:text-danger'
                          }`}
                          onClick={() => user?.id !== s.id && setDeleteData({ id: s.id, name: s.name })}
                          disabled={user?.id === s.id}
                          title={user?.id === s.id ? "Cannot delete own account" : "Delete"}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Staff Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Staff Member" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Full Name *" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="John Doe" />
            <Input label="Email *" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="john@restaurant.com" />
            <Input label="Phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="+1 555-0123" />
            <div className="relative">
              <Input label="Password *" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="Initial password" type={showAddPassword ? 'text' : 'password'} />
              <button
                type="button"
                onClick={() => setShowAddPassword(v => !v)}
                className="absolute right-3 top-[38px] text-text-muted hover:text-text-primary transition-colors"
                tabIndex={-1}
              >
                {showAddPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-secondary">Role *</label>
              <select className="glass-input capitalize" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
                <option value="admin">Admin</option>
                <option value="branch_admin">Branch Admin</option>
                <option value="billing_staff">Billing Staff</option>
                <option value="branch_head">Branch Head</option>
                <option value="waiter">Waiter</option>
                <option value="chef">Chef</option>
                {roles.map((r: any) => (
                  <option key={r.id} value={r.name}>{r.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 mt-7">
              <input 
                type="checkbox" 
                id="isActive" 
                checked={formData.isActive} 
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="rounded border-border bg-bg-base text-brand-primary focus:ring-brand-primary"
              />
              <label htmlFor="isActive" className="text-sm font-medium text-text-primary cursor-pointer">
                Is Active Account
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!formData.name || !formData.email || !formData.password}>Add Staff</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Staff Modal */}
      {editData && (
        <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit Staff Member" size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Full Name *" value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })} placeholder="John Doe" />
              <Input label="Email (Read-only)" value={editData.email} disabled className="opacity-50" />
              <Input label="Phone" value={editData.phone || ''} onChange={(e) => setEditData({ ...editData, phone: e.target.value })} placeholder="+1 555-0123" />
              <div className="relative">
                <Input label="Reset Password" value={editData.password || ''} onChange={(e) => setEditData({ ...editData, password: e.target.value })} placeholder="Leave blank to keep current" type={showEditPassword ? 'text' : 'password'} />
                <button
                  type="button"
                  onClick={() => setShowEditPassword(v => !v)}
                  className="absolute right-3 top-[38px] text-text-muted hover:text-text-primary transition-colors"
                  tabIndex={-1}
                >
                  {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text-secondary">Role *</label>
                <select 
                  className="glass-input capitalize" 
                  value={editData.role} 
                  onChange={(e) => setEditData({ ...editData, role: e.target.value })}
                  disabled={user?.id === editData.id}
                >
                  <option value="admin">Admin</option>
                  <option value="branch_admin">Branch Admin</option>
                  <option value="billing_staff">Billing Staff</option>
                  <option value="branch_head">Branch Head</option>
                  <option value="waiter">Waiter</option>
                  <option value="chef">Chef</option>
                  {roles.map((r: any) => (
                    <option key={r.id} value={r.name}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 mt-7">
                <input 
                  type="checkbox" 
                  id="editIsActive" 
                  checked={editData.isActive} 
                  onChange={(e) => setEditData({ ...editData, isActive: e.target.checked })}
                  className="rounded border-border bg-bg-base text-brand-primary focus:ring-brand-primary"
                />
                <label htmlFor="editIsActive" className="text-sm font-medium text-text-primary cursor-pointer">
                  Is Active Account
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="secondary" onClick={() => setShowEdit(false)}>Cancel</Button>
              <Button onClick={handleUpdate} disabled={!editData.name}>Save Changes</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={!!deleteData}
        onClose={() => !deleting && setDeleteData(null)}
        onConfirm={handleDelete}
        title="Confirm Deletion"
        description={`Are you sure you want to permanently delete ${deleteData?.name}? This action cannot be undone.`}
        confirmText="Delete Staff"
        loading={deleting}
        variant="danger"
      />
    </div>
  );
}
