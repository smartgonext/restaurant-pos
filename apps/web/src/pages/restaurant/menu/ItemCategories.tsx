import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { 
  Plus, Edit, Trash2, FolderOpen, Filter, Search, 
  ArrowLeft, ChevronRight, UtensilsCrossed, Upload 
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { cn, formatCurrency, resolveImageUrl } from '@/lib/utils';
import ImageLibraryModal from '@/components/ImageLibraryModal';
import { Skeleton } from '@/components/ui/Skeleton';

export default function ItemCategories() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<number | null>(null);

  // Search & Filter State
  const [categorySearch, setCategorySearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<number | 'all'>('all');
  const [vegFilter, setVegFilter] = useState<'all' | 'veg' | 'non-veg'>('all');

  // Category Modal State
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [showCategoryImageLib, setShowCategoryImageLib] = useState(false);
  const categoryFileRef = useRef<HTMLInputElement | null>(null);
  const [categoryFormData, setCategoryFormData] = useState({
    name: '',
    description: '',
    image: '',
    groupId: 0,
  });

  // Item Modal State (for inside category view)
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [itemFormData, setItemFormData] = useState({
    name: '',
    description: '',
    price: '',
    isVeg: true,
    image: '',
    isAvailable: true,
    showOnCustomerSite: true,
  });
  const [uploadingItemImage, setUploadingItemImage] = useState(false);
  const itemFileRef = useRef<HTMLInputElement | null>(null);

  // Queries
  const { data: groups = [] } = useQuery({
    queryKey: ['item-groups'],
    queryFn: () => api.get('/restaurant/item-groups').then((r) => (r.data.data || []).sort((a: any, b: any) => a.name.localeCompare(b.name))),
  });

  const { data: categories = [], isLoading: categoriesLoading, refetch: refetchCategories } = useQuery({
    queryKey: ['item-categories'],
    queryFn: () => api.get('/restaurant/item-categories').then((r) => (r.data.data || []).sort((a: any, b: any) => a.name.localeCompare(b.name))),
  });

  const { data: menuItems = [], isLoading: itemsLoading, refetch: refetchItems } = useQuery({
    queryKey: ['menu-items-all'],
    queryFn: () => api.get('/restaurant/menu-items').then((r) => r.data.data || []),
  });

  // Filter Categories for View 1
  const filteredCategories = categories.filter((cat: any) => {
    if (selectedGroupId !== 'all' && Number(cat.groupId) !== Number(selectedGroupId)) {
      return false;
    }
    if (categorySearch) {
      const q = categorySearch.toLowerCase();
      const matchName = cat.name?.toLowerCase().includes(q);
      const matchDesc = cat.description?.toLowerCase().includes(q);
      if (!matchName && !matchDesc) return false;
    }
    return true;
  });

  const selectedCategoryData = categories.find((c: any) => c.id === activeCategory);

  // Filter Items for View 2 (Inside Category)
  const displayItems = menuItems.filter((item: any) => {
    if (item.categoryId !== activeCategory) return false;

    if (itemSearch) {
      const q = itemSearch.toLowerCase();
      const matchName = item.name?.toLowerCase().includes(q);
      const matchDesc = item.description?.toLowerCase().includes(q);
      if (!matchName && !matchDesc) return false;
    }

    if (vegFilter === 'veg' && !item.isVeg) return false;
    if (vegFilter === 'non-veg' && item.isVeg) return false;

    return true;
  });

  // ==== CATEGORY OPERATIONS ====
  const handleOpenCategory = (cat: any = null) => {
    if (cat) {
      setEditingCategoryId(cat.id);
      setCategoryFormData({
        name: cat.name,
        description: cat.description || '',
        image: cat.image || '',
        groupId: Number(cat.groupId || cat.group?.id || 0),
      });
    } else {
      setEditingCategoryId(null);
      setCategoryFormData({
        name: '',
        description: '',
        image: '',
        groupId: Number(selectedGroupId !== 'all' ? selectedGroupId : (groups?.[0]?.id || 0)),
      });
    }
    setNameError(null);
    setShowCategoryModal(true);
  };

  const handleCategorySubmit = async () => {
    const name = String(categoryFormData.name || '').trim();
    if (!name) {
      setNameError('Please enter a category name');
      return;
    }
    if (!categoryFormData.groupId) {
      setNameError('Please select a group');
      return;
    }

    const duplicate = categories?.find((c: any) => c.name?.trim().toLowerCase() === name.toLowerCase() && c.id !== editingCategoryId);
    if (duplicate) {
      setNameError('Category with this name already exists');
      return;
    }

    try {
      const payload = { ...categoryFormData, name, groupId: Number(categoryFormData.groupId) };
      if (editingCategoryId) {
        await api.put(`/restaurant/item-categories/${editingCategoryId}`, payload);
        toast.success('Category updated!');
      } else {
        await api.post('/restaurant/item-categories', payload);
        toast.success('Category created!');
      }
      setShowCategoryModal(false);
      refetchCategories();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save category');
    }
  };

  const handleDeleteCategory = async (id: number) => {
    if (!confirm('Are you sure you want to delete this category?')) return;
    try {
      await api.delete(`/restaurant/item-categories/${id}`);
      toast.success('Category deleted');
      if (activeCategory === id) {
        setActiveCategory(null);
      }
      refetchCategories();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete category');
    }
  };

  const uploadImageFile = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await api.post('/restaurant/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const url = res?.data?.url;
    if (!url) throw new Error('Upload did not return image url');
    setCategoryFormData((prev) => ({ ...prev, image: url }));
  };

  // ==== ITEM OPERATIONS ====
  const openAddItem = () => {
    navigate(`/admin/menu/items?action=add${activeCategory ? `&categoryId=${activeCategory}` : ''}`, {
      state: { openAdd: true, categoryId: activeCategory }
    });
  };

  const openEditItem = (item: any) => {
    setEditingItem(item);
    setItemFormData({
      name: item.name,
      description: item.description || '',
      price: String(item.price),
      isVeg: item.isVeg,
      image: item.image || '',
      isAvailable: item.isAvailable,
      showOnCustomerSite: item.showOnCustomerSite,
    });
    setShowItemModal(true);
  };

  const handleSaveItem = async () => {
    if (!itemFormData.name.trim()) {
      toast.error('Please enter an item name');
      return;
    }
    if (!itemFormData.price || Number(itemFormData.price) <= 0) {
      toast.error('Please enter a valid price');
      return;
    }

    try {
      const payload = {
        ...itemFormData,
        price: Number(itemFormData.price),
        categoryId: activeCategory,
      };

      if (editingItem) {
        await api.put(`/restaurant/menu-items/${editingItem.id}`, payload);
        toast.success('Item updated!');
      } else {
        await api.post('/restaurant/menu-items', payload);
        toast.success('Item created!');
      }
      setShowItemModal(false);
      refetchItems();
      refetchCategories();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save item');
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!confirm('Are you sure you want to delete this menu item?')) return;
    try {
      await api.delete(`/restaurant/menu-items/${itemId}`);
      toast.success('Item deleted!');
      refetchItems();
      refetchCategories();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete item');
    }
  };

  const handleToggleItemStatus = async (item: any, field: string, value: boolean) => {
    try {
      await api.put(`/restaurant/menu-items/${item.id}`, { [field]: value });
      toast.success('Status updated');
      refetchItems();
    } catch (e) {
      toast.error('Failed to update status');
    }
  };

  const handleItemFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingItemImage(true);
    const toastId = toast.loading('Uploading image...');
    const fd = new FormData();
    fd.append('file', file);

    try {
      const res = await api.post('/restaurant/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setItemFormData({ ...itemFormData, image: res.data.url });
      toast.success('Image uploaded!', { id: toastId });
    } catch (err) {
      toast.error('Upload failed', { id: toastId });
    } finally {
      setUploadingItemImage(false);
    }
  };

  return (
    <div className="space-y-6 animate-in">
      
      {/* ======================================================== */}
      {/* VIEW 1: CATEGORIES OVERVIEW (WHEN NO CATEGORY SELECTED)   */}
      {/* ======================================================== */}
      {activeCategory === null ? (
        <div className="space-y-6">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Item Categories</h1>
              <p className="text-xs text-text-muted mt-1">Select a category to view its items, or create new categories.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* Group Filter */}
              <div className="flex items-center gap-2 bg-bg-secondary px-3 py-2 rounded-xl border border-border/50">
                <Filter className="w-4 h-4 text-text-muted" />
                <select 
                  className="bg-transparent text-xs font-semibold text-text-primary focus:outline-none cursor-pointer"
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                >
                  <option value="all">All Groups</option>
                  {groups.map((g: any) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              <Button className="bg-[#a87fff] hover:bg-[#976aff] text-white flex items-center gap-2" onClick={() => handleOpenCategory()}>
                <Plus className="w-4 h-4" /> Add Category
              </Button>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input 
              value={categorySearch}
              onChange={(e) => setCategorySearch(e.target.value)}
              className="w-full bg-bg-secondary border border-border/50 text-text-primary pl-11 h-12 rounded-xl focus:border-[#a87fff]/50 outline-none transition-all placeholder:text-text-muted text-sm" 
              placeholder="Search category by name..." 
            />
          </div>

          {/* Category Cards Grid */}
          {categoriesLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-2xl" />
              ))}
            </div>
          ) : filteredCategories.length === 0 ? (
            <Card className="text-center py-16 border-dashed border-2 border-border/60">
              <FolderOpen className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-60" />
              <h3 className="text-lg font-semibold text-text-primary mb-1">
                {categorySearch || selectedGroupId !== 'all' ? 'No matching categories found' : 'No categories created yet'}
              </h3>
              <p className="text-sm text-text-muted mb-6">
                {categorySearch || selectedGroupId !== 'all' ? 'Try adjusting your search or group filter.' : 'Get started by creating your first menu category!'}
              </p>
              <Button onClick={() => handleOpenCategory()} className="bg-[#a87fff] hover:bg-[#976aff] text-white">
                <Plus className="w-4 h-4 mr-2 inline" /> Create Category
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredCategories.map((cat: any) => {
                const itemCount = cat._count?.menuItems || 0;
                return (
                  <div 
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className="group relative bg-bg-secondary border border-border/50 hover:border-[#a87fff]/60 rounded-2xl p-6 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-xl hover:-translate-y-1 flex flex-col justify-between"
                  >
                    {!cat.isKOTEnabled && (
                      <span className="absolute top-3 right-3 px-2 py-0.5 bg-warning/15 text-warning text-[10px] font-bold rounded-md uppercase">
                        Non-KOT
                      </span>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-12 h-12 rounded-xl bg-bg-tertiary border border-border/50 flex items-center justify-center overflow-hidden shrink-0">
                          {cat.image ? (
                            <img src={resolveImageUrl(cat.image)} className="w-full h-full object-cover" alt={cat.name} />
                          ) : (
                            <div className="text-lg font-bold text-[#a87fff]">{cat.name[0]}</div>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button 
                            onClick={() => handleOpenCategory(cat)}
                            title="Edit Category"
                            className="p-2 border border-border/50 text-text-muted hover:text-text-primary hover:bg-bg-tertiary rounded-lg transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteCategory(cat.id)}
                            title="Delete Category"
                            className="p-2 border border-danger/30 text-danger hover:bg-danger/10 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <h3 className="text-lg font-bold text-text-primary group-hover:text-[#a87fff] transition-colors line-clamp-1">
                        {cat.name}
                      </h3>
                      
                      <p className="text-xs text-[#a87fff] font-medium mt-0.5 line-clamp-1">
                        Group: {cat.group?.name || 'No Group'}
                      </p>

                      {cat.description && (
                        <p className="text-xs text-text-muted mt-1.5 line-clamp-2">
                          {cat.description}
                        </p>
                      )}
                    </div>

                    <div className="mt-6 pt-4 border-t border-border/40 flex items-center justify-between">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-[#a87fff]/10 text-[#a87fff]">
                        {itemCount} Item{itemCount === 1 ? '' : 's'}
                      </span>
                      
                      <span className="text-xs font-medium text-text-muted group-hover:text-text-primary flex items-center gap-1 transition-colors">
                        View Items <ChevronRight className="w-4 h-4 text-[#a87fff]" />
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Add New Category Shortcut Card */}
              <div 
                onClick={() => handleOpenCategory()}
                className="group border-2 border-dashed border-border/60 hover:border-[#a87fff]/60 rounded-2xl p-6 transition-all duration-200 cursor-pointer flex flex-col items-center justify-center text-center min-h-[200px] hover:bg-[#a87fff]/5"
              >
                <div className="w-12 h-12 rounded-full bg-bg-tertiary group-hover:bg-[#a87fff] text-text-muted group-hover:text-white flex items-center justify-center mb-3 transition-colors">
                  <Plus className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-text-primary group-hover:text-[#a87fff] transition-colors">Add New Category</h4>
                <p className="text-xs text-text-muted mt-1">Create a new item category</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ======================================================== */
        /* VIEW 2: INSIDE CATEGORY VIEW (ITEMS BELONGING TO CATEGORY) */
        /* ======================================================== */
        <div className="space-y-6">
          {/* Header & Back Button */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between border-b border-border/50 pb-5">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setActiveCategory(null)}
                className="p-2.5 rounded-xl border border-border/50 bg-bg-secondary hover:bg-bg-tertiary text-text-primary transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Categories
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">Item Categories</span>
                  <span className="text-xs text-text-muted">/</span>
                  <span className="text-xs font-semibold text-[#a87fff]">{selectedCategoryData?.name}</span>
                </div>
                <h1 className="text-2xl font-bold text-text-primary mt-0.5">{selectedCategoryData?.name}</h1>
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <Button variant="secondary" size="sm" icon={<Edit className="w-3.5 h-3.5"/>} onClick={() => handleOpenCategory(selectedCategoryData)}>
                Edit Category
              </Button>
              <Button size="sm" className="bg-[#a87fff] hover:bg-[#976aff] text-white" icon={<Plus className="w-4 h-4"/>} onClick={openAddItem}>
                Add Item to Category
              </Button>
              <button 
                onClick={() => handleDeleteCategory(selectedCategoryData.id)} 
                className="p-2 border border-danger/40 text-danger rounded-lg hover:bg-danger/10 transition-colors"
                title="Delete Category"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-bg-secondary p-4 rounded-xl border border-border/50">
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input 
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  className="w-full bg-bg-tertiary border border-border/50 text-text-primary pl-9 h-10 rounded-lg text-sm focus:border-[#a87fff]/50 outline-none" 
                  placeholder={`Search items in ${selectedCategoryData?.name}...`} 
                />
              </div>

              {/* Veg / Non-Veg Filter */}
              <div className="flex bg-bg-tertiary p-1 rounded-lg border border-border/50 text-xs w-full sm:w-auto">
                <button
                  onClick={() => setVegFilter('all')}
                  className={`px-3 py-1.5 rounded-md font-medium transition-all ${vegFilter === 'all' ? 'bg-[#a87fff] text-white' : 'text-text-muted hover:text-text-primary'}`}
                >
                  All
                </button>
                <button
                  onClick={() => setVegFilter('veg')}
                  className={`px-3 py-1.5 rounded-md font-medium transition-all ${vegFilter === 'veg' ? 'bg-success text-white' : 'text-text-muted hover:text-text-primary'}`}
                >
                  Veg
                </button>
                <button
                  onClick={() => setVegFilter('non-veg')}
                  className={`px-3 py-1.5 rounded-md font-medium transition-all ${vegFilter === 'non-veg' ? 'bg-danger text-white' : 'text-text-muted hover:text-text-primary'}`}
                >
                  Non-Veg
                </button>
              </div>
            </div>

            <div className="text-xs text-text-muted font-medium">
              Showing <span className="text-text-primary font-bold">{displayItems.length}</span> item(s) in category <span className="text-[#a87fff] font-bold">{selectedCategoryData?.name}</span>
            </div>
          </div>

          {/* Items Table */}
          <Card padding={false} className="border-border/50 overflow-hidden shadow-xl">
            {displayItems.length === 0 ? (
              <div className="text-center py-16 px-4">
                <UtensilsCrossed className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-50" />
                <h3 className="text-base font-semibold text-text-primary mb-1">No items found in this category</h3>
                <p className="text-xs text-text-muted mb-4">
                  {itemSearch || vegFilter !== 'all'
                    ? 'No items match your filter criteria.'
                    : `Start adding items to ${selectedCategoryData?.name}.`}
                </p>
                <Button size="sm" onClick={openAddItem} className="bg-[#a87fff] hover:bg-[#976aff] text-white">
                  <Plus className="w-4 h-4 mr-1.5 inline" /> Add Item to Category
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar scroll-smooth">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="bg-bg-tertiary/30 border-b border-border text-left">
                      <th className="py-4 px-6 font-semibold text-xs tracking-wider text-text-muted uppercase">Item Name</th>
                      <th className="py-4 px-6 font-semibold text-xs tracking-wider text-text-muted uppercase text-center">Price</th>
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
                              src={resolveImageUrl(item.image) || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=1a1a2e&color=fff&size=100`} 
                              alt={item.name} 
                              className="w-12 h-12 rounded-lg object-cover border border-border/50 shrink-0"
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
                            <Button variant="secondary" size="sm" className="bg-bg-tertiary text-text-secondary text-xs px-2.5 py-1.5 min-h-0 h-auto" onClick={() => openEditItem(item)} icon={<Edit className="w-3.5 h-3.5"/>}>
                              Update
                            </Button>
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
            )}
          </Card>
        </div>
      )}

      {/* CATEGORY MODAL */}
      <Modal open={showCategoryModal} onClose={() => setShowCategoryModal(false)} title={editingCategoryId ? 'Edit Category' : 'New Category'}>
        <div className="space-y-5 py-2">
          <div className="grid grid-cols-1 gap-5">
            <Input label="Category Name" value={categoryFormData.name} onChange={(e) => { setCategoryFormData({ ...categoryFormData, name: e.target.value }); setNameError(null); }} error={nameError || undefined} placeholder="e.g. Biryani, Juices" />
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-primary">Assign to Group</label>
              <select className="h-10 text-sm px-3 rounded-lg border border-border/50 bg-bg-secondary text-text-primary outline-none focus:border-[#a87fff]/50" value={categoryFormData.groupId} onChange={(e) => setCategoryFormData({ ...categoryFormData, groupId: Number(e.target.value) })}>
                <option value={0}>Select Group</option>
                {groups?.map((g: any) => (
                  <option key={g.id} value={g.id}>{g.name} ({g.isKOTEnabled ? 'KOT' : 'Non KOT'})</option>
                ))}
              </select>
            </div>
          </div>

          <Input label="Description" value={categoryFormData.description} onChange={(e) => setCategoryFormData({ ...categoryFormData, description: e.target.value })} placeholder="Optional description" />
          
          <div className="space-y-2">
            <Input label="Category Image URL" value={categoryFormData.image} onChange={(e) => setCategoryFormData({ ...categoryFormData, image: e.target.value })} placeholder="Optional image URL" />
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => categoryFileRef.current?.click()}>Upload File</Button>
              <Button variant="secondary" size="sm" onClick={() => setShowCategoryImageLib(true)}>Library</Button>
              <input
                ref={categoryFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    await uploadImageFile(file);
                    toast.success('Category image uploaded');
                  } catch (err: any) {
                    toast.error(err?.response?.data?.error || err?.message || 'Image upload failed');
                  } finally {
                    e.target.value = '';
                  }
                }}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-8 pt-5 border-t border-border/30">
            <Button variant="secondary" onClick={() => setShowCategoryModal(false)}>Cancel</Button>
            <Button className="bg-[#a87fff] hover:bg-[#976aff] text-white" onClick={handleCategorySubmit}>{editingCategoryId ? 'Update Category' : 'Create Category'}</Button>
          </div>
        </div>
      </Modal>

      {/* ITEM MODAL (FOR ADDING/EDITING ITEMS INSIDE CATEGORY) */}
      <Modal open={showItemModal} onClose={() => setShowItemModal(false)} title={editingItem ? 'Edit Menu Item' : `Add Item to ${selectedCategoryData?.name}`}>
        <div className="space-y-4">
          <div className="flex items-center gap-6">
            <div 
              onClick={() => itemFileRef.current?.click()}
              className="w-28 h-28 rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-[#a87fff] hover:bg-[#a87fff]/5 transition-all overflow-hidden relative group shrink-0"
            >
              {itemFormData.image ? (
                <>
                  <img src={resolveImageUrl(itemFormData.image)} alt="Preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Upload className="text-white" size={20} />
                  </div>
                </>
              ) : (
                <>
                  <Upload className="text-text-muted" size={20} />
                  <span className="text-[9px] font-bold uppercase text-text-muted">Upload Photo</span>
                </>
              )}
              <input type="file" ref={itemFileRef} className="hidden" accept="image/*" onChange={handleItemFileUpload} />
            </div>

            <div className="flex-1 space-y-4">
              <Input label="Item Name" value={itemFormData.name} onChange={(e) => setItemFormData({ ...itemFormData, name: e.target.value })} placeholder="e.g. Chicken Biryani" />
              <Input label="Price" type="number" value={itemFormData.price} onChange={(e) => setItemFormData({ ...itemFormData, price: e.target.value })} placeholder="0.00" />
            </div>
          </div>
          
          <Input label="Description" value={itemFormData.description} onChange={(e) => setItemFormData({ ...itemFormData, description: e.target.value })} placeholder="Item details" />
          
          <div className="flex items-center gap-6 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={itemFormData.isVeg} onChange={(e) => setItemFormData({ ...itemFormData, isVeg: e.target.checked })} className="accent-[#a87fff] w-4 h-4" />
              <span className="text-sm font-medium text-text-primary">Is Vegetarian</span>
            </label>
          </div>

          <div className="flex justify-end gap-3 mt-4 border-t border-border/50 pt-4">
            <Button variant="secondary" onClick={() => setShowItemModal(false)}>Cancel</Button>
            <Button onClick={handleSaveItem} className="bg-[#a87fff] hover:bg-[#976aff] text-white">Save Item</Button>
          </div>
        </div>
      </Modal>

      <ImageLibraryModal
        open={showCategoryImageLib}
        onClose={() => setShowCategoryImageLib(false)}
        selectedUrl={categoryFormData.image}
        defaultQuery={categoryFormData.name || 'food category'}
        onSelect={(url) => setCategoryFormData((prev) => ({ ...prev, image: url }))}
      />
    </div>
  );
}
