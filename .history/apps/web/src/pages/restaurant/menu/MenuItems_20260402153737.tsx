import { useQuery } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Plus, Search, Circle, Edit, Trash2, Eye, EyeOff, Clock, Upload, X, QrCode, Sparkles, Layers, Info } from 'lucide-react';
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
    isVeg: true, isAvailable: true, preparationTime: '', image: '',
    productQR: '', isAutoImage: true
  });
  
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [modifierGroups, setModifierGroups] = useState<any[]>([]);
  const [selectedModifier, setSelectedModifier] = useState('');
  const [linking, setLinking] = useState(false);
  // Fetch modifier groups for dropdown
  useEffect(() => {
    api.get('/restaurant/modifier-groups').then(res => setModifierGroups(res.data.data || []));
  }, []);

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
        image: item.image || '',
        productQR: item.productQR || '',
        isAutoImage: item.isAutoImage ?? true
      });
      setSelectedModifier('');
    } else {
      setEditingItem(null);
      setFormData({
        name: '', description: '', price: '', menuId: 0, categoryId: 0,
        isVeg: true, isAvailable: true, preparationTime: '', image: '',
        productQR: '', isAutoImage: true
      });
      setSelectedModifier('');
    }
    setShowModal(true);
  };
  // Link modifier group to item
  const handleLinkModifier = async () => {
    if (!editingItem || !selectedModifier) return;
    setLinking(true);
    try {
      await api.post('/restaurant/item-modifiers/activate', {
        menuItemId: editingItem.id,
        modifierGroupId: selectedModifier
      });
      toast.success('Modifier group linked!');
      setSelectedModifier('');
      refetch();
    } catch (err) {
      toast.error('Failed to link modifier');
    } finally {
      setLinking(false);
    }
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
      setFormData(prev => ({ ...prev, image: res.data.url, isAutoImage: false }));
      toast.success('Image uploaded!', { id: toastId });
    } catch (err) {
      toast.error('Upload failed', { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  const handleAIGenerateImage = async () => {
    if (!formData.name) return toast.error('Enter item name first');
    
    setUploading(true);
    const toastId = toast.loading('AI is crafting your dish image...');
    try {
      const res = await api.post('/restaurant/generate-image', { itemName: formData.name, persist: false });
      const imgUrl = res.data.imageUrl;
      if (imgUrl) {
         setFormData(prev => ({ ...prev, image: imgUrl, isAutoImage: true }));
         toast.success('AI Image generated!', { id: toastId });
      } else {
         throw new Error('Image generation failed');
      }
    } catch (err) {
      toast.error('AI Generation failed', { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      // If the image is an AI preview (auto image), persist it automatically before saving the item
      let finalImage = formData.image;
      if (formData.isAutoImage && formData.image) {
        setUploading(true);
        const saveToast = toast.loading('Saving AI image automatically...');
        try {
          let src = formData.image as string;
          if (!src.startsWith('http')) {
            if (src.startsWith('/')) src = `${SERVER_URL}${src}`;
          }
          const r = await fetch(src);
          if (r.ok) {
            const blob = await r.blob();
            const contentType = r.headers.get('content-type') || blob.type || 'image/jpeg';
            let ext = 'jpg';
            if (contentType.includes('png')) ext = 'png';
            else if (contentType.includes('webp')) ext = 'webp';
            else if (contentType.includes('gif')) ext = 'gif';
            const filename = `${formData.name.replace(/\s+/g,'_').slice(0,30)||'ai'}-${Date.now()}.${ext}`;
            const file = new File([blob], filename, { type: contentType });
            const fd = new FormData();
            fd.append('file', file);
            const uploaded = await api.post('/restaurant/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            finalImage = uploaded.data.url;
            toast.success('AI image saved!', { id: saveToast });
          } else {
            throw new Error('Failed to download preview image');
          }
        } catch (e) {
          // If client-side download/upload failed (CORS or network), try server-side persist as fallback
          try {
            const res = await api.post('/restaurant/generate-image', { itemName: formData.name, persist: true });
            finalImage = res.data.imageUrl;
            toast.success('AI image saved on server', { id: saveToast });
          } catch (e2) {
            toast.error('Failed to persist AI image automatically', { id: saveToast });
          }
        } finally {
          setUploading(false);
        }
      }

      const payload = {
        ...formData,
        image: finalImage,
        isAutoImage: false,
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
                          {item.image ? (
                            <img
                              src={item.image.startsWith('http') ? item.image : (item.image.startsWith('/api') ? item.image : `${SERVER_URL}${item.image}`)}
                              alt={item.name}
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                               onError={(e: any) => {
                                 e.currentTarget.onerror = null;
                                 e.currentTarget.src = '/fallback-food.png';
                               }}
                            />
                          ) : (
                            <span className="text-xl">🍕</span>
                          )}
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                             <p className="font-black text-text-primary uppercase tracking-tighter text-sm">{item.name}</p>
                             {item.productQR && <QrCode size={10} className="text-blue-500" />}
                          </div>
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
                   <div className="relative w-full h-full group">
                      <img 
                        key={formData.image} 
                        src={formData.image.startsWith('http') ? formData.image : (formData.image.startsWith('/api') ? formData.image : `${SERVER_URL}${formData.image}`)} 
                        alt="Preview" 
                        onLoad={() => console.log('Image loaded successfully')}
                        onError={(e) => {
                           const target = e.target as HTMLImageElement;
                           // Fallback 1: Try a more specific food-only search
                           if (!target.src.includes('loremflickr')) {
                              console.warn('AI Image failed, trying Food Search fallback...');
                              const searchTerm = `food,${encodeURIComponent(formData.name)}`;
                              target.src = `https://loremflickr.com/800/800/${searchTerm}?lock=${Math.floor(Math.random() * 10000)}`;
                              return;
                           }
                           // Fallback 2: Premium Food Placeholder
                           target.src = 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=800&auto=format&fit=crop';
                           toast.error('Connection slow. Used a similar image.');
                        }}
                        className="w-full h-full object-cover rounded-[22px] shadow-sm transition-opacity duration-300 opacity-100" 
                      />
                      <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-[22px]">
                         <Upload className="text-white mb-1" size={20} />
                         <span className="text-[8px] font-black uppercase text-white tracking-widest px-2 text-center leading-tight">Change Image</span>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setFormData(prev => ({ ...prev, image: '' })); }}
                        className="absolute -top-1 -right-1 p-1.5 bg-danger text-white rounded-full shadow-lg border-2 border-bg-secondary z-10 hover:scale-110 active:scale-95 transition-transform"
                      >
                         <X size={10} />
                      </button>
                   </div>
                ) : (
                   <div className="flex flex-col items-center justify-center gap-1.5">
                      <div className="p-3 bg-bg-tertiary rounded-2xl border border-border/50 text-text-muted group-hover:text-blue-400 group-hover:border-blue-400/50 transition-all">
                        <Upload size={20} />
                      </div>
                      <span className="text-[9px] font-black uppercase text-text-muted tracking-wide">Select Photo</span>
                   </div>
                )}
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
             </div>
             <div className="flex-1 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input 
                    label="Signature Name" 
                    value={formData.name} 
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                    onBlur={() => { if (!formData.image && formData.name.length > 3) handleAIGenerateImage(); }}
                    placeholder="e.g. Avocado Toast" 
                  />
                  <Input label="Price Point" type="number" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} placeholder="0.00" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                   <div className="col-span-2">
                      <Input label="Chef's Note / Description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Describe the flavors..." />
                   </div>
                   <div className="flex flex-col gap-1.5 justify-end pb-0.5">
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="h-10 uppercase font-black text-[9px] bg-gradient-to-r from-purple-600/20 to-blue-600/20 border-purple-500/30 hover:border-purple-500"
                        icon={<Sparkles size={14} className="text-purple-400" />}
                        onClick={handleAIGenerateImage}
                        loading={uploading}
                      >
                         AI Photo
                      </Button>
                      {/* Automatic save on submit — separate Save AI button removed */}
                   </div>
                </div>
              </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="flex flex-col gap-1.5 col-span-1">
              <label className="text-[10px] font-black uppercase text-text-muted ml-1">Assigned Menu</label>
              <select className="glass-input h-10 text-xs font-bold" value={formData.menuId} onChange={(e) => setFormData({ ...formData, menuId: Number(e.target.value) })}>
                <option value={0}>General Menu</option>
                {menus?.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5 col-span-1">
              <label className="text-[10px] font-black uppercase text-text-muted ml-1">Category</label>
              <select className="glass-input h-10 text-xs font-bold" value={formData.categoryId} onChange={(e) => setFormData({ ...formData, categoryId: Number(e.target.value) })}>
                <option value={0}>Main Course</option>
                {categories?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <Input label="Kitchen Prep (min)" type="number" value={formData.preparationTime} onChange={(e) => setFormData({ ...formData, preparationTime: e.target.value })} placeholder="15" />
            <Input label="Product QR / Barcode" value={formData.productQR} onChange={(e) => setFormData({ ...formData, productQR: e.target.value })} placeholder="Scan or type..." icon={<QrCode size={14} />} />
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

          {/* Modifier Group Selection - Now visible for NEW items too */}
          <div className="pt-4 border-t border-border/50">
            <div className="mb-2 font-bold text-xs text-text-muted flex items-center gap-2">
               <Layers size={12} className="text-blue-400" />
               Linked Modifier Groups:
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {editingItem?.itemModifiers?.map((im: any) => (
                <Badge key={im.modifierGroup.id} variant="info" className="gap-1 px-3">
                   {im.modifierGroup.name}
                </Badge>
              ))}
              {(!editingItem?.itemModifiers || editingItem.itemModifiers.length === 0) && <span className="text-[10px] uppercase font-bold text-text-muted tracking-widest italic ml-1 opacity-50">None Linked</span>}
            </div>
            
            {(editingItem || !editingItem) && (
              <div className="flex gap-2 items-end bg-bg-tertiary/20 p-3 rounded-xl border border-border/30">
                <div className="flex-1">
                  <label className="text-[9px] font-black uppercase text-text-muted mb-1 ml-1 block tracking-wider">Enhance with Modifiers</label>
                  <select className="glass-input w-full text-xs h-9 font-bold" value={selectedModifier} onChange={e => setSelectedModifier(e.target.value)}>
                    <option value="">Choose Modifier Group...</option>
                    {modifierGroups.map((mg: any) => (
                      <option key={mg.id} value={mg.id}>{mg.name}</option>
                    ))}
                  </select>
                </div>
                <Button 
                  size="sm" 
                  className="h-9 px-6 bg-bg-tertiary border border-border/50 hover:border-blue-500/50 hover:text-blue-400 transition-all font-black text-[10px] uppercase tracking-tighter"
                  onClick={handleLinkModifier} 
                  loading={linking} 
                  disabled={!selectedModifier || (!editingItem && !linking)}
                >
                  {editingItem ? 'Link Group' : 'Save Item to Link'}
                </Button>
              </div>
            )}
            {!editingItem && <div className="mt-2 text-[9px] font-bold text-blue-500/60 flex items-center gap-1 ml-1"> <Info size={10}/> Create the item first to start adding modifier groups.</div>}
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
