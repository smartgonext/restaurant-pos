import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Plus, Edit, Trash2, FolderOpen } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function ItemCategories() {
  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '' });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['item-categories'],
    queryFn: () => api.get('/restaurant/item-categories').then((r) => r.data.data),
  });

  const handleCreate = async () => {
    try {
      await api.post('/restaurant/item-categories', formData);
      toast.success('Category created!');
      setShowAdd(false);
      setFormData({ name: '', description: '' });
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Item Categories</h1>
          <p className="text-sm text-text-muted mt-1">Organize your menu items by category</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowAdd(true)}>Add Category</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 rounded-xl bg-bg-secondary animate-pulse" />)
        ) : data?.length === 0 ? (
          <Card className="col-span-full text-center py-12">
            <FolderOpen className="w-12 h-12 text-text-muted mx-auto mb-3" />
            <p className="text-text-muted">No categories yet. Create your first category!</p>
          </Card>
        ) : (
          data?.map((cat: any) => (
            <Card key={cat.id} hover className="flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-text-primary">{cat.name}</h3>
                  {cat.description && <p className="text-xs text-text-muted mt-1">{cat.description}</p>}
                </div>
                <Badge variant="info">{cat._count?.menuItems || 0} items</Badge>
              </div>
              <div className="flex gap-1 mt-3 pt-3 border-t border-border">
                <button className="p-1.5 rounded hover:bg-bg-hover"><Edit className="w-3.5 h-3.5 text-text-muted" /></button>
                <button className="p-1.5 rounded hover:bg-danger/10"><Trash2 className="w-3.5 h-3.5 text-danger" /></button>
              </div>
            </Card>
          ))
        )}
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Category">
        <div className="space-y-4">
          <Input label="Category Name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Appetizers, Main Course" />
          <Input label="Description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Optional description" />
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
