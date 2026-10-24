import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Plus, Shield, ShieldCheck, Edit, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

interface Role {
  id: number;
  name: string;
  permissions: string; // JSON string
}

const ALL_PERMISSIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'pos', label: 'POS Terminal' },
  { id: 'tokens', label: 'Bakery Tokens' },
  { id: 'menu', label: 'Menu Management' },
  { id: 'orders', label: 'Order History' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'staff', label: 'Staff Management' },
  { id: 'customers', label: 'Customers' },
  { id: 'reports', label: 'Reports & Analytics' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'hotel', label: 'Hotel Management' },
  { id: 'settings', label: 'Settings' },
];

export default function RoleSettings() {
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [roleName, setRoleName] = useState('');
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [deleteRole, setDeleteRole] = useState<Role | null>(null);

  const qc = useQueryClient();

  const { data: roles = [], isLoading } = useQuery<Role[]>({
    queryKey: ['roles'],
    queryFn: async () => {
      const { data } = await api.get('/restaurant/roles');
      return data.data;
    },
  });

  const createMut = useMutation({
    mutationFn: (data: any) => api.post('/restaurant/roles', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Role created successfully');
      setShowAdd(false);
      resetForm();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to create role'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.put(`/restaurant/roles/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Role updated successfully');
      setShowEdit(false);
      resetForm();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to update role'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/restaurant/roles/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Role deleted');
      setDeleteRole(null);
    },
  });

  const resetForm = () => {
    setRoleName('');
    const initialPerms: Record<string, boolean> = {};
    ALL_PERMISSIONS.forEach(p => initialPerms[p.id] = false);
    setPermissions(initialPerms);
    setSelectedRole(null);
  };

  const handleEdit = (role: Role) => {
    setSelectedRole(role);
    setRoleName(role.name);
    try {
      const perms = JSON.parse(role.permissions);
      setPermissions(perms);
    } catch {
      const initialPerms: Record<string, boolean> = {};
      ALL_PERMISSIONS.forEach(p => initialPerms[p.id] = false);
      setPermissions(initialPerms);
    }
    setShowEdit(true);
  };

  const togglePermission = (id: string) => {
    setPermissions(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Role Settings</h1>
          <p className="text-sm text-text-muted mt-1">Define permissions for different staff roles</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => { resetForm(); setShowAdd(true); }}>
          New Role
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-48 animate-pulse">
              <div />
            </Card>
          ))
        ) : roles.map((role) => {
          const perms = JSON.parse(role.permissions || '{}');
          const enabledCount = Object.values(perms).filter(Boolean).length;

          return (
            <Card key={role.id} className="group hover:border-blue-500/50 transition-all duration-300">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-text-primary capitalize">{role.name}</h3>
                    <p className="text-xs text-text-muted">{enabledCount} permissions active</p>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleEdit(role)} className="p-1.5 hover:bg-bg-hover text-text-muted hover:text-blue-400 rounded-lg transition-colors">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDeleteRole(role)} className="p-1.5 hover:bg-danger/10 text-text-muted hover:text-danger rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-2 mt-4">
                <div className="flex flex-wrap gap-1.5">
                  {ALL_PERMISSIONS.slice(0, 4).map(p => (
                    <div key={p.id} className={`text-[10px] px-2 py-0.5 rounded-full border ${perms[p.id] ? 'bg-success/10 border-success/20 text-success' : 'bg-bg-tertiary border-border text-text-muted'}`}>
                      {p.label}
                    </div>
                  ))}
                  {enabledCount > 4 && <div className="text-[10px] px-2 py-0.5 rounded-full bg-bg-tertiary border border-border text-text-muted">+{enabledCount - 4} more</div>}
                </div>
              </div>

              <Button variant="secondary" size="sm" className="mt-6 w-full" onClick={() => handleEdit(role)}>
                Manage Permissions
              </Button>
            </Card>
          );
        })}
      </div>

      {/* Add/Edit Modal */}
      <Modal 
        open={showAdd || showEdit} 
        onClose={() => { setShowAdd(false); setShowEdit(false); }} 
        title={showAdd ? "Create New Role" : "Edit Role Permissions"}
        size="xl"
      >
        <div className="space-y-6">
          <Input 
            label="Role Name" 
            placeholder="e.g. Supervisor, Cashier" 
            value={roleName} 
            onChange={(e) => setRoleName(e.target.value)}
            className="capitalize"
          />

          <div>
            <label className="text-sm font-medium text-text-secondary mb-3 block">Navigation & Access Permissions</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {ALL_PERMISSIONS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => togglePermission(p.id)}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                    permissions[p.id] 
                      ? 'bg-blue-500/5 border-blue-500/30 text-blue-400' 
                      : 'bg-bg-tertiary border-border text-text-muted hover:border-border-focus'
                  }`}
                >
                  <span className="text-sm font-medium">{p.label}</span>
                  {permissions[p.id] ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4 opacity-30" />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="secondary" onClick={() => { setShowAdd(false); setShowEdit(false); }}>Cancel</Button>
            <Button 
              disabled={!roleName || createMut.isPending || updateMut.isPending}
              onClick={() => {
                const data = { name: roleName.toLowerCase(), permissions };
                if (showAdd) createMut.mutate(data);
                else updateMut.mutate({ id: selectedRole!.id, data });
              }}
            >
              {showAdd ? 'Create Role' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteRole}
        onClose={() => setDeleteRole(null)}
        onConfirm={() => deleteMut.mutate(deleteRole!.id)}
        title="Delete Role"
        description={`Are you sure you want to delete the "${deleteRole?.name}" role? Staff members with this role will lose their custom permissions.`}
        variant="danger"
        confirmText="Delete Role"
      />
    </div>
  );
}
