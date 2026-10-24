import { useQuery } from '@tanstack/react-query';
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { 
  Search, Trash2, Edit, FileEdit, Upload, Filter, UtensilsCrossed, 
  GripVertical, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, 
  ArrowLeft, Plus, ChevronRight 
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { formatCurrency, resolveImageUrl } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';
import { SERVER_BASE_URL } from '@/lib/config';

export default function Menus() {
  const navigate = useNavigate();
  const [activeMenu, setActiveMenu] = useState<number | null>(null);

  // Search & Filter State
  const [menuSearch, setMenuSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [vegFilter, setVegFilter] = useState<'all' | 'veg' | 'non-veg'>('all');

  // Organize Menu Items State
  const [showOrganizeModal, setShowOrganizeModal] = useState(false);
  const [organizeItems, setOrganizeItems] = useState<any[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  // Delete Confirmation Modals State
  const [showDeleteMenuModal, setShowDeleteMenuModal] = useState(false);
  const [menuToDelete, setMenuToDelete] = useState<any>(null);
  const [deletingMenuLoader, setDeletingMenuLoader] = useState(false);

  const [showDeleteItemModal, setShowDeleteItemModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<any>(null);
  const [deletingItemLoader, setDeletingItemLoader] = useState(false);

  // Menu Modal State
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [editingMenu, setEditingMenu] = useState<any>(null);
  const [menuFormData, setMenuFormData] = useState({ name: '', description: '', isActive: true });

  // Menu Item Modal State
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [itemFormData, setItemFormData] = useState({
    name: '', description: '', price: '', categoryId: '', isVeg: true, image: '', isAvailable: true, showOnCustomerSite: true, preparationTime: '', stockWarningThreshold: ''
  });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const bulkFileRef = useRef<HTMLInputElement>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const SERVER_URL = SERVER_BASE_URL;

  // Assign Table Modal State
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignData, setAssignData] = useState({ tableId: '', menuId: '', isActive: true });

  // Queries
  const { data: menus, isLoading: isLoadingMenus, refetch: refetchMenus } = useQuery({
    queryKey: ['menus'],
    queryFn: () => api.get('/restaurant/menus').then((r) => (r.data.data || []).sort((a: any, b: any) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name))),
  });

  const { data: menuItems, refetch: refetchItems } = useQuery({
    queryKey: ['menu-items', 'kot-only'],
    queryFn: () => api.get('/restaurant/menu-items?isKOT=true').then((r) => (r.data.data || []).sort((a: any, b: any) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name))),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/restaurant/item-categories').then((r) => r.data.data),
  });

  const { data: tables } = useQuery({
    queryKey: ['tables'],
    queryFn: () => api.get('/restaurant/tables').then((r) => r.data.data),
  });



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

  const handleDeleteMenu = (menu: any) => {
    setMenuToDelete(menu);
    setShowDeleteMenuModal(true);
  };

  const handleDeleteMenuConfirm = async () => {
    if (!menuToDelete) return;
    setDeletingMenuLoader(true);
    const toastId = toast.loading('Deleting menu...');
    try {
      const res = await api.delete(`/restaurant/menus/${menuToDelete.id}`);
      toast.success(res.data?.message || 'Menu deleted successfully!', { id: toastId });
      setShowDeleteMenuModal(false);
      setMenuToDelete(null);
      if (activeMenu === menuToDelete.id) {
        setActiveMenu(null);
      }
      refetchMenus();
    } catch (err: any) {
      const errMsg = err.response?.data?.error || 'Failed to delete menu';
      toast.error(errMsg, { id: toastId });
    } finally {
      setDeletingMenuLoader(false);
    }
  };

  // ==== MENU ITEM OPERATIONS ====
  const openAddItem = () => {
    navigate(`/admin/menu/items?action=add${activeMenu ? `&menuId=${activeMenu}` : ''}`, {
      state: { openAdd: true, menuId: activeMenu }
    });
  };

  const openEditItem = (item: any) => {
    setEditingItem(item);
    setItemFormData({
      name: item.name, description: item.description || '', price: item.price,
      categoryId: item.categoryId || '', isVeg: item.isVeg, image: item.image || '',
      isAvailable: item.isAvailable, showOnCustomerSite: item.showOnCustomerSite,
      preparationTime: item.preparationTime?.toString() || '',
      stockWarningThreshold: typeof item.stockWarningThreshold !== 'undefined' && item.stockWarningThreshold !== null ? String(item.stockWarningThreshold) : ''
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
      const payload: any = {
         ...itemFormData,
         price: Number(itemFormData.price),
         categoryId: itemFormData.categoryId ? Number(itemFormData.categoryId) : null,
         preparationTime: itemFormData.preparationTime ? Number(itemFormData.preparationTime) : null,
         menuId: activeMenu
      };
      if (itemFormData.stockWarningThreshold !== undefined && itemFormData.stockWarningThreshold !== '') {
        payload.stockWarningThreshold = Number(itemFormData.stockWarningThreshold);
      }
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

  const handleDeleteItem = (item: any) => {
    setItemToDelete(item);
    setShowDeleteItemModal(true);
  };

  const handleDeleteItemConfirm = async () => {
    if (!itemToDelete) return;
    setDeletingItemLoader(true);
    const toastId = toast.loading('Deleting menu item...');
    try {
      const res = await api.delete(`/restaurant/menu-items/${itemToDelete.id}`);
      toast.success(res.data?.message || 'Item deleted successfully!', { id: toastId });
      setShowDeleteItemModal(false);
      setItemToDelete(null);
      refetchItems();
    } catch (err: any) {
      const errMsg = err.response?.data?.error || 'Failed to delete item';
      toast.error(errMsg, { id: toastId });
    } finally {
      setDeletingItemLoader(false);
    }
  };

  const handleToggleItemStatus = async (item: any, field: string, value: boolean) => {
    try {
      await api.put(`/restaurant/menu-items/${item.id}`, { [field]: value });
      toast.success('Status updated');
      refetchItems();
    } catch(e) { toast.error('Failed to update'); }
  };

  // ==== ORGANIZE / REORDER MENU ITEMS ====
  const openOrganizeModal = () => {
    if (!selectedMenuData) return;
    const items = [...displayItems].sort((a: any, b: any) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
    setOrganizeItems(items);
    setShowOrganizeModal(true);
  };

  const moveFirst = (index: number) => {
    const itemsCopy = [...organizeItems];
    const [item] = itemsCopy.splice(index, 1);
    itemsCopy.unshift(item);
    setOrganizeItems(itemsCopy);
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const itemsCopy = [...organizeItems];
    const temp = itemsCopy[index - 1];
    itemsCopy[index - 1] = itemsCopy[index];
    itemsCopy[index] = temp;
    setOrganizeItems(itemsCopy);
  };

  const moveDown = (index: number) => {
    if (index === organizeItems.length - 1) return;
    const itemsCopy = [...organizeItems];
    const temp = itemsCopy[index + 1];
    itemsCopy[index + 1] = itemsCopy[index];
    itemsCopy[index] = temp;
    setOrganizeItems(itemsCopy);
  };

  const moveLast = (index: number) => {
    const itemsCopy = [...organizeItems];
    const [item] = itemsCopy.splice(index, 1);
    itemsCopy.push(item);
    setOrganizeItems(itemsCopy);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
  };

  const handleDrop = (index: number) => {
    if (draggedIndex === null) return;
    const itemsCopy = [...organizeItems];
    const draggedItem = itemsCopy[draggedIndex];
    itemsCopy.splice(draggedIndex, 1);
    itemsCopy.splice(index, 0, draggedItem);
    setOrganizeItems(itemsCopy);
    setDraggedIndex(null);
  };

  const handleSaveOrder = async () => {
    setSavingOrder(true);
    const toastId = toast.loading('Saving menu item order...');
    try {
      await Promise.all(
        organizeItems.map((item, index) => 
          api.put(`/restaurant/menu-items/${item.id}`, { sortOrder: index })
        )
      );
      toast.success('Menu items organized successfully!', { id: toastId });
      setShowOrganizeModal(false);
      refetchItems();
    } catch (err: any) {
      toast.error('Failed to save menu order', { id: toastId });
    } finally {
      setSavingOrder(false);
    }
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

  // Filter Menus for main overview grid
  const filteredMenus = (menus || []).filter((m: any) => {
    if (!menuSearch) return true;
    const q = menuSearch.toLowerCase();
    return m.name?.toLowerCase().includes(q) || m.description?.toLowerCase().includes(q);
  });

  // Filter Items when inside a menu
  const displayItems = menuItems?.filter((item: any) => {
    if (item.menuId !== activeMenu) return false;
    const category = item.category;
    let isKOT = true;
    if (category) {
      if (category.group && typeof category.group.isKOTEnabled === 'boolean') {
        isKOT = Boolean(category.group.isKOTEnabled);
      } else if (typeof category.isKOTEnabled === 'boolean') {
        isKOT = Boolean(category.isKOTEnabled);
      }
    }
    if (!isKOT) return false;

    if (itemSearch) {
      const q = itemSearch.toLowerCase();
      const matchesName = item.name?.toLowerCase().includes(q);
      const matchesDesc = item.description?.toLowerCase().includes(q);
      if (!matchesName && !matchesDesc) return false;
    }

    if (categoryFilter !== 'all') {
      if (String(item.categoryId) !== String(categoryFilter)) return false;
    }

    if (vegFilter === 'veg' && !item.isVeg) return false;
    if (vegFilter === 'non-veg' && item.isVeg) return false;

    return true;
  }) || [];

  // ---- Bulk upload helpers ----
  const downloadTemplate = () => {
    const header = ['name','description','price','menu','category','isVeg','isAvailable','preparationTime','image','productQR','inventoryItemId','showOnCustomerSite','isAutoImage'];
    const sample = ['Paneer Tikka','Delicious paneer','199','Main Menu','Starters','true','true','10','','','', 'true','true'];
    const csv = header.join(',') + '\n' + sample.map(s => `"${String(s).replace(/"/g, '""')}"`).join(',') + '\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'menu-items-template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const splitCSV = (line: string) => {
    const out: string[] = []; let cur = ''; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { out.push(cur); cur = ''; }
      else { cur += ch; }
    }
    out.push(cur);
    return out.map(s => s.trim().replace(/^"|"$/g, ''));
  };

  const parseCsv = (text: string) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length === 0) return [];
    const header = splitCSV(lines[0]).map(h => String(h || '').trim().toLowerCase());
    const rows: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = splitCSV(lines[i]);
      if (values.every(v => v === '')) continue;
      const obj: any = {};
      for (let j = 0; j < header.length; j++) obj[header[j]] = values[j] ?? '';
      rows.push(obj);
    }
    return rows;
  };

  const processBulkRows = async (rows: any[]) => {
    let created = 0; let failed = 0;
    for (const r of rows) {
      try {
        const payload: any = {
          name: r.name || r['item name'] || r.title || '',
          description: r.description || '',
          price: r.price ? Number(r.price) : 0,
          isVeg: typeof r.isveg !== 'undefined' ? String(r.isveg).toLowerCase() === 'true' : true,
          isAvailable: typeof r.isavailable !== 'undefined' ? String(r.isavailable).toLowerCase() === 'true' : true,
          preparationTime: r.preparationtime ? Number(r.preparationtime) : undefined,
          image: r.image || undefined,
          productQR: r.productqr || undefined,
          isAutoImage: typeof r.isautoimage !== 'undefined' ? String(r.isautoimage).toLowerCase() === 'true' : true,
        };
        if (r.menu) {
          const found = menus?.find((m: any) => String(m.name || '').toLowerCase() === String(r.menu || '').toLowerCase());
          if (found) payload.menuId = found.id;
        }
        if (r.category) {
          const foundCat = categories?.find((c: any) => String(c.name || '').toLowerCase() === String(r.category || '').toLowerCase());
          if (foundCat) payload.categoryId = foundCat.id;
        }
        await api.post('/restaurant/menu-items', payload);
        created++;
      } catch (err) { failed++; console.error('Bulk row failed', r, err); }
    }
    toast.success(`Bulk upload finished: ${created} created, ${failed} failed`);
    refetchItems();
  };

  

  const handleBulkFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkUploading(true);
    try {
      const name = (file.name || '').toLowerCase();
      if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        try {
          const buffer = await file.arrayBuffer();
          const runtimeImport = (pkg: string) => new Function('pkg', 'return import(pkg)')(pkg);

          // Try SheetJS (xlsx) first — browser-friendly
          try {
            const imp = await runtimeImport('xlsx');
            const XLSX = (imp && (imp as any).default) ? (imp as any).default : imp;
            const data = new Uint8Array(buffer);
            const wb = XLSX.read(data, { type: 'array' });
            const sheetName = wb.SheetNames[0];
            if (!sheetName) throw new Error('No worksheet found');
            const ws = wb.Sheets[sheetName];
            const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[];
            if (!matrix || matrix.length === 0) throw new Error('Worksheet is empty');
            const header = (matrix[0] as any[]).map((h: any) => String(h || '').trim().toLowerCase());
            const rowsFromSheet: any[] = [];
            for (let r = 1; r < matrix.length; r++) {
              const vals = matrix[r] as any[];
              if (vals.every((v: any) => v === '')) continue;
              const obj: any = {};
              for (let c = 0; c < header.length; c++) obj[header[c]] = vals[c] ?? '';
              rowsFromSheet.push(obj);
            }
            await processBulkRows(rowsFromSheet);
            return;
          } catch (e) {
            // fallthrough to try exceljs if xlsx not available
          }

          // Try exceljs as fallback
          try {
            const imp2 = await runtimeImport('exceljs');
            const ExcelJS = (imp2 && (imp2 as any).default) ? (imp2 as any).default : imp2;
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(buffer as any);
            const worksheet = workbook.worksheets[0];
            if (!worksheet) throw new Error('No worksheet found');
            const headerRow = worksheet.getRow(1);
            const header = (headerRow.values || []).slice(1).map((v: any) => String(v || '').trim().toLowerCase());
            const rowsFromSheet: any[] = [];
            worksheet.eachRow({ includeEmpty: false }, (row: any, rowNumber: number) => {
              if (rowNumber === 1) return;
              const vals = (row.values || []).slice(1);
              const obj: any = {};
              for (let i = 0; i < header.length; i++) obj[header[i]] = vals[i] ?? '';
              rowsFromSheet.push(obj);
            });
            await processBulkRows(rowsFromSheet);
            return;
          } catch (err) {
            toast.error('Excel parsing requires a client-side parser. Install `xlsx` (recommended) or `exceljs` and restart dev: `pnpm add -w xlsx`');
          }
        } catch (err: any) {
          toast.error('Failed to parse Excel file: ' + (err?.message || String(err)));
        }
      } else {
        const text = await file.text();
        const rows = parseCsv(text);
        await processBulkRows(rows);
      }
    } finally {
      setBulkUploading(false);
      if (bulkFileRef.current) bulkFileRef.current.value = '';
      setShowBulkModal(false);
    }
  };  return (
    <div className="space-y-6 animate-in">
      
      {/* ======================================================== */}
      {/* VIEW 1: MENUS OVERVIEW (WHEN NO ACTIVE MENU IS SELECTED)  */}
      {/* ======================================================== */}
      {activeMenu === null ? (
        <div className="space-y-6">
          {/* Top Bar Header */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Menus</h1>
              <p className="text-xs text-text-muted mt-1">Select a menu to view and manage its items, or create new menus.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" className="bg-bg-tertiary border-border hover:bg-bg-hover text-sm" onClick={() => setShowAssignModal(true)}>
                Assign Menu to Table
              </Button>
              <Button className="bg-[#a87fff] hover:bg-[#976aff] text-white flex items-center gap-2" onClick={openAddMenu}>
                <Plus className="w-4 h-4" /> Add Menu
              </Button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input 
              value={menuSearch}
              onChange={(e) => setMenuSearch(e.target.value)}
              className="w-full bg-bg-secondary border border-border/50 text-text-primary pl-11 h-12 rounded-xl focus:border-[#a87fff]/50 outline-none transition-all placeholder:text-text-muted" 
              placeholder="Search menus by name..." 
            />
          </div>

          {/* Menus List Grid */}
          {isLoadingMenus ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-2xl" />
              ))}
            </div>
          ) : filteredMenus.length === 0 ? (
            <Card className="text-center py-16 border-dashed border-2 border-border/60">
              <UtensilsCrossed className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-60" />
              <h3 className="text-lg font-semibold text-text-primary mb-1">
                {menuSearch ? 'No matching menus found' : 'No menus created yet'}
              </h3>
              <p className="text-sm text-text-muted mb-6">
                {menuSearch ? 'Try a different search term.' : 'Get started by creating your first restaurant menu!'}
              </p>
              <Button onClick={openAddMenu} className="bg-[#a87fff] hover:bg-[#976aff] text-white">
                <Plus className="w-4 h-4 mr-2 inline" /> Create Menu
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredMenus.map((menu: any) => {
                const itemCount = menu._count?.menuItems || 0;
                return (
                  <div 
                    key={menu.id}
                    onClick={() => setActiveMenu(menu.id)}
                    className="group relative bg-bg-secondary border border-border/50 hover:border-[#a87fff]/60 rounded-2xl p-6 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-xl hover:-translate-y-1 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-12 h-12 rounded-xl bg-[#a87fff]/15 text-[#a87fff] flex items-center justify-center group-hover:bg-[#a87fff] group-hover:text-white transition-colors">
                          <FileEdit className="w-6 h-6" />
                        </div>
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button 
                            onClick={() => openEditMenu(menu)}
                            title="Edit Menu"
                            className="p-2 border border-border/50 text-text-muted hover:text-text-primary hover:bg-bg-tertiary rounded-lg transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteMenu(menu)}
                            title="Delete Menu"
                            className="p-2 border border-danger/30 text-danger hover:bg-danger/10 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <h3 className="text-lg font-bold text-text-primary group-hover:text-[#a87fff] transition-colors line-clamp-1">
                        {menu.name}
                      </h3>
                      
                      {menu.description && (
                        <p className="text-xs text-text-muted mt-1 line-clamp-2">
                          {menu.description}
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

              {/* Add New Menu Card Shortcut */}
              <div 
                onClick={openAddMenu}
                className="group border-2 border-dashed border-border/60 hover:border-[#a87fff]/60 rounded-2xl p-6 transition-all duration-200 cursor-pointer flex flex-col items-center justify-center text-center min-h-[200px] hover:bg-[#a87fff]/5"
              >
                <div className="w-12 h-12 rounded-full bg-bg-tertiary group-hover:bg-[#a87fff] text-text-muted group-hover:text-white flex items-center justify-center mb-3 transition-colors">
                  <Plus className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-text-primary group-hover:text-[#a87fff] transition-colors">Add New Menu</h4>
                <p className="text-xs text-text-muted mt-1">Create a new category for your menu items</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ======================================================== */
        /* VIEW 2: INSIDE MENU VIEW (ITEMS INSIDE SELECTED MENU)    */
        /* ======================================================== */
        <div className="space-y-6">
          
          {/* Inside Menu Breadcrumb & Back Header */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between border-b border-border/50 pb-5">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setActiveMenu(null)}
                className="p-2.5 rounded-xl border border-border/50 bg-bg-secondary hover:bg-bg-tertiary text-text-primary transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Menus
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">Menus</span>
                  <span className="text-xs text-text-muted">/</span>
                  <span className="text-xs font-semibold text-[#a87fff]">{selectedMenuData?.name}</span>
                </div>
                <h1 className="text-2xl font-bold text-text-primary mt-0.5">{selectedMenuData?.name}</h1>
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <Button variant="secondary" size="sm" icon={<Edit className="w-3.5 h-3.5"/>} onClick={() => openEditMenu(selectedMenuData)}>
                Update Menu
              </Button>
              <Button variant="secondary" size="sm" className="bg-bg-tertiary border-border hover:bg-bg-hover" onClick={openOrganizeModal}>
                Organize Order
              </Button>
              <Button size="sm" className="bg-[#a87fff] hover:bg-[#976aff] text-white" icon={<Plus className="w-4 h-4"/>} onClick={openAddItem}>
                Add Menu Item
              </Button>
              <button 
                onClick={() => handleDeleteMenu(selectedMenuData)} 
                className="p-2 border border-danger/40 text-danger rounded-lg hover:bg-danger/10 transition-colors"
                title="Delete Menu"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Item Search & Filter Bar */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-bg-secondary p-4 rounded-xl border border-border/50">
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input 
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  className="w-full bg-bg-tertiary border border-border/50 text-text-primary pl-9 h-10 rounded-lg text-sm focus:border-[#a87fff]/50 outline-none" 
                  placeholder={`Search items in ${selectedMenuData?.name}...`} 
                />
              </div>

              {/* Category Filter Dropdown */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full sm:w-48 bg-bg-tertiary border border-border/50 text-text-primary px-3 h-10 rounded-lg text-sm outline-none focus:border-[#a87fff]/50"
              >
                <option value="all">All Categories</option>
                {categories?.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

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
              Showing <span className="text-text-primary font-bold">{displayItems.length}</span> item(s) inside <span className="text-[#a87fff] font-bold">{selectedMenuData?.name}</span>
            </div>
          </div>

          {/* Menu Items Table */}
          <Card padding={false} className="border-border/50 overflow-hidden shadow-xl">
            {displayItems.length === 0 ? (
              <div className="text-center py-16 px-4">
                <UtensilsCrossed className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-50" />
                <h3 className="text-base font-semibold text-text-primary mb-1">No items found in this menu</h3>
                <p className="text-xs text-text-muted mb-4">
                  {itemSearch || categoryFilter !== 'all' || vegFilter !== 'all'
                    ? 'No items match your selected filter criteria.'
                    : `Get started by adding items to ${selectedMenuData?.name}.`}
                </p>
                <Button size="sm" onClick={openAddItem} className="bg-[#a87fff] hover:bg-[#976aff] text-white">
                  <Plus className="w-4 h-4 mr-1.5 inline" /> Add Menu Item
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar scroll-smooth">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="bg-bg-tertiary/30 border-b border-border text-left">
                      <th className="py-4 px-6 font-semibold text-xs tracking-wider text-text-muted uppercase">Item Name</th>
                      <th className="py-4 px-6 font-semibold text-xs tracking-wider text-text-muted uppercase text-center">Price</th>
                      <th className="py-4 px-6 font-semibold text-xs tracking-wider text-text-muted uppercase">Category</th>
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
                            <Button variant="secondary" size="sm" className="bg-bg-tertiary text-text-secondary text-xs px-2.5 py-1.5 min-h-0 h-auto" onClick={() => openEditItem(item)} icon={<Edit className="w-3.5 h-3.5"/>}>
                              Update
                            </Button>
                            <button onClick={() => handleDeleteItem(item)} className="p-1.5 border border-danger/50 text-danger rounded hover:bg-danger/10 transition-colors">
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

      {/* BULK UPLOAD MODAL */}
      <Modal open={showBulkModal} onClose={() => setShowBulkModal(false)} title={"Bulk Upload Menu Items"}>
        <div className="space-y-4">
          <p className="text-sm text-text-muted">Download the template, fill rows (one item per row) and upload a CSV or XLSX file. Columns: name, description, price, menu, category, isVeg, isAvailable, preparationTime, image, productQR, inventoryItemId, showOnCustomerSite, isAutoImage</p>
          <div className="flex gap-3">
            <Button onClick={() => downloadTemplate()} className="bg-bg-secondary">Download Template</Button>
            <Button variant="secondary" onClick={() => bulkFileRef.current?.click()} className="bg-bg-secondary">Choose File</Button>
            <input type="file" ref={bulkFileRef} className="hidden" accept=".csv,.xlsx,.xls" onChange={handleBulkFileChange} />
          </div>
          {bulkUploading && <div className="text-sm text-text-muted">Processing upload...</div>}
          <div className="flex justify-end gap-3 mt-4 border-t border-border/50 pt-4">
            <Button variant="secondary" onClick={() => setShowBulkModal(false)}>Cancel</Button>
            <Button onClick={() => bulkFileRef.current?.click()} className="bg-[#a87fff] hover:bg-[#976aff] text-white">Upload File</Button>
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
                     <img src={resolveImageUrl(itemFormData.image) || `${SERVER_URL}${itemFormData.image}`} alt="Preview" className="w-full h-full object-cover" />
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

      {/* ORGANIZE MENU ITEMS MODAL */}
      <Modal open={showOrganizeModal} onClose={() => setShowOrganizeModal(false)} title={`Organize Menu Items — ${selectedMenuData?.name}`} size="lg">
        <div className="space-y-4">
          <p className="text-xs text-text-muted">
            Drag and drop the items to reorder them, or use the quick buttons next to each item to move them Up, Down, to the First (top), or to the Last (bottom) position.
          </p>
          
          <div className="border border-border rounded-xl bg-bg-secondary divide-y divide-border overflow-hidden max-h-[450px] overflow-y-auto custom-scrollbar">
            {organizeItems.length === 0 ? (
              <div className="p-8 text-center text-text-muted">No items in this menu.</div>
            ) : (
              organizeItems.map((item: any, index: number) => (
                <div 
                  key={item.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={() => handleDrop(index)}
                  className={`flex items-center justify-between p-3 transition-colors hover:bg-bg-hover cursor-move ${draggedIndex === index ? 'opacity-40 bg-bg-tertiary' : ''}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <GripVertical className="w-4 h-4 text-text-muted flex-shrink-0 cursor-grab active:cursor-grabbing" />
                    <img 
                      src={resolveImageUrl(item.image) || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=1a1a2e&color=fff&size=50`} 
                      alt={item.name} 
                      className="w-8 h-8 rounded object-cover flex-shrink-0 border border-border/50"
                    />
                    <div className="min-w-0">
                      <span className="font-semibold text-text-primary text-sm truncate block">{item.name}</span>
                      <span className="text-xs text-text-muted block">{item.category?.name || 'Uncategorized'}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => moveFirst(index)}
                      title="Move to First"
                      className="p-1.5 border border-border text-text-secondary rounded hover:bg-bg-hover hover:text-text-primary transition-all bg-bg-tertiary"
                    >
                      <ChevronsUp className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => moveUp(index)}
                      title="Move Up"
                      disabled={index === 0}
                      className="p-1.5 border border-border text-text-secondary rounded hover:bg-bg-hover hover:text-text-primary transition-all bg-bg-tertiary disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => moveDown(index)}
                      title="Move Down"
                      disabled={index === organizeItems.length - 1}
                      className="p-1.5 border border-border text-text-secondary rounded hover:bg-bg-hover hover:text-text-primary transition-all bg-bg-tertiary disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => moveLast(index)}
                      title="Move to Last"
                      className="p-1.5 border border-border text-text-secondary rounded hover:bg-bg-hover hover:text-text-primary transition-all bg-bg-tertiary"
                    >
                      <ChevronsDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          
          <div className="flex justify-end gap-3 mt-4 border-t border-border pt-4">
            <Button variant="secondary" onClick={() => setShowOrganizeModal(false)}>Cancel</Button>
            <Button onClick={handleSaveOrder} disabled={savingOrder} className="bg-[#a87fff] hover:bg-[#976aff] text-white">
              {savingOrder ? 'Saving...' : 'Save Order'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* DELETE MENU CONFIRMATION MODAL */}
      <Modal open={showDeleteMenuModal} onClose={() => setShowDeleteMenuModal(false)} title="Delete Menu">
        <div className="space-y-4">
          <p className="text-sm text-text-primary">
            Are you sure you want to delete the menu <span className="font-semibold text-danger">{menuToDelete?.name}</span>?
          </p>
          <p className="text-xs text-text-muted">
            If this menu contains items that have been ordered in historical transactions or KOTs, the system will automatically deactivate and hide it instead to preserve sales history.
          </p>
          <div className="flex justify-end gap-3 mt-6 border-t border-border/50 pt-4">
            <Button variant="secondary" onClick={() => setShowDeleteMenuModal(false)}>Cancel</Button>
            <Button 
              onClick={handleDeleteMenuConfirm} 
              disabled={deletingMenuLoader} 
              className="bg-danger hover:bg-danger/80 text-white font-semibold"
            >
              {deletingMenuLoader ? 'Deleting...' : 'Delete Menu'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* DELETE MENU ITEM CONFIRMATION MODAL */}
      <Modal open={showDeleteItemModal} onClose={() => setShowDeleteItemModal(false)} title="Delete Menu Item">
        <div className="space-y-4">
          <p className="text-sm text-text-primary">
            Are you sure you want to delete <span className="font-semibold text-danger">{itemToDelete?.name}</span>?
          </p>
          <p className="text-xs text-text-muted">
            Note: If this item has been ordered, it cannot be hard deleted because of sales transaction tracking. Instead, you can mark it as unavailable/hidden to remove it from customer views.
          </p>
          <div className="flex justify-end gap-3 mt-6 border-t border-border/50 pt-4">
            <Button variant="secondary" onClick={() => setShowDeleteItemModal(false)}>Cancel</Button>
            <Button 
              onClick={handleDeleteItemConfirm} 
              disabled={deletingItemLoader} 
              className="bg-danger hover:bg-danger/80 text-white font-semibold"
            >
              {deletingItemLoader ? 'Deleting...' : 'Delete Item'}
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
