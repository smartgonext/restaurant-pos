import { useQuery } from '@tanstack/react-query';
import { useState, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Search, Trash2, Edit, FileEdit, ArrowDownToLine, Upload, Filter, UtensilsCrossed } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';

export default function Menus() {
  const [activeMenu, setActiveMenu] = useState<number | null>(null);

  // Menu Modal State
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [editingMenu, setEditingMenu] = useState<any>(null);
  const [menuFormData, setMenuFormData] = useState({ name: '', description: '', isActive: true });

  // Menu Item Modal State
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [itemFormData, setItemFormData] = useState({
    name: '', description: '', price: '', categoryId: '', isVeg: true, image: '', isAvailable: true, showOnCustomerSite: true, preparationTime: ''
  });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const SERVER_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

  // Assign Table Modal State
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignData, setAssignData] = useState({ tableId: '', menuId: '', isActive: true });

  // Queries
  const { data: menus, isLoading: isLoadingMenus, refetch: refetchMenus } = useQuery({
    queryKey: ['menus'],
    queryFn: () => api.get('/restaurant/menus').then((r) => r.data.data),
  });

  const { data: menuItems, refetch: refetchItems } = useQuery({
    queryKey: ['menu-items'],
    queryFn: () => api.get('/restaurant/menu-items').then((r) => r.data.data),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/restaurant/item-categories').then((r) => r.data.data),
  });

  const { data: tables } = useQuery({
    queryKey: ['tables'],
    queryFn: () => api.get('/restaurant/tables').then((r) => r.data.data),
  });

  // Set initial active menu
  if (activeMenu === null && menus && menus.length > 0) {
      setActiveMenu(menus[0].id);
  }

  // ==== MENU OPERATIONS ====
  const openAddMenu = () => {
    setEditingMenu(null);
    setMenuFormData({ name: '', description: '', isActive: true });
    setShowMenuModal(true);
  };

  const openEditMenu = (menu: any) => {
    setEditingMenu(menu);
    setMenuFormData({ name: menu.name, description: menu.description || '', isActive: menu.isActive });
    setShowMenuModal(true);
  };

  const handleSaveMenu = async () => {
    try {
      if (editingMenu) {
        await api.put(`/restaurant/menus/${editingMenu.id}`, menuFormData);
        toast.success('Menu updated!');
      } else {
        await api.post('/restaurant/menus', menuFormData);
        toast.success('Menu created!');
      }
      setShowMenuModal(false);
      refetchMenus();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save menu');
    }
  };

  const handleDeleteMenu = async (id: number) => {
    if (!confirm('Are you sure you want to delete this menu?')) return;
    try {
      await api.delete(`/restaurant/menus/${id}`);
      toast.success('Menu deleted');
      if (activeMenu === id) setActiveMenu(null);
      refetchMenus();
    } catch (err: any) {
      toast.error('Failed to delete menu');
    }
  };

  // ==== MENU ITEM OPERATIONS ====
  const openAddItem = () => {
    setEditingItem(null);
    setItemFormData({ name: '', description: '', price: '', categoryId: '', isVeg: true, image: '', isAvailable: true, showOnCustomerSite: true, preparationTime: '' });
    setShowItemModal(true);
  };

  const openEditItem = (item: any) => {
    setEditingItem(item);
    setItemFormData({
      name: item.name, description: item.description || '', price: item.price,
      categoryId: item.categoryId || '', isVeg: item.isVeg, image: item.image || '',
      isAvailable: item.isAvailable, showOnCustomerSite: item.showOnCustomerSite,
      preparationTime: item.preparationTime?.toString() || ''
    });
    setShowItemModal(true);
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
      setItemFormData({ ...itemFormData, image: res.data.url });
      toast.success('Image uploaded!', { id: toastId });
    } catch (err) {
      toast.error('Upload failed', { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  const handleSaveItem = async () => {
    try {
      const payload = {
         ...itemFormData,
         price: Number(itemFormData.price),
         categoryId: itemFormData.categoryId ? Number(itemFormData.categoryId) : null,
         preparationTime: itemFormData.preparationTime ? Number(itemFormData.preparationTime) : null,
         menuId: activeMenu
      };
      if (editingItem) {
        await api.put(`/restaurant/menu-items/${editingItem.id}`, payload);
        toast.success('Item updated!');
      } else {
        await api.post('/restaurant/menu-items', payload);
        toast.success('Item added!');
      }
      setShowItemModal(false);
      refetchItems();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save item');
    }
  };

  const handleDeleteItem = async (id: number) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      await api.delete(`/restaurant/menu-items/${id}`);
      toast.success('Item deleted');
      refetchItems();
    } catch (err: any) {
      toast.error('Failed to delete item');
    }
  };

  const handleToggleItemStatus = async (item: any, field: string, value: boolean) => {
    try {
      await api.put(`/restaurant/menu-items/${item.id}`, { [field]: value });
      toast.success('Status updated');
      refetchItems();
    } catch(e) { toast.error('Failed to update'); }
  };

  // ==== ASSIGN TABLE ====
  const handleAssignTable = async () => {
      try {
          if (!assignData.tableId || !assignData.menuId) return toast.error("Please select a valid table and menu.");
          await api.post('/restaurant/tables/assign-menu', assignData);
          toast.success("Menu assigned to table successfully!");
          setShowAssignModal(false);
      } catch (e: any) {
          toast.error("Failed to assign menu to table");
      }
  };

  const selectedMenuData = menus?.find((m: any) => m.id === activeMenu);
  const displayItems = menuItems?.filter((item: any) => item.menuId === activeMenu) || [];

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
         <h1 className="text-2xl font-bold text-text-primary">Menus</h1>
         <div className="flex gap-3">
            <Button variant="secondary" className="bg-bg-tertiary border-border hover:bg-bg-hover" onClick={() => setShowAssignModal(true)}>Assign Menu to Table</Button>
            <Button variant="secondary" className="bg-bg-tertiary border-border hover:bg-bg-hover">Organize Menu Items</Button>
            <Button className="bg-[#a87fff] hover:bg-[#976aff] text-white" onClick={openAddMenu}>Add Menu</Button>
         </div>
      </div>

      <div className="relative">
         <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
         <input 
            className="w-full bg-bg-secondary border border-border/50 text-text-primary pl-11 h-12 rounded-xl focus:border-blue-500/50 outline-none" 
            placeholder="Search your menu here" 
         />
      </div>

      {isLoadingMenus ? (
         <div className="flex gap-4 overflow-x-auto pb-2 custom-scrollbar">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="min-w-[280px] h-[78px] rounded-xl" />)}
         </div>
      ) : menus?.length === 0 ? (
         <Card className="text-center py-12">
            <UtensilsCrossed className="w-12 h-12 text-text-muted mx-auto mb-3" />
            <p className="text-text-muted mb-4">No menus found. Create your first menu!</p>
            <Button onClick={openAddMenu}>Create Menu</Button>
         </Card>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2 custom-scrollbar">
           {menus?.map((menu: any) => (
              <button 
                key={menu.id} 
                onClick={() => setActiveMenu(menu.id)}
                className={`flex items-center gap-4 min-w-[280px] p-4 rounded-xl border border-border/50 transition-all text-left ${activeMenu === menu.id ? 'bg-[#a87fff] text-white' : 'bg-bg-secondary text-text-primary hover:border-[#a87fff]/50'}`}
              >
                 <div className={`p-2.5 rounded-lg ${activeMenu === menu.id ? 'bg-white/20' : 'bg-bg-tertiary'}`}>
                    <FileEdit className={`w-5 h-5 ${activeMenu === menu.id ? 'text-white' : 'text-text-muted'}`} />
                 </div>
                 <div>
                    <h3 className="font-semibold">{menu.name}</h3>
                    <p className={`text-xs mt-0.5 ${activeMenu === menu.id ? 'text-white/80' : 'text-text-muted'}`}>{menu._count?.menuItems || 0} Item(s)</p>
                 </div>
              </button>
           ))}
        </div>
      )}

      {selectedMenuData && (
          <div className="space-y-6 mt-8">
              <div className="flex items-center gap-4 border-b border-border/50 pb-6">
                 <h2 className="text-xl font-bold text-white">{selectedMenuData.name}</h2>
                 <Button variant="secondary" size="sm" icon={<Edit className="w-3.5 h-3.5"/>} className="text-xs py-1.5 px-3" onClick={() => openEditMenu(selectedMenuData)}>Update</Button>
                 <button onClick={() => handleDeleteMenu(selectedMenuData.id)} className="p-1.5 border border-danger/50 text-danger rounded-lg hover:bg-danger/10 transition-colors">
                     <Trash2 className="w-4 h-4" />
                 </button>
              </div>

              <div>
                 <h3 className="text-lg font-bold text-text-primary mb-4">Menu Items</h3>
                 
                 <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                     <div className="flex gap-3 w-full sm:w-auto">
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                            <input className="w-full bg-bg-secondary border border-border/50 text-text-primary pl-9 h-10 rounded-lg text-sm focus:border-blue-500/50 outline-none" placeholder="Search your menu item here" />
                        </div>
                        <Button variant="secondary" icon={<Filter className="w-4 h-4"/>} className="bg-bg-secondary text-sm">Show Filters</Button>
                     </div>
                     <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                         <Button variant="secondary" className="bg-bg-secondary text-xs">Organize Menu Items</Button>
                         <Button variant="secondary" icon={<ArrowDownToLine className="w-3.5 h-3.5"/>} className="bg-bg-secondary text-xs text-text-secondary">Export Menu Items</Button>
                         <Button variant="secondary" icon={<Upload className="w-3.5 h-3.5"/>} className="bg-bg-secondary text-xs text-text-secondary">Bulk Upload</Button>
                         <Button className="bg-[#a87fff] hover:bg-[#976aff] text-white text-xs" onClick={openAddItem}>Add Menu Item</Button>
                     </div>
                 </div>

                 <Card padding={false} className="border-border/50 overflow-hidden">
                     <div className="overflow-x-auto min-h-[400px]">
                         <table className="w-full text-sm whitespace-nowrap">
                             <thead>
                                 <tr className="bg-bg-tertiary/30 border-b border-border text-left">
                                     <th className="py-4 px-6 font-semibold text-xs tracking-wider text-text-muted uppercase">Item Name</th>
                                     <th className="py-4 px-6 font-semibold text-xs tracking-wider text-text-muted uppercase text-center">Price</th>
                                     <th className="py-4 px-6 font-semibold text-xs tracking-wider text-text-muted uppercase">Item Category</th>
                                     <th className="py-4 px-6 font-semibold text-xs tracking-wider text-text-muted uppercase text-center">Is Available</th>
                                     <th className="py-4 px-6 font-semibold text-xs tracking-wider text-text-muted uppercase text-center">Show on Customer Site</th>
                                     <th className="py-4 px-6 font-semibold text-xs tracking-wider text-text-muted uppercase text-right">Action</th>
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-border/50">
                                 {displayItems.map((item: any) => (
                                     <tr key={item.id} className="hover:bg-bg-hover/30 transition-colors group">
                                         <td className="py-4 px-6">
                                            <div className="flex items-start gap-4">
                                                <img 
                                                   src={item.image || `https://ui-avatars.com/api/?name=${item.name}&background=1a1a2e&color=fff&size=100`} 
                                                   alt={item.name} 
                                                   className="w-12 h-12 rounded-lg object-cover border border-border/50"
                                                />
                                                <div>
                                                   <div className="flex items-center gap-2 mb-1">
                                                       <div className={`w-2 h-2 rounded-sm ${item.isVeg ? 'bg-success' : 'bg-danger'}`} />
                                                       <span className="font-semibold text-text-primary text-base">{item.name}</span>
                                                   </div>
                                                   <p className="text-xs text-text-muted mt-0.5 whitespace-normal line-clamp-1 max-w-[250px]">{item.description}</p>
                                                </div>
                                            </div>
                                         </td>
                                         <td className="py-4 px-6 text-center font-bold text-text-primary">{formatCurrency(item.price)}</td>
                                         <td className="py-4 px-6 text-text-secondary">{item.category?.name || '-'}</td>
                                         <td className="py-4 px-6 text-center">
                                             <label className="relative inline-flex items-center cursor-pointer">
                                                <input type="checkbox" className="sr-only peer" checked={item.isAvailable} onChange={(e) => handleToggleItemStatus(item, 'isAvailable', e.target.checked)} />
                                                <div className="w-9 h-5 bg-bg-tertiary rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#a87fff]"></div>
                                             </label>
                                         </td>
                                         <td className="py-4 px-6 text-center">
                                             <label className="relative inline-flex items-center cursor-pointer">
                                                <input type="checkbox" className="sr-only peer" checked={item.showOnCustomerSite} onChange={(e) => handleToggleItemStatus(item, 'showOnCustomerSite', e.target.checked)} />
                                                <div className="w-9 h-5 bg-bg-tertiary rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#a87fff]"></div>
                                             </label>
                                         </td>
                                         <td className="py-4 px-6 text-right">
                                             <div className="flex items-center justify-end gap-2">
                                                 <Button variant="secondary" size="sm" className="bg-bg-tertiary text-text-secondary text-xs px-2 py-1.5 min-h-0 h-auto" onClick={() => openEditItem(item)} icon={<Edit className="w-3.5 h-3.5"/>}>Update</Button>
                                                 <button onClick={() => handleDeleteItem(item.id)} className="p-1.5 border border-danger/50 text-danger rounded hover:bg-danger/10 transition-colors">
                                                     <Trash2 className="w-3.5 h-3.5" />
                                                 </button>
                                             </div>
                                         </td>
                                     </tr>
                                 ))}
                             </tbody>
                         </table>
                     </div>
                 </Card>
              </div>
          </div>
      )}

      {/* MENU MODAL */}
      <Modal open={showMenuModal} onClose={() => setShowMenuModal(false)} title={editingMenu ? "Update Menu" : "Create Menu"}>
        <div className="space-y-4">
          <Input label="Menu Name" value={menuFormData.name} onChange={(e) => setMenuFormData({ ...menuFormData, name: e.target.value })} placeholder="e.g. Main Menu, Lunch Menu" />
          <Input label="Description" value={menuFormData.description} onChange={(e) => setMenuFormData({ ...menuFormData, description: e.target.value })} placeholder="Optional description" />
          <div className="flex justify-end gap-3 mt-4 border-t border-border/50 pt-4">
            <Button variant="secondary" onClick={() => setShowMenuModal(false)}>Cancel</Button>
            <Button onClick={handleSaveMenu} className="bg-[#a87fff] hover:bg-[#976aff] text-white">Save</Button>
          </div>
        </div>
      </Modal>

      {/* MENU ITEM MODAL */}
      <Modal open={showItemModal} onClose={() => setShowItemModal(false)} title={editingItem ? "Update Menu Item" : "Create Menu Item"}>
        <div className="space-y-4">
          <div className="flex items-center gap-6">
             <div 
               onClick={() => fileInputRef.current?.click()}
               className="w-32 h-32 rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-blue-400 hover:bg-blue-400/5 transition-all overflow-hidden relative group"
             >
                {itemFormData.image ? (
                   <>
                      <img src={itemFormData.image.startsWith('http') ? itemFormData.image : `${SERVER_URL}${itemFormData.image}`} alt="Preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                         <Upload className="text-white" size={24} />
                      </div>
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
               <Input label="Item Name" value={itemFormData.name} onChange={(e) => setItemFormData({ ...itemFormData, name: e.target.value })} placeholder="e.g. Paneer Tikka" />
               <div className="grid grid-cols-2 gap-4">
                  <Input label="Price" type="number" value={itemFormData.price} onChange={(e) => setItemFormData({ ...itemFormData, price: e.target.value })} placeholder="0.00" />
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">Category</label>
                    <select 
                       className="w-full bg-bg-secondary border border-border/50 text-text-primary px-3 h-10 rounded-lg outline-none focus:border-[#a87fff]/50"
                       value={itemFormData.categoryId}
                       onChange={(e) => setItemFormData({ ...itemFormData, categoryId: e.target.value })}
                    >
                       <option value="">Select Category</option>
                       {categories?.map((c: any) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                       ))}
                    </select>
                  </div>
               </div>
             </div>
          </div>
          
          <Input label="Description" value={itemFormData.description} onChange={(e) => setItemFormData({ ...itemFormData, description: e.target.value })} placeholder="Item details" />
          
          <div className="grid grid-cols-2 gap-4">
              <Input label="Preparation Time (min)" type="number" value={itemFormData.preparationTime} onChange={(e) => setItemFormData({ ...itemFormData, preparationTime: e.target.value })} placeholder="15" />
          </div>
          
          <div className="flex items-center gap-6">
             <label className="flex items-center gap-2 cursor-pointer">
                 <input type="checkbox" checked={itemFormData.isVeg} onChange={(e) => setItemFormData({ ...itemFormData, isVeg: e.target.checked })} className="accent-[#a87fff] w-4 h-4" />
                 <span className="text-sm font-medium text-text-primary">Is Vegetarian</span>
             </label>
          </div>

          <div className="flex justify-end gap-3 mt-4 border-t border-border/50 pt-4">
            <Button variant="secondary" onClick={() => setShowItemModal(false)}>Cancel</Button>
            <Button onClick={handleSaveItem} className="bg-[#a87fff] hover:bg-[#976aff] text-white">Save</Button>
          </div>
        </div>
      </Modal>

      {/* ASSIGN TABLE MODAL */}
      <Modal open={showAssignModal} onClose={() => setShowAssignModal(false)} title="Assign Menu to Table">
          <div className="space-y-4">
              <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">Table</label>
                  <select 
                    className="w-full bg-bg-tertiary border border-border rounded-lg text-sm px-3 py-2.5 outline-none appearance-none focus:border-blue-500/50"
                    value={assignData.tableId}
                    onChange={(e) => setAssignData({ ...assignData, tableId: e.target.value })}
                  >
                      <option value="">Select Table</option>
                      {tables?.map((t: any) => (
                          <option key={t.id} value={t.id}>{t.name} {t.area?.name ? `(${t.area.name})` : ''}</option>
                      ))}
                  </select>
              </div>
              <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">Menu Name</label>
                  <div className="border border-border rounded-lg overflow-hidden bg-bg-secondary">
                      <div className="flex justify-between items-center p-3 border-b border-border bg-bg-tertiary/50">
                          <span className="text-xs font-semibold text-text-muted uppercase">MENU NAME</span>
                          <span className="text-xs font-semibold text-text-muted uppercase">SELECT</span>
                      </div>
                      <div className="divide-y divide-border/50 max-h-48 overflow-y-auto custom-scrollbar">
                          {menus?.map((m: any) => (
                              <label key={m.id} className="flex justify-between items-center p-3 hover:bg-bg-hover cursor-pointer">
                                  <span className="text-sm">{m.name}</span>
                                  <input 
                                     type="radio" 
                                     name="menu_assign" 
                                     className="w-4 h-4 accent-blue-500" 
                                     checked={assignData.menuId === String(m.id)}
                                     onChange={() => setAssignData({ ...assignData, menuId: String(m.id) })}
                                  />
                              </label>
                          ))}
                      </div>
                  </div>
              </div>
              <label className="flex items-center gap-2 mt-4 cursor-pointer">
                  <input type="checkbox" checked={assignData.isActive} onChange={(e) => setAssignData({ ...assignData, isActive: e.target.checked })} className="w-4 h-4 rounded appearance-none border border-border checked:bg-blue-500 relative before:content-['✓'] before:absolute before:text-white before:text-[10px] before:left-0.5 before:hidden checked:before:block" />
                  <span className="text-sm font-medium">Active</span>
              </label>

              <div className="flex justify-end gap-3 pt-6 border-t border-border mt-4">
                  <Button variant="secondary" onClick={() => setShowAssignModal(false)}>Close</Button>
                  <Button onClick={handleAssignTable}>Save</Button>
              </div>
          </div>
      </Modal>

    </div>
  );
}
