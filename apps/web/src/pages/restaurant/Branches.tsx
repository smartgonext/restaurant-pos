import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, Building2, MapPin, Phone, Building } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface Branch {
  id: number;
  name: string;
  branchCode: string | null;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  isDefault: boolean;
  openTime: string | null;
  closeTime: string | null;
  _count?: { orders: number; staff: number };
}

const branchSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  branchCode: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  openTime: z.string().optional(),
  closeTime: z.string().optional(),
});
type BranchForm = z.infer<typeof branchSchema>;

export default function Branches() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const qc = useQueryClient();

  const { data: branches = [], isLoading } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => api.get('/restaurant/branches').then((res) => res.data.data),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<BranchForm>({
    resolver: zodResolver(branchSchema),
  });

  const createMutation = useMutation({
    mutationFn: (data: BranchForm) => api.post('/restaurant/branches', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches'] });
      toast.success('Branch added successfully');
      closeModal();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to add branch')
  });

  const updateMutation = useMutation({
    mutationFn: (data: BranchForm & { id: number }) => api.put(`/restaurant/branches/${data.id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches'] });
      toast.success('Branch updated successfully');
      closeModal();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to update branch')
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/restaurant/branches/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches'] });
      toast.success('Branch deactivated');
    }
  });

  const deletePermanentMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/restaurant/branches/${id}?permanent=true`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches'] });
      toast.success('Branch permanently deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to delete branch')
  });

  const openModal = (branch?: Branch) => {
    if (branch) {
      setEditingBranch(branch);
      reset({
        name: branch.name,
        branchCode: branch.branchCode || '',
        address: branch.address || '',
        phone: branch.phone || '',
        openTime: branch.openTime || '',
        closeTime: branch.closeTime || '',
      });
    } else {
      setEditingBranch(null);
      reset({ name: '', branchCode: '', address: '', phone: '', openTime: '', closeTime: '' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => { setIsModalOpen(false); setEditingBranch(null); reset(); };

  const onSubmit = (data: BranchForm) => {
    if (editingBranch) {
      updateMutation.mutate({ ...data, id: editingBranch.id });
    } else {
      createMutation.mutate(data);
    }
  };

  if (isLoading) return <div className="text-center p-8 text-slate-400">Loading branches...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white mb-1">Branch Management</h1>
          <p className="text-sm text-slate-400">Create and manage your restaurant/bakery branches</p>
        </div>
        <Button data-testid="add-branch-btn" onClick={() => openModal()} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
          <Plus className="w-4 h-4" /> Add Branch
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {branches.map((branch) => (
          <Card key={branch.id} data-testid={`branch-card-${branch.id}`} className="p-5 flex flex-col h-full bg-[#11131e] border-[#2a2d3e]">
            <div className="flex items-start justify-between mb-4">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    {branch.name}
                    {branch.isDefault && <span className="px-2 py-0.5 text-[10px] bg-blue-500/20 text-blue-400 rounded-full">HQ</span>}
                  </h3>
                  <p className="text-sm text-slate-400 font-mono mt-0.5">#{branch.branchCode || 'N/A'}</p>
                </div>
              </div>
              <span className={`px-2 py-1 rounded-md text-[10px] font-medium ${branch.isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                {branch.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="space-y-2 flex-grow mb-6">
              <div className="flex items-start gap-2 text-sm text-slate-300">
                <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-slate-500" />
                <span className="truncate" title={branch.address || 'No address'}>{branch.address || 'No address provided'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Phone className="w-4 h-4 shrink-0 text-slate-500" />
                <span>{branch.phone || 'No phone'}</span>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-[#2a2d3e] pt-4 mt-auto">
              <div className="text-xs text-slate-400 flex gap-3">
                <span><strong className="text-white">{branch._count?.orders || 0}</strong> Orders</span>
                <span><strong className="text-white">{branch._count?.staff || 0}</strong> Staff</span>
              </div>
              <div className="flex items-center gap-2">
                <button data-testid={`branch-edit-btn-${branch.id}`} onClick={() => openModal(branch)} className="p-1.5 text-slate-400 hover:text-blue-400 bg-[#1a1d2d] rounded-lg border border-[#2a2d3e] transition-colors"><Edit className="w-4 h-4" /></button>
                {branch.isActive && !branch.isDefault && (
                  <button data-testid={`branch-deactivate-btn-${branch.id}`} onClick={() => { if (confirm('Deactivate this branch?')) toggleMutation.mutate(branch.id); }} className="p-1.5 text-slate-400 hover:text-red-400 bg-[#1a1d2d] rounded-lg border border-[#2a2d3e] transition-colors"><Trash2 className="w-4 h-4" /></button>
                )}
                {!branch.isActive && !branch.isDefault && (
                  <button data-testid={`branch-delete-btn-${branch.id}`} onClick={() => { if (confirm('Permanently delete this branch? This cannot be undone.')) deletePermanentMutation.mutate(branch.id); }} className="p-1.5 text-slate-400 hover:text-red-600 bg-[#1a1d2d] rounded-lg border border-[#2a2d3e] transition-colors"><Trash2 className="w-4 h-4" /></button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal isOpen={isModalOpen} onClose={closeModal} title={editingBranch ? 'Edit Branch' : 'Add New Branch'}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Branch Name *" {...register('name')} error={errors.name?.message} placeholder="e.g. Ground Floor, Main St" />
          <Input label="Branch Code" {...register('branchCode')} placeholder="e.g. B1, GF" />
          <Input label="Address" {...register('address')} placeholder="123 Bakery Lane" />
          <Input label="Phone Number" {...register('phone')} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Opening Time" type="time" {...register('openTime')} />
            <Input label="Closing Time" type="time" {...register('closeTime')} />
          </div>
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={closeModal} className="w-full">Cancel</Button>
            <Button type="submit" className="w-full" isLoading={createMutation.isPending || updateMutation.isPending}>{editingBranch ? 'Save Changes' : 'Create Branch'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
