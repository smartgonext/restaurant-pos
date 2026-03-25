import { useQuery } from '@tanstack/react-query';
import { useState, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Plus, Search, Circle, Edit, Trash2, Eye, EyeOff, Clock, Upload, X } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const SERVER_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

export default function MenuItems() {
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [formData, setFormData] = useState({
    name: '', description: '', price: '', menuId: 0, categoryId: 0,
    isVeg: true, isAvailable: true, preparationTime: '', image: ''
  });
  
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: items, isLoading, refetch } = useQuery({
    queryKey: ['menu-items', search],
    queryFn: () => api.get(`/restaurant/menu-items?search=${search}`).then((r) => r.data.data),
  });

  const { data: menus } = useQuery({
    queryKey: ['menus-list'],
    queryFn: () => api.get('/restaurant/menus').then((r) => r.data.data),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories-list'],
    queryFn: () => api.get('/restaurant/item-categories').then((r) => r.data.data),
  });

  const handleOpenModal = (item: any = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        name: item.name,
        description: item.description || '',
        price: item.price.toString(),
        menuId: item.menuId || 0,
        categoryId: item.categoryId || 0,
        isVeg: item.isVeg,
        isAvailable: item.isAvailable,
        preparationTime: item.preparationTime?.toString() || '',
        image: item.image || ''
      });
    } else {
      setEditingItem(null);
      setFormData({
        name: '', description: '', price: '', menuId: 0, categoryId: 0,
        isVeg: true, isAvailable: true, preparationTime: '', image: ''
      });
    }
    setShowModal(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const toastId = toast.loading('Uploading image...');

    const uploadData = new FormData();
    uploadData.append('file', file);

    try {
      const res = await api.post('/restaurant/upload', uploadData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setFormData({ ...formData, image: res.data.url });
      toast.success('Image uploaded!', { id: toastId });
    } catch (err) {
      toast.error('Upload failed', { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const payload = {
        ...formData,
        price: Number(formData.price),
        preparationTime: formData.preparationTime ? Number(formData.preparationTime) : null,
        menuId: formData.menuId || undefined,
        categoryId: formData.categoryId || undefined,
      };

      if (editingItem) {
        await api.put(`/restaurant/menu-items/${editingItem.id}`, payload);
        toast.success('Item updated!');
      } else {
        await api.post('/restaurant/menu-items', payload);
        toast.success('Item created!');
      }
      
      setShowModal(false);
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this item?')) return;
    try {
      await api.delete(`/restaurant/menu-items/${id}`);
      toast.success('Item deleted');
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const toggleAvailability = async (id: number, isAvailable: boolean) => {
    try {
      await api.put(`/restaurant/menu-items/${id}`, { isAvailable: !isAvailable });
      refetch();
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="space-y-6 animate-in p-1">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-text-primary uppercase italic tracking-tight">Vibe & Dine Menu</h1>
          <p className="text-xs text-text-muted mt-1 font-bold">Manage your gourmet offerings dynamically</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => handleOpenModal()}>Add New Item</Button>
      </div>

      <div className="relative w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input className="glass-input w-full pl-10 text-sm h-11" placeholder="Search menu items..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] font-black uppercase text-text-muted bg-bg-tertiary/50 tracking-widest">
                <th className="text-left py-4 px-6">Dish Details</th>
                <th className="text-left py-4 px-6 text-center">Price</th>
                <th className="text-left py-4 px-6 text-center">Type</th>
                <th className="text-left py-4 px-6 text-center">Status</th>
                <th className="text-left py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="hover:bg-bg-tertiary/20 transition-colors">
                    {Array.from({ length: 5 }).map((_, j) => <td key={j} className="py-4 px-6"><Skeleton className="h-4 w-20" /></td>)}
                  </tr>
                ))
              ) : items?.length === 0 ? (
                <tr><td colSpan={5} className="py-20 text-center text-text-muted uppercase text-xs font-black italic">No items found. Create your signature dish now!</td></tr>
              ) : (
                items?.map((item: any) => (
                  <tr key={item.id} className="hover:bg-bg-tertiary/20 transition-colors group">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-bg-tertiary border border-border/50 flex items-center justify-center overflow-hidden shadow-inner shrink-0">
                          {item.image ? <img src={item.image.startsWith('http') ? item.image : `${SERVER_URL}${item.image}`} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform" /> : <span className="text-xl">🍕</span>}
                        </div>
                        <div className="flex flex-col">
                          <p className="font-black text-text-primary uppercase tracking-tighter text-sm">{item.name}</p>
                          <span className="text-[10px] text-blue-400 font-bold uppercase">{item.category?.name || 'Uncategorized'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-center font-black text-white text-md">
                       {formatCurrency(Number(item.price))}
                    </td>
                    <td className="py-4 px-6 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className={cn("w-2 h-2 rounded-full", item.isVeg ? 'bg-success shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-danger shadow-[0_0_8px_rgba(239,68,68,0.4)]')} />
                        <span className="text-[10px] font-bold uppercase text-text-secondary">{item.isVeg ? 'Veg' : 'Meat'}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <button onClick={() => toggleAvailability(item.id, item.isAvailable)} className="hover:scale-105 transition-transform">
                        <Badge variant={item.isAvailable ? 'success' : 'danger'} className="uppercase font-black text-[9px] px-3 py-1">
                          {item.isAvailable ? 'Visible' : 'Hidden'}
                        </Badge>
                      </button>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex gap-2 justify-end opacity-40 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleOpenModal(item)} className="p-2 rounded-xl bg-bg-tertiary border border-border/50 hover:text-blue-400 hover:border-blue-400 transition-all">
                           <Edit size={14} />
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="p-2 rounded-xl bg-bg-tertiary border border-border/50 hover:text-danger hover:border-danger transition-all">
                           <Trash2 size={14} />
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

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingItem ? "Edit Product" : "New Creation"} size="lg">
        <div className="space-y-6 pt-2">
          
          <div className="flex items-center gap-6">
             <div 
               onClick={() => fileInputRef.current?.click()}
               className="w-32 h-32 rounded-3xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-blue-400 hover:bg-blue-400/5 transition-all overflow-hidden relative group"
             >
                {formData.image ? (
                   <>
                      <img src={formData.image.startsWith('http') ? formData.image : `${SERVER_URL}${formData.image}`} alt="Preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                         <Upload className="text-white" size={24} />
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setFormData({...formData, image: ''}); }}
                        className="absolute top-1 right-1 p-1 bg-danger text-white rounded-full shadow-lg"
                      >
                         <X size={12} />
                      </button>
                   </>
                ) : (
                   <>
                      <Upload className="text-text-muted" size={24} />
                      <span className="text-[9px] font-black uppercase text-text-muted">Upload Photo</span>
                   </>
                )}
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
             </div>

             <div className="flex-1 space-y-4">
               <div className="grid grid-cols-2 gap-4">
                 <Input label="Signature Name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Avocado Toast" />
                 <Input label="Price Point" type="number" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} placeholder="0.00" />
               </div>
               <Input label="Chef's Note / Description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Describe the flavors..." />
             </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase text-text-muted ml-1">Assigned Menu</label>
              <select className="glass-input h-10 text-xs font-bold" value={formData.menuId} onChange={(e) => setFormData({ ...formData, menuId: Number(e.target.value) })}>
                <option value={0}>General Menu</option>
                {menus?.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase text-text-muted ml-1">Category</label>
              <select className="glass-input h-10 text-xs font-bold" value={formData.categoryId} onChange={(e) => setFormData({ ...formData, categoryId: Number(e.target.value) })}>
                <option value={0}>Main Course</option>
                {categories?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <Input label="Kitchen Prep (min)" type="number" value={formData.preparationTime} onChange={(e) => setFormData({ ...formData, preparationTime: e.target.value })} placeholder="15" />
          </div>

          <div className="flex gap-6 p-4 bg-bg-tertiary/20 rounded-2xl border border-border/30">
            <label className="flex items-center gap-3 text-[11px] font-black uppercase text-text-primary cursor-pointer group">
              <div className={cn("w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all", formData.isVeg ? "bg-success border-success" : "border-border")}>
                 {formData.isVeg && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />}
              </div>
              <input type="checkbox" className="hidden" checked={formData.isVeg} onChange={(e) => setFormData({ ...formData, isVeg: e.target.checked })} /> 
              Vegetarian Option
            </label>
            <label className="flex items-center gap-3 text-[11px] font-black uppercase text-text-primary cursor-pointer group">
              <div className={cn("w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all", formData.isAvailable ? "bg-blue-600 border-blue-600 shadow-glow-sm" : "border-border")}>
                 {formData.isAvailable && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
              <input type="checkbox" className="hidden" checked={formData.isAvailable} onChange={(e) => setFormData({ ...formData, isAvailable: e.target.checked })} /> 
              Instantly Available
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
            <Button variant="ghost" className="uppercase font-black text-[10px]" onClick={() => setShowModal(false)}>Discard</Button>
            <Button disabled={uploading} className="bg-blue-600 px-8 uppercase font-black text-[10px]" onClick={handleSubmit}>
               {editingItem ? 'Update Vibe' : 'Craft Dish'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
