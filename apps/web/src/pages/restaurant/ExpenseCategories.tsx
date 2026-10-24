import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import { useState } from 'react';
import api from '@/lib/api';
import { ClipboardList, Plus, Search } from 'lucide-react';

export default function ExpenseCategories() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [category, setCategory] = useState('');

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => api.get('/restaurant/expense-categories').then(r => r.data.data),
  });

  const mutation = useMutation({
    mutationFn: (payload: any) => api.post('/restaurant/expense-categories', payload),
    onSuccess: () => {
      toast.success('Category created');
      setCategory('');
      setShowModal(false);
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to create'),
  });

  const addCategory = () => {
    if (!category.trim()) return toast.error('Category is required');
    mutation.mutate({ name: category.trim() });
  };

  return (
    <div className="space-y-4 animate-in">
      <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
        <div>
          <h1 className="text-xl font-bold">Expense Categories</h1>
          <p className="text-xs text-text-muted">Use these categories to tag expenses in your reports</p>
        </div>
        <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setShowModal(true)}>New Category</Button>
      </div>

      <Card>
        <div className="p-3 border-b border-border flex items-center gap-2">
          <Search className="w-4 h-4 text-text-muted" />
          <input className="glass-input w-full h-9 text-sm" placeholder="Search categories..." disabled />
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
          {isLoading ? (
            <p className="text-xs text-text-muted">Loading categories...</p>
          ) : categories.length === 0 ? (
            <p className="text-xs text-text-muted">No categories defined.</p>
          ) : categories.map((cat: any) => (
            <div key={cat.id} className="flex items-center gap-2 p-3 border border-border rounded-lg">
              <ClipboardList className="w-4 h-4 text-blue-500" />
              <span className="font-medium">{cat.name}</span>
            </div>
          ))}
        </div>
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Expense Category">
        <div className="p-4 space-y-3">
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category name" className="w-full bg-bg-dark border border-border rounded p-2 text-sm" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={addCategory}>Create</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
