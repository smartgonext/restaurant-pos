import { useQuery } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Plus, Search, Circle, Edit, Trash2, Eye, EyeOff, Clock, Upload, X, QrCode, Sparkles, Layers, Info } from 'lucide-react';
import { formatCurrency, cn, resolveImageUrl } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import ImageLibraryModal from '@/components/ImageLibraryModal';
import BulkImageAIModal from '@/components/BulkImageAIModal';
import { SERVER_BASE_URL } from '@/lib/config';

const SERVER_URL = SERVER_BASE_URL;

type PackOptionForm = {
  label: string;
  quantity: string;
  unitId: number | null;
  unitLabel: string;
  mrp: string;
  purchaseRate: string;
  profitPercent: string;
  sellingPrice: string;
  stockWarningThreshold: string;
  productQR: string;
};

const normalizePackOptions = (input: any): Array<PackOptionForm> => {
  if (!Array.isArray(input)) return [];
  return input
    .map((p: any) => ({
      label: String(p?.label ?? '').trim(),
      quantity: String(p?.quantity ?? '1').trim(),
      unitId: p?.unitId != null && Number.isFinite(Number(p.unitId)) ? Number(p.unitId) : null,
      unitLabel: String(p?.unitLabel ?? '').trim(),
      mrp: String(p?.mrp ?? '').trim(),
      purchaseRate: String(p?.purchaseRate ?? '').trim(),
      profitPercent: String(p?.profitPercent ?? '').trim(),
      sellingPrice: String((p?.sellingPrice ?? p?.price) ?? '').trim(),
      stockWarningThreshold: String(p?.stockWarningThreshold ?? '').trim(),
      productQR: String(p?.productQR ?? '').trim(),
    }))
    .filter((p) => p.label.length > 0);
};

export default function MenuItems() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [kotFilter, setKotFilter] = useState<'all'|'kot'|'non'>('all');
  const [formData, setFormData] = useState({
    name: '', description: '', price: '', menuId: 0, categoryId: 0,
    isVeg: true, isAvailable: true, preparationTime: '', image: '',
    productQR: '', isAutoImage: true,
    imageSource: 'manual' as 'manual' | 'ai' | 'library',
    salesUnit: 'piece',
    taxType: 'external',
    taxPercent: '5',
    enablePackOptions: false,
    stockWarningThreshold: '',
    expiryDate: ''
  });
  const [packOptions, setPackOptions] = useState<Array<PackOptionForm>>([]);
  
  const [uploading, setUploading] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showBulkAIModal, setShowBulkAIModal] = useState(false);
  const [singleAIResult, setSingleAIResult] = useState<any | null>(null);
  const [bulkTemplate, setBulkTemplate] = useState<'kot'|'non-kot'>('non-kot');
  const bulkFileRef = useRef<HTMLInputElement>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<any | null>(null);
  const [showLibModal, setShowLibModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [modifierGroups, setModifierGroups] = useState<any[]>([]);
  const [selectedModifier, setSelectedModifier] = useState('');
  const [linking, setLinking] = useState(false);
  
  // On page load, ensure filter is set to 'all' to show all items by default
  useEffect(() => {
    setKotFilter('all');
  }, []);
  
  // Fetch modifier groups for dropdown
  useEffect(() => {
    api.get('/restaurant/modifier-groups').then(res => setModifierGroups(res.data.data || []));
  }, []);

  // Check URL query param or route state to auto-open "Add New Item" modal
  useEffect(() => {
    const action = searchParams.get('action');
    const qMenuId = searchParams.get('menuId');
    const qCategoryId = searchParams.get('categoryId');
    const stateOpen = (location.state as any)?.openAdd;
    const stateMenuId = (location.state as any)?.menuId;
    const stateCatId = (location.state as any)?.categoryId;

    if (action === 'add' || stateOpen) {
      const targetMenuId = qMenuId ? Number(qMenuId) : (stateMenuId ? Number(stateMenuId) : undefined);
      const targetCatId = qCategoryId ? Number(qCategoryId) : (stateCatId ? Number(stateCatId) : undefined);

      handleOpenModal(null, {
        menuId: targetMenuId,
        categoryId: targetCatId,
      });

      // Clear search param so it doesn't re-trigger when user closes the modal
      if (action === 'add') {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('action');
        nextParams.delete('menuId');
        nextParams.delete('categoryId');
        setSearchParams(nextParams, { replace: true });
      }
    }
  }, [searchParams, location.state]);

  const { data: items = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ['menu-items', search, kotFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (kotFilter === 'kot') params.set('isKOT', 'true');
      else if (kotFilter === 'non') params.set('isKOT', 'false');
      const qs = params.toString();
      return api.get(`/restaurant/menu-items${qs ? `?${qs}` : ''}`).then((r) => r.data.data);
    },
  });

  const { data: menus } = useQuery({
    queryKey: ['menus-list'],
    queryFn: () => api.get('/restaurant/menus').then((r) => r.data.data),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories-list'],
    queryFn: () => api.get('/restaurant/item-categories').then((r) => r.data.data),
  });

  // Inventory resources for non-food products
  const { data: invUnits = [] } = useQuery({ queryKey: ['inventory-units'], queryFn: () => api.get('/restaurant/inventory/units').then(r => r.data.data) });
  const { data: invItems = [] } = useQuery({ queryKey: ['inventory-items'], queryFn: () => api.get('/restaurant/inventory/items').then(r => r.data.data) });
  const [invUnitId, setInvUnitId] = useState<number | null>(null);
  const [mrp, setMrp] = useState<string>('');
  const [purchaseRate, setPurchaseRate] = useState<string>('');
  const [profitPercent, setProfitPercent] = useState<string>('');

  const isKgUnitText = (unitText: string) => {
    const t = String(unitText || '').toLowerCase();
    return t.includes('kg') || t.includes('kilogram');
  };

  const getMainPackSeed = (): PackOptionForm => {
    const selectedUnit = invUnits?.find((u: any) => Number(u.id) === Number(invUnitId));
    const sales = Number(formData.price || 0);
    return {
      label: 'Main',
      quantity: '1',
      unitId: selectedUnit?.id ?? invUnitId ?? null,
      unitLabel: selectedUnit ? `${selectedUnit.name} (${selectedUnit.symbol})` : '',
      mrp: String(mrp || ''),
      purchaseRate: String(purchaseRate || ''),
      profitPercent: String(profitPercent || ''),
      sellingPrice: Number.isFinite(sales) && sales > 0 ? String(sales) : '',
      stockWarningThreshold: String(formData.stockWarningThreshold || ''),
      productQR: String(formData.productQR || '').trim(),
    };
  };

  const generateProductQR = () => {
    return `PRD-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000000).toString(36)}`;
  };

  const isCategoryKOTEnabled = (category: any) => {
    if (!category) return true;
    if (category.group && typeof category.group.isKOTEnabled === 'boolean') {
      return Boolean(category.group.isKOTEnabled);
    }
    return Boolean(category.isKOTEnabled);
  };

  const addPackVariantFromMain = () => {
    setPackOptions((prev) => {
      const base = prev[0] ?? getMainPackSeed();
      const idx = prev.length;
      const baseQty = Number(base.quantity || 1) || 1;
      const isKgBase = isKgUnitText(base.unitLabel);
      const nextQty = isKgBase ? 0.5 : 1;
      const scale = isKgBase && baseQty > 0 ? nextQty / baseQty : 1;

      const nextMrp = Number(base.mrp || 0) > 0 ? (Number(base.mrp || 0) * scale) : 0;
      const nextPurchase = Number(base.purchaseRate || 0) > 0 ? (Number(base.purchaseRate || 0) * scale) : 0;
      const nextProfit = Number(base.profitPercent || 0);
      const derivedSelling = nextPurchase > 0
        ? Number((nextPurchase * (1 + nextProfit / 100)).toFixed(2))
        : (nextMrp > 0 ? Number(nextMrp.toFixed(2)) : Number(base.sellingPrice || 0));
      const baseQR = String(formData.productQR || '').trim();

      return [...prev, {
        label: `Pack ${idx}`,
        quantity: String(nextQty),
        unitId: base.unitId,
        unitLabel: base.unitLabel,
        mrp: nextMrp > 0 ? String(Number(nextMrp.toFixed(2))) : '',
        purchaseRate: nextPurchase > 0 ? String(Number(nextPurchase.toFixed(2))) : '',
        profitPercent: Number.isFinite(nextProfit) ? String(nextProfit) : '',
        sellingPrice: derivedSelling > 0 ? String(Number(derivedSelling.toFixed(2))) : '',
        stockWarningThreshold: String(base.stockWarningThreshold || ''),
        productQR: baseQR ? `${baseQR}-${idx}` : '',
      }];
    });
  };

  const handleOpenModal = (item: any = null, defaultOverrides: { menuId?: number; categoryId?: number } = {}) => {
    if (item) {
      const selectedMenuCat = categories?.find((c: any) => Number(c.id) === Number(item.categoryId));
      const isFoodCategory = selectedMenuCat ? isCategoryKOTEnabled(selectedMenuCat) : true;
      const matchedInv = ((item as any).inventoryItem ?? (!isFoodCategory ? invItems?.find((it: any) => (it.name || '').toLowerCase().trim() === (item.name || '').toLowerCase().trim()) : undefined));
      const latestMrp = matchedInv?.inventoryMRPs?.[0];

      setEditingItem(item);
      setFormData({
        name: item.name,
        description: item.description || '',
        // Prefer the item's saved selling price. Only fallback to latest MRP's sellingPrice/mrp
        // when item.price is not available. This keeps Selling Price and MRP independent.
        price: (item.price !== undefined && item.price !== null)
          ? String(item.price)
          : (latestMrp ? String(Number((latestMrp as any).sellingPrice ?? latestMrp.mrp ?? 0)) : ''),
        menuId: item.menuId || 0,
        categoryId: item.categoryId || 0,
        isVeg: item.isVeg,
        isAvailable: item.isAvailable,
        preparationTime: item.preparationTime?.toString() || '',
        image: item.image || '',
        productQR: item.productQR || '',
        isAutoImage: item.isAutoImage ?? true,
        imageSource: 'manual' as 'manual' | 'ai' | 'library',
        salesUnit: item.salesUnit || 'piece',
        taxType: String(item.taxType || 'external').toLowerCase(),
        taxPercent: typeof item.taxPercent !== 'undefined' && item.taxPercent !== null ? String(item.taxPercent) : '5',
        enablePackOptions: Boolean(item.enablePackOptions),
        stockWarningThreshold: typeof item.stockWarningThreshold !== 'undefined' && item.stockWarningThreshold !== null ? String(item.stockWarningThreshold) : '',
        expiryDate: item.expiryDate ? item.expiryDate.split('T')[0] : ''
      });
      setPackOptions(normalizePackOptions(item.packOptions));
      setInvUnitId(matchedInv?.unitId ?? invUnits?.[0]?.id ?? null);
      setMrp(!isFoodCategory && latestMrp ? String(Number(latestMrp.mrp ?? 0)) : '');
      setPurchaseRate(!isFoodCategory && latestMrp ? String(Number(latestMrp.purchaseRate ?? 0)) : '');
      setProfitPercent(!isFoodCategory && latestMrp ? String(Number(latestMrp.profitPercent ?? 0)) : '');
      setSelectedModifier('');
    } else {
      setEditingItem(null);
      setFormData({
        name: '', description: '', price: '',
        menuId: defaultOverrides.menuId ?? 0,
        categoryId: defaultOverrides.categoryId ?? 0,
        isVeg: true, isAvailable: true, preparationTime: '', image: '',
        productQR: '', isAutoImage: true,
        imageSource: 'manual' as 'manual' | 'ai' | 'library',
        salesUnit: 'piece',
        taxType: 'external',
        taxPercent: '5',
        enablePackOptions: false,
        stockWarningThreshold: '',
        expiryDate: ''
      });
      setPackOptions([]);
      setInvUnitId(invUnits?.[0]?.id ?? null);
      setMrp('');
      setPurchaseRate('');
      setProfitPercent('');
      setSelectedModifier('');
    }
    setShowModal(true);
  };
  // Link modifier group to item
  const handleLinkModifier = async () => {
    if (!editingItem || !selectedModifier) return;
    setLinking(true);
    try {
      const res = await api.post('/restaurant/item-modifiers/activate', {
        menuItemId: editingItem.id,
        modifierGroupId: selectedModifier
      });
      if (res.data?.success && res.data?.data) {
        setEditingItem(res.data.data);
      }
      toast.success('Modifier group linked!');
      setSelectedModifier('');
      refetch();
    } catch (err) {
      toast.error('Failed to link modifier');
    } finally {
      setLinking(false);
    }
  };

  // Unlink modifier group from item
  const handleUnlinkModifier = async (modifierGroupId: number) => {
    if (!editingItem) return;
    try {
      const res = await api.post('/restaurant/item-modifiers/deactivate', {
        menuItemId: editingItem.id,
        modifierGroupId
      });
      if (res.data?.success && res.data?.data) {
        setEditingItem(res.data.data);
      }
      toast.success('Modifier group unlinked!');
      refetch();
    } catch (err) {
      toast.error('Failed to unlink modifier');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const toastId = toast.loading('Uploading & Verifying with Gemini AI...');

    const uploadData = new FormData();
    uploadData.append('file', file);

    try {
      const res = await api.post('/restaurant/upload/verify-image', uploadData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setFormData(prev => ({ ...prev, image: res.data.url, isAutoImage: false, imageSource: 'manual' }));
      
      if (res.data.aiResult) {
        setSingleAIResult(res.data.aiResult);
        if (res.data.aiResult.isValid) {
          toast.success(`Gemini AI Verified: ${res.data.aiResult.detectedName} (${res.data.aiResult.confidence}%)`, { id: toastId });
        } else {
          toast.error(`Gemini AI Warning: ${res.data.aiResult.reason}`, { id: toastId });
        }
      } else {
        toast.success('Image uploaded!', { id: toastId });
      }
    } catch (err) {
      toast.error('Upload failed', { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  const handleAIGenerateImage = async () => {
    if (!formData.name) return toast.error('Enter item name first');
    
    setUploading(true);
    const toastId = toast.loading('Gemini AI is styling & generating your dish image...');
    try {
      const res = await api.post('/restaurant/generate-image', { 
        itemName: formData.name,
        itemDescription: formData.description || '',
        persist: true 
      });
      const imgUrl = res.data.imageUrl;
      if (imgUrl) {
         setFormData(prev => ({ ...prev, image: imgUrl, isAutoImage: true, imageSource: 'ai' }));
         if (res.data.aiResult?.isValid) {
           toast.success(`Gemini AI Dish Photo Created & Verified! (${res.data.aiResult.confidence}%)`, { id: toastId });
         } else {
           toast.success('Gemini AI Photo generated!', { id: toastId });
         }
      } else {
         throw new Error('Image generation failed');
      }
    } catch (err) {
      toast.error('Gemini AI Photo Generation failed', { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  const handleLibSelect = (url: string) => {
    setFormData(prev => ({ ...prev, image: url, isAutoImage: false, imageSource: 'library' }));
    // Keep the library modal open so the user can continue filling details.
    // Avoid showing a toast here to prevent interrupting the edit flow.
  };

  const downloadTemplate = (type: 'kot' | 'non-kot') => {
    const kotHeaders = [
      'SignatureName',
      'SellingPrice',
      'ChefNote',
      'ImageMode',
      'Image',
      'AssignedMenu',
      'Group',
      'Category',
      'KitchenPrepMin',
      'VegetarianOption',
      'InstantlyAvailable',
      'ModifierGroup',
      'ProductQR',
    ];
    const nonKotHeaders = [
      'ProductQR',
      'SignatureName',
      'MRP',
      'PurchaseRate',
      'ProfitPercent',
      'SellingPrice',
      'SalesUnit',
      'Category',
      'Group',
      'AssignedMenu',
      'StockWarn',
      'ExpiryDate',
      'TaxType',
      'TaxPercent',
      'EnablePackOptions',
      'PackVariants',
      'ImageMode',
    ];

    const rows = type === 'kot'
      ? [
          kotHeaders,
          ['Avocado Toast', '120', 'Sourdough with avocado mash', 'ai', '', 'General Menu', 'KOT', 'Main Course', '15', 'true', 'true', 'Spice Level', 'KOT-AVO-001'],
          ['Paneer Tikka', '180', 'Smoky tandoor flavors', 'lib', '', 'General Menu', 'KOT', 'Starters', '20', 'true', 'true', '', 'KOT-PAN-001'],
        ]
      : [
          nonKotHeaders,
          ['MU-001', 'Murukku', 60, 40, 25, { f: 'IF(D2>0,ROUND(D2*(1+E2/100),2),"")', v: 50 }, 'Kilogram (kg)', 'Snacks', 'Non KOT', 'General Menu', 4, '2026-12-31', 'external', 5, 'true', 'Main|1|Kilogram (kg)|MU-001|60|40|25|50|4;Mini|0.5|Kilogram (kg)|MU-001-MINI|35|25|20|30|2', 'ai'],
          ['BAK-001', 'Bakoda', 120, 80, { f: 'IF(AND(D3>0,F3>0),ROUND(((F3-D3)/D3)*100,2),"")', v: 25 }, 100, 'Piece (pc)', 'Snacks', 'Non KOT', 'General Menu', 6, '', 'external', 5, 'false', '', 'lib'],
        ];

    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = rows[0].map((h) => ({
      wch: h === 'PackVariants' ? 72 : (h === 'SignatureName' ? 28 : 16),
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, type === 'kot' ? 'KOT Items' : 'Non KOT Items');
    const filename = type === 'kot' ? 'kot-items-template.xlsx' : 'non-kot-items-template.xlsx';
    XLSX.writeFile(workbook, filename, { bookType: 'xlsx' });
  };

  const handleBulkFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkUploading(true);
    const toastId = toast.loading('Uploading bulk file...');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('template', bulkTemplate);
      const res = await api.post('/restaurant/menu-items/bulk-upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const summary = res?.data?.data || null;
      setBulkResult(summary);

      const created = Number(summary?.created || 0);
      const updated = Number(summary?.updated || 0);
      const errors = Number(summary?.errors?.length || 0);

      if (errors > 0) {
        if (created + updated === 0) {
          toast.error(`Bulk upload failed. Created: ${created}, Updated: ${updated}, Errors: ${errors}`, { id: toastId });
        } else {
          toast.success(`Bulk upload finished with warnings. Created: ${created}, Updated: ${updated}, Errors: ${errors}`, { id: toastId });
        }
      } else {
        toast.success(`Bulk upload finished. Created: ${created}, Updated: ${updated}`, { id: toastId });
      }

      if (created + updated > 0) {
        refetch();
        setShowBulkModal(false);
      }
    } catch (err: any) {
      const summary = err?.response?.data?.data || null;
      if (summary) {
        setBulkResult(summary);
      }
      toast.error(err?.response?.data?.error || 'Bulk upload failed', { id: toastId });
    } finally {
      setBulkUploading(false);
      if (bulkFileRef.current) bulkFileRef.current.value = '';
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

      // If image is chosen from LIB (Pexels URL), persist a local upload automatically on save.
      if (formData.imageSource === 'library' && finalImage && String(finalImage).startsWith('http')) {
        setUploading(true);
        const saveToast = toast.loading('Saving library image...');
        try {
          const filename = `${formData.name.replace(/\s+/g,'_').slice(0,30)||'lib'}-${Date.now()}`;
          const uploaded = await api.post('/restaurant/upload', { imageUrl: finalImage, filename });
          finalImage = uploaded.data.url;
          if (!String(finalImage).startsWith('/static/')) {
            throw new Error('Server did not return a local static image URL');
          }
          toast.success('Library image saved!', { id: saveToast });
        } catch (e) {
          toast.error('Could not save library image locally. Please retry.', { id: saveToast });
          return;
        } finally {
          setUploading(false);
        }
      }

      const payload: any = {
        ...formData,
        image: finalImage,
        isAutoImage: false,
        price: Number(formData.price),
        preparationTime: formData.preparationTime ? Number(formData.preparationTime) : null,
        menuId: showFoodFields ? (formData.menuId || undefined) : undefined,
        categoryId: formData.categoryId || undefined,
        expiryDate: formData.expiryDate ? new Date(formData.expiryDate).toISOString() : null,
      };

      // Ensure numeric stock warning if provided
      if (formData.stockWarningThreshold !== undefined && formData.stockWarningThreshold !== '') {
        payload.stockWarningThreshold = Number(formData.stockWarningThreshold);
      } else {
        payload.stockWarningThreshold = undefined;
      }

      // Determine whether the selected menu category is a KOT/food category
      const selectedMenuCat = categories?.find((c: any) => Number(c.id) === Number(formData.categoryId));
      const isFoodCategory = selectedMenuCat ? isCategoryKOTEnabled(selectedMenuCat) : true;
      const selectedInvUnit = invUnits?.find((u: any) => Number(u.id) === Number(invUnitId));

      // Basic validation: name & category
      if (!formData.name || !String(formData.name).trim()) {
        toast.error('Please enter an item name');
        return;
      }
      if (!formData.categoryId || Number(formData.categoryId) === 0) {
        toast.error('Please select a category');
        return;
      }

      // KOT items must have a valid selling price
      if (isFoodCategory) {
        const priceNum = Number(formData.price);
        if (!Number.isFinite(priceNum) || priceNum <= 0) {
          toast.error('Please enter a valid selling price for KOT items');
          return;
        }
      }

      // If non-food (inventory) item and barcode missing, auto-generate on submit
      if (showInventoryFields && (!payload.productQR || String(payload.productQR).trim() === '')) {
        const gen = generateProductQR();
        payload.productQR = gen;
        setFormData(prev => ({ ...prev, productQR: gen }));
      }

      // Keep a single unit source in UI: food uses Sales Unit, stock items use Inventory Unit.
      payload.salesUnit = isFoodCategory
        ? null
        : (selectedInvUnit?.symbol || selectedInvUnit?.name || 'piece');
      if (isFoodCategory) {
        payload.taxType = 'external';
        payload.taxPercent = 0;
      } else {
        payload.taxType = String(formData.taxType || '').toLowerCase();
        payload.taxPercent = Number(formData.taxPercent || 0);
        if (!['internal', 'external'].includes(payload.taxType)) {
          toast.error('Select Tax Type (Internal or External)');
          return;
        }
        if (!Number.isFinite(payload.taxPercent) || payload.taxPercent < 0 || payload.taxPercent > 100) {
          toast.error('Tax % must be between 0 and 100');
          return;
        }
      }
      payload.enablePackOptions = !isFoodCategory && Boolean(formData.enablePackOptions);
      if (payload.enablePackOptions) {
        let mainQR = String(formData.productQR || '').trim();
        if (!mainQR) {
          // Auto-generate a main product QR if user forgot to provide one
          mainQR = generateProductQR();
          setFormData(prev => ({ ...prev, productQR: mainQR }));
          setPackOptions(prev => prev.map((p, idx) => ({ ...p, productQR: String(p.productQR || '').trim() || (idx === 0 ? mainQR : `${mainQR}-${idx}`) })));
        }

        const normalizedPacks = packOptions
          .map((p, idx) => {
            const label = String(p.label || '').trim() || (idx === 0 ? 'Main' : `Pack ${idx}`);
            const quantity = Number(p.quantity || 1);
            const unit = invUnits?.find((u: any) => Number(u.id) === Number(p.unitId));
            const mrpVal = Number(p.mrp || 0);
            const purchaseRateVal = Number(p.purchaseRate || 0);
            const profitPercentVal = Number(p.profitPercent || 0);
            const sellingValInput = Number(p.sellingPrice || 0);
            const autoSelling = purchaseRateVal > 0
              ? Number((purchaseRateVal * (1 + (Number.isFinite(profitPercentVal) ? profitPercentVal : 0) / 100)).toFixed(2))
              : (mrpVal > 0 ? mrpVal : 0);
            const sellingPrice = Number.isFinite(sellingValInput) && sellingValInput > 0 ? sellingValInput : autoSelling;
            const packQR = String(p.productQR || '').trim() || (idx === 0 ? mainQR : `${mainQR}-${idx}`);
            const stockWarn = Number(p.stockWarningThreshold || 0);

            return {
              label,
              quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
              unitId: p.unitId ?? null,
              unitLabel: unit ? `${unit.name} (${unit.symbol})` : (p.unitLabel || ''),
              mrp: Number.isFinite(mrpVal) && mrpVal > 0 ? mrpVal : 0,
              purchaseRate: Number.isFinite(purchaseRateVal) && purchaseRateVal >= 0 ? purchaseRateVal : 0,
              profitPercent: Number.isFinite(profitPercentVal) ? profitPercentVal : 0,
              sellingPrice,
              price: sellingPrice,
              stockWarningThreshold: Number.isFinite(stockWarn) && stockWarn >= 0 ? Math.round(stockWarn) : 0,
              productQR: packQR,
            };
          })
          .filter((p) => p.label && Number.isFinite(p.sellingPrice) && p.sellingPrice > 0);

        if (normalizedPacks.length === 0) {
          toast.error('Add at least one valid pack option');
          return;
        }
        const seen = new Set<string>();
        for (const p of normalizedPacks) {
          if (seen.has(p.productQR)) {
            toast.error(`Duplicate pack barcode: ${p.productQR}`);
            return;
          }
          seen.add(p.productQR);
        }
        payload.packOptions = normalizedPacks;
      } else {
        payload.packOptions = [];
      }

      // For non-food (stocked) categories: auto-link by name or create inventory item + MRP
      if (!isFoodCategory) {
        // prefer using the menu item's linked inventory item when editing; otherwise try to find existing inventory item by name
        const existingInv = (editingItem && (editingItem as any).inventoryItem)
          ? (editingItem as any).inventoryItem
          : invItems?.find((it: any) => (it.name || '').toLowerCase().trim() === (formData.name || '').toLowerCase().trim());

        const unitIdToUse = invUnitId ?? (invUnits?.[0]?.id ?? null);

        // prefer an explicit category if provided; otherwise pick a non-food category if available
        let invCatToUse: number | undefined = undefined;
        if (formData.categoryId && Number(formData.categoryId) > 0) invCatToUse = Number(formData.categoryId);
        else {
          const fallback = categories?.find((c: any) => !isCategoryKOTEnabled(c));
          if (fallback) invCatToUse = Number(fallback.id);
        }

        try {
          if (existingInv) {
              // attach existing inventory item
              payload.inventoryItemId = existingInv.id;
              // create a new MRP for this supplier/item if purchaseRate/mrp/profit provided
              const prNum = purchaseRate ? Number(purchaseRate) : undefined;
              const profitPctNum = profitPercent ? Number(profitPercent) : undefined;
              const mrpInput = mrp ? Number(mrp) : undefined;
              // Respect explicit MRP entered by user. If MRP is empty, derive selling MRP from
              // purchaseRate + provided profit%. Never auto-derive/overwrite profit%.
              let computedMrpVal: number | undefined = undefined;
              if (mrpInput !== undefined) {
                computedMrpVal = mrpInput;
              } else if (!isNaN(Number(profitPctNum)) && prNum !== undefined && prNum > 0) {
                computedMrpVal = Math.round(prNum * (1 + (profitPctNum ?? 0) / 100) * 100) / 100;
              }

              if (prNum !== undefined && computedMrpVal !== undefined) {
                await api.post('/restaurant/inventory/mrps', {
                  inventoryItemId: existingInv.id,
                  mrp: computedMrpVal,
                  purchaseRate: prNum,
                  profitPercent: !isNaN(Number(profitPctNum)) ? profitPctNum : undefined
                });
              }
            } else {
            // Client-side validation: the inventory API requires a categoryId and unitId
            if (!invCatToUse) {
              toast.error('Please select or create a non-KOT category before creating an inventory item.');
              setUploading(false);
              return;
            }
            if (!unitIdToUse) {
              toast.error('Please add an inventory unit (e.g. pcs, kg) under Inventory → Units first.');
              setUploading(false);
              return;
            }

            const invRes = await api.post('/restaurant/inventory/items', {
              name: formData.name,
              categoryId: invCatToUse ?? undefined,
              unitId: unitIdToUse ? Number(unitIdToUse) : undefined,
              thresholdQty: 0,
              costPerUnit: purchaseRate ? Number(purchaseRate) : 0
            });
            const createdInv = invRes.data?.data;
              if (createdInv) {
                const prNum = purchaseRate ? Number(purchaseRate) : undefined;
                const profitPctNum = profitPercent ? Number(profitPercent) : undefined;
                const mrpInput = mrp ? Number(mrp) : undefined;
                let computedMrpVal: number | undefined = undefined;
                if (mrpInput !== undefined) {
                  computedMrpVal = mrpInput;
                } else if (!isNaN(Number(profitPctNum)) && prNum !== undefined && prNum > 0) {
                  computedMrpVal = Math.round(prNum * (1 + (profitPctNum ?? 0) / 100) * 100) / 100;
                }

                if (prNum !== undefined && computedMrpVal !== undefined) {
                  await api.post('/restaurant/inventory/mrps', {
                    inventoryItemId: createdInv.id,
                    mrp: computedMrpVal,
                    purchaseRate: prNum,
                    profitPercent: !isNaN(Number(profitPctNum)) ? profitPctNum : undefined
                  });
                }
              }
            payload.inventoryItemId = createdInv?.id;
          }
        } catch (err: any) {
          // Show a helpful toast and log full server response to console for debugging
          const serverMsg = err?.response?.data?.error || err?.message || String(err);
          toast.error('Failed to create inventory item or MRP: ' + serverMsg);
          console.error('Inventory create error response:', err?.response?.data || err);
          setUploading(false);
          return;
        }
      }

      if (editingItem) {
        await api.put(`/restaurant/menu-items/${editingItem.id}`, payload);
        toast.success('Item updated!');
      } else {
        await api.post('/restaurant/menu-items', payload);
        toast.success('Item created!');
      }

      // If we just created/updated a non-KOT (stock) item, switch filter to show non-KOT items
      if (!isFoodCategory) {
        if (kotFilter !== 'non') setKotFilter('non');
      } else {
        // if item is KOT but current filter is non-KOT, switch back to all so user sees it
        if (kotFilter === 'non') setKotFilter('all');
      }

      setShowModal(false);
      // refetch will pick up current kotFilter from queryKey
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  // Derived state: whether selected menu category is food (KOT-enabled)
  const selectedMenuCat = categories?.find((c: any) => Number(c.id) === Number(formData.categoryId));
  const showInventoryFields = selectedMenuCat ? !isCategoryKOTEnabled(selectedMenuCat) : false;
  const showFoodFields = selectedMenuCat ? isCategoryKOTEnabled(selectedMenuCat) : true;
  const sellingPriceNum = Number(formData.price || 0);
  const taxPercentNum = Number(formData.taxPercent || 0);
  const normalizedTaxType = String(formData.taxType || 'external').toLowerCase();
  const computedTaxPreview = (() => {
    if (!showInventoryFields || !Number.isFinite(sellingPriceNum) || sellingPriceNum < 0 || !Number.isFinite(taxPercentNum) || taxPercentNum < 0) {
      return { taxable: 0, tax: 0, final: 0 };
    }
    if (normalizedTaxType === 'internal') {
      const divisor = 1 + taxPercentNum / 100;
      const taxable = divisor > 0 ? sellingPriceNum / divisor : sellingPriceNum;
      const tax = sellingPriceNum - taxable;
      return { taxable, tax, final: sellingPriceNum };
    }
    const tax = sellingPriceNum * taxPercentNum / 100;
    return { taxable: sellingPriceNum, tax, final: sellingPriceNum + tax };
  })();

  const handleMrpChange = (v: string) => {
    setMrp(v);
  };

  const handleSellingPriceChange = (v: string) => {
    setFormData(prev => ({ ...prev, price: v }));
    const sp = parseFloat(v || '');
    const pr = parseFloat(purchaseRate || '');
    if (!isNaN(sp) && sp > 0 && !isNaN(pr) && pr > 0) {
      const pct = ((sp - pr) / pr) * 100;
      setProfitPercent(String(Math.round(pct * 100) / 100));
    } else if (!v) {
      setProfitPercent('');
    }
  };

  const handlePurchaseRateChange = (v: string) => {
    setPurchaseRate(v);
    const pr = parseFloat(v || '');
    const pct = parseFloat(profitPercent || '');
    const sp = parseFloat(formData.price || '');

    // Dual-direction computation:
    // 1. If profit percent is set, compute Selling Price = PurchaseRate + (PurchaseRate * Profit% / 100)
    // 2. Else if Selling Price is set, compute Profit% = ((SellingPrice - PurchaseRate) / PurchaseRate) * 100
    if (!isNaN(pr) && pr > 0 && !isNaN(pct) && pct !== 0) {
      const computedPrice = Math.round(pr * (1 + pct / 100) * 100) / 100;
      setFormData(prev => ({ ...prev, price: String(computedPrice) }));
    } else if (!isNaN(pr) && pr > 0 && !isNaN(sp) && sp > 0) {
      const pctComputed = ((sp - pr) / pr) * 100;
      setProfitPercent(String(Math.round(pctComputed * 100) / 100));
    } else if (!v) {
      setFormData(prev => ({ ...prev, price: '' }));
    }
  };

  const handleProfitPercentChange = (v: string) => {
    setProfitPercent(v);
    const pr = parseFloat(purchaseRate || '');
    const pct = parseFloat(v || '');

    // Dual-direction computation: when profit percent changes, update Selling Price based on Purchase Rate
    if (!isNaN(pr) && pr > 0 && !isNaN(pct)) {
      const computedPrice = Math.round(pr * (1 + pct / 100) * 100) / 100;
      setFormData(prev => ({ ...prev, price: String(computedPrice) }));
    } else if (!v) {
      // keep current price
    }
  };

  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const handleToggleSelectAll = () => {
    if (!items || items.length === 0) return;
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map((i: any) => i.id));
    }
  };

  const handleToggleSelectItem = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} selected item(s)?`)) return;

    const toastId = toast.loading(`Deleting ${selectedIds.length} item(s)...`);
    try {
      const res = await api.post('/restaurant/menu-items/bulk-delete', { ids: selectedIds });
      toast.success(res.data?.message || 'Items deleted successfully', { id: toastId });
      setSelectedIds([]);
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Bulk delete failed', { id: toastId });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this item?')) return;
    try {
      await api.delete(`/restaurant/menu-items/${id}`);
      toast.success('Item deleted');
      setSelectedIds(prev => prev.filter(x => x !== id));
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

  const computeMRPSellingPrice = (m: any) => {
    if (!m) return 0;
    if (m.sellingPrice !== undefined && m.sellingPrice !== null) return Number(m.sellingPrice);
    const pr = Number(m.purchaseRate ?? 0);
    const pp = Number(m.profitPercent ?? 0);
    if (pr > 0) return Number((pr * (1 + pp / 100)).toFixed(2));
    return Number(m.mrp ?? 0) || 0;
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto custom-scrollbar pr-2 space-y-6 animate-in p-1">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-text-primary uppercase italic tracking-tight">Vibe & Dine Menu</h1>
          <p className="text-xs text-text-muted mt-1 font-bold">Manage your gourmet offerings dynamically</p>
        </div>
          <div className="flex items-center gap-2">
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => handleOpenModal()}>Add New Item</Button>
            {/* <Button 
              icon={<Sparkles className="w-4 h-4 text-purple-300" />} 
              onClick={() => setShowBulkAIModal(true)} 
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg font-bold"
            >
              🤖 Gemini AI Bulk Upload
            </Button> */}
            <Button icon={<Upload className="w-4 h-4" />} onClick={() => setShowBulkModal(true)} variant="secondary">Bulk Excel</Button>
            <Button 
              icon={<Layers className="w-4 h-4" />} 
              onClick={async () => {
                const toastId = toast.loading('Generating Excel export...');
                try {
                  const tmpl = kotFilter === 'kot' ? 'kot' : 'non-kot';
                  const res = await api.get(`/restaurant/menu-items/export?template=${tmpl}`, { responseType: 'blob' });
                  const url = window.URL.createObjectURL(new Blob([res.data]));
                  const link = document.createElement('a');
                  link.href = url;
                  link.setAttribute('download', `${tmpl}_menu_items_${Date.now()}.xlsx`);
                  document.body.appendChild(link);
                  link.click();
                  link.remove();
                  toast.success('Export downloaded!', { id: toastId });
                } catch (err) {
                  toast.error('Export failed', { id: toastId });
                }
              }} 
              variant="outline"
            >
              Export Items
            </Button>
          </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input className="glass-input w-full pl-10 text-sm h-11" placeholder="Search menu items..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select value={kotFilter} onChange={(e) => setKotFilter(e.target.value as any)} className="glass-input h-11 text-sm w-36">
            <option value="all">All</option>
            <option value="kot">KOT</option>
            <option value="non">Stock</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={handleToggleSelectAll}
            className="h-11 px-4 font-bold text-xs flex items-center gap-2 border-border/60 hover:bg-bg-tertiary"
          >
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-border text-red-500 focus:ring-red-500 cursor-pointer accent-red-500 pointer-events-none"
              checked={items?.length > 0 && selectedIds.length === items.length}
              readOnly
            />
            {items?.length > 0 && selectedIds.length === items.length ? 'Deselect All' : `Select All (${items?.length || 0})`}
          </Button>

          {selectedIds.length > 0 && (
            <Button
              variant="danger"
              icon={<Trash2 className="w-4 h-4" />}
              onClick={handleBulkDelete}
              className="h-11 px-4 font-bold text-xs bg-red-600 hover:bg-red-700 text-white shadow-lg animate-in fade-in zoom-in duration-200"
            >
              Delete Selected ({selectedIds.length})
            </Button>
          )}
        </div>
      </div>

      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] font-black uppercase text-text-muted bg-bg-tertiary/50 tracking-widest">
                <th className="py-4 px-4 text-center w-12">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-border text-red-500 focus:ring-red-500 cursor-pointer accent-red-500"
                    checked={items?.length > 0 && selectedIds.length === items.length}
                    onChange={handleToggleSelectAll}
                    title="Select All Items"
                  />
                </th>
                <th className="text-left py-4 px-6">Dish Details</th>
                <th className="py-4 px-6 text-center">Group</th>
                <th className="py-4 px-6 text-center">Price</th>
                <th className="py-4 px-6 text-center">Type</th>
                <th className="py-4 px-6 text-center">Status</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="hover:bg-bg-tertiary/20 transition-colors">
                    {Array.from({ length: 7 }).map((_, j) => <td key={j} className="py-4 px-6"><Skeleton className="h-4 w-20" /></td>)}
                  </tr>
                ))
              ) : items?.length === 0 ? (
                <tr><td colSpan={7} className="py-20 text-center text-text-muted uppercase text-xs font-black italic">No items found. Create your signature dish now!</td></tr>
              ) : (
                items?.map((item: any) => (
                  <tr key={item.id} className={cn("hover:bg-bg-tertiary/20 transition-colors group", selectedIds.includes(item.id) && "bg-red-500/5")}>
                    <td className="py-4 px-4 text-center w-12">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-border text-red-500 focus:ring-red-500 cursor-pointer accent-red-500"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => handleToggleSelectItem(item.id)}
                      />
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-bg-tertiary border border-border/50 flex items-center justify-center overflow-hidden shadow-inner shrink-0">
                          {item.image ? (
                            <img
                              src={resolveImageUrl(item.image)}
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
                    <td className="py-4 px-6 text-center">
                      <Badge variant={isCategoryKOTEnabled(item.category) ? 'kot' : 'primary'} className="uppercase font-bold tracking-wider">
                        {item.category?.group?.name || 'General'}
                      </Badge>
                    </td>
                    <td className="py-4 px-6 text-center font-black text-white text-md">
                      {(() => {
                        const direct = Number(item.price);
                        if (Number.isFinite(direct) && direct > 0) return formatCurrency(direct);

                        if (Array.isArray(item.packOptions) && item.packOptions.length > 0) {
                          const p0 = item.packOptions[0];
                          const pv = Number(p0.sellingPrice ?? p0.price ?? 0);
                          if (Number.isFinite(pv) && pv > 0) return formatCurrency(pv);
                        }

                        const mrps = item.inventoryItem?.inventoryMRPs ?? [];
                        const active = (mrps || []).find((m: any) => m.isActive !== false) ?? mrps[0];
                        if (active) {
                          const sp = computeMRPSellingPrice(active);
                          if (Number.isFinite(sp) && sp > 0) return formatCurrency(sp);
                        }

                        return formatCurrency(0);
                      })()}
                    </td>
                    <td className="py-4 px-6 text-center">
                      {(() => {
                        const isKOTItem = isCategoryKOTEnabled(item.category);
                        if (isKOTItem) {
                          return (
                            <div className="flex items-center justify-center gap-1.5">
                              <div className={cn("w-2 h-2 rounded-full", item.isVeg ? 'bg-success shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-danger shadow-[0_0_8px_rgba(239,68,68,0.4)]')} />
                              <span className="text-[10px] font-bold uppercase text-text-secondary">{item.isVeg ? 'Veg' : 'Non-Veg'}</span>
                            </div>
                          );
                        } else {
                          return (
                            <div className="flex items-center justify-center gap-1.5">
                              <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]" />
                              <span className="text-[10px] font-bold uppercase text-text-secondary">Stock</span>
                            </div>
                          );
                        }
                      })()}
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
                        src={resolveImageUrl(formData.image)} 
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
                        onClick={(e) => { e.stopPropagation(); setFormData(prev => ({ ...prev, image: '', imageSource: 'manual' })); }}
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
                    label={showFoodFields ? "Signature Name" : "Product Name"} 
                    value={formData.name} 
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                    onBlur={() => { if (!formData.image && formData.name.length > 3) handleAIGenerateImage(); }}
                    placeholder={showFoodFields ? "e.g. Avocado Toast" : "e.g. Cola Can"} 
                  />
                  <Input label="Selling Price" type="number" value={formData.price} onChange={(e) => handleSellingPriceChange(e.target.value)} placeholder="0.00" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                   <div className="col-span-2">
                      <Input label={showFoodFields ? "Chef's Note / Description" : "Product Description"} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder={showFoodFields ? "Describe the flavors..." : "Describe the product details..."} />
                   </div>
                   <div className="flex gap-2 items-end pb-0.5 h-full">
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="h-10 flex-1 uppercase font-black text-[9px] bg-gradient-to-r from-purple-600/20 to-blue-600/20 border-purple-500/30 hover:border-purple-500 flex items-center justify-center gap-1.5"
                        icon={<Sparkles size={12} className="text-purple-400" />}
                        onClick={handleAIGenerateImage}
                        loading={uploading}
                      >
                         AI Photo
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-10 flex-1 uppercase font-black text-[9px] flex items-center justify-center gap-1.5"
                        icon={<Layers size={12} />}
                        onClick={() => setShowLibModal(true)}
                      >
                        LIB
                      </Button>
                   </div>
                </div>
              </div>
          </div>

          {showLibModal && (
            <div className="mt-4">
              <ImageLibraryModal inline open={showLibModal} onClose={() => setShowLibModal(false)} onSelect={handleLibSelect} defaultQuery={formData.name} selectedUrl={formData.image} />
            </div>
          )}

          <div className="grid grid-cols-4 gap-4">
            {showFoodFields ? (
              <>
                <div className="flex flex-col gap-1.5 col-span-1">
                  <label className="text-[10px] font-black uppercase text-text-muted ml-1">Assigned Menu</label>
                  <select className="glass-input h-10 text-xs font-bold" value={formData.menuId} onChange={(e) => setFormData({ ...formData, menuId: Number(e.target.value) })}>
                    <option value={0}>General Menu</option>
                    {menus?.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5 col-span-2">
                  <label className="text-[10px] font-black uppercase text-text-muted ml-1">Category</label>
                  <select className="glass-input h-10 text-xs font-bold" value={formData.categoryId} onChange={(e) => setFormData({ ...formData, categoryId: Number(e.target.value) })}>
                    <option value={0}>Main Course</option>
                    {categories?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="col-span-1">
                  <Input label="Kitchen Prep (min)" type="number" value={formData.preparationTime} onChange={(e) => setFormData({ ...formData, preparationTime: e.target.value })} placeholder="15" />
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1.5 col-span-2">
                  <label className="text-[10px] font-black uppercase text-text-muted ml-1">Category</label>
                  <select className="glass-input h-10 text-xs font-bold" value={formData.categoryId} onChange={(e) => setFormData({ ...formData, categoryId: Number(e.target.value) })}>
                    <option value={0}>Main Course</option>
                    {categories?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <Input
                    label="Product QR / Barcode"
                    value={formData.productQR}
                    onChange={(e) => setFormData({ ...formData, productQR: e.target.value })}
                    placeholder="Scan or type..."
                    icon={<QrCode size={14} />}
                    className="h-10 text-sm w-full"
                  />
                </div>
              </>
            )}
          </div>

          {/* Inventory / MRP block for non-food categories */}
          {showInventoryFields && (
            <div className="border border-border/40 bg-bg-tertiary/10 rounded-2xl p-4 space-y-4 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                <span className="text-xs">📦</span>
                <h4 className="text-xs font-black uppercase text-text-primary tracking-widest">Inventory & Stock Configuration</h4>
              </div>

              <div className="grid grid-cols-12 gap-4 items-end">
                <div className="col-span-3 flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase text-text-muted ml-1">Unit</label>
                  <select className="glass-input h-10 text-sm font-bold" value={invUnitId ?? ''} onChange={(e) => setInvUnitId(Number(e.target.value))}>
                    <option value="">Select unit</option>
                    {invUnits?.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
                  </select>
                </div>

                <div className="col-span-9">
                  <div className="grid grid-cols-4 gap-4 items-end">
                    <Input label="MRP" type="number" value={mrp || ''} onChange={(e) => handleMrpChange(e.target.value)} placeholder="0.00" className="h-10 text-sm" />
                    <Input label="Purchase Rate" type="number" value={purchaseRate} onChange={(e) => handlePurchaseRateChange(e.target.value)} placeholder="0.00" className="h-10 text-sm" />
                    <Input label="Profit %" type="number" value={profitPercent} onChange={(e) => handleProfitPercentChange(e.target.value)} placeholder="%" className="h-10 text-sm" />
                    <Input label="Stock Warn (servings)" type="number" value={formData.stockWarningThreshold} onChange={(e) => setFormData(prev => ({ ...prev, stockWarningThreshold: e.target.value }))} placeholder="e.g. 4" className="h-10 text-sm" />
                  </div>
                </div>

                <div className="col-span-12">
                  <div className="grid grid-cols-2 gap-4 items-end mb-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-text-muted ml-1 block mb-2">Expiry Date (Optional)</label>
                      <input 
                        type="date" 
                        value={formData.expiryDate} 
                        onChange={(e) => setFormData(prev => ({ ...prev, expiryDate: e.target.value }))}
                        className="glass-input w-full h-10 text-sm"
                      />
                      <p className="text-[9px] text-text-muted mt-1">Leave empty if no expiry (for KOT items)</p>
                    </div>
                  </div>

                  <div className="col-span-12 flex items-center gap-3 h-10">
                    <input
                      id="enable-pack-options"
                      type="checkbox"
                      checked={Boolean(formData.enablePackOptions)}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        setFormData(prev => ({ ...prev, enablePackOptions: enabled }));
                        if (enabled) {
                          setPackOptions(prev => prev.length > 0 ? prev : [getMainPackSeed()]);
                        }
                      }}
                    />
                    <label htmlFor="enable-pack-options" className="text-xs font-black uppercase text-text-primary tracking-wide">
                      Enable Pack Options (Non-KOT)
                    </label>
                  </div>

                  {Boolean(formData.enablePackOptions) && (
                    <div className="mt-3 border border-border/40 rounded-xl p-3 space-y-2 bg-bg-tertiary/20">
                      <div className="text-[10px] text-text-muted font-black uppercase tracking-wider">Pack Variants</div>
                      {packOptions.map((p, idx) => (
                        <div key={idx} className="rounded-lg border border-border/40 p-3 bg-bg-secondary/40 space-y-2">
                          <div className="grid grid-cols-12 gap-2">
                            <input
                              className="col-span-3 glass-input h-9 text-xs"
                              placeholder="Label"
                              value={p.label}
                              onChange={(e) => setPackOptions(prev => prev.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))}
                            />
                            <input
                              className="col-span-2 glass-input h-9 text-xs"
                              type="number"
                              min="0.01"
                              step="0.01"
                              placeholder="Qty"
                              value={p.quantity}
                              onChange={(e) => {
                                const qtyVal = e.target.value;
                                setPackOptions(prev => {
                                  const next = prev.map((x, i) => i === idx ? { ...x, quantity: qtyVal } : x);
                                  const main = next[0];
                                  const current = next[idx];
                                  if (!main || !current || idx === 0) return next;
                                  if (!isKgUnitText(main.unitLabel)) return next;
                                  const mainQty = Number(main.quantity || 1);
                                  const curQty = Number(qtyVal || 0);
                                  if (!(mainQty > 0) || !(curQty > 0)) return next;
                                  const factor = curQty / mainQty;
                                  const mrpVal = Number(main.mrp || 0);
                                  const prVal = Number(main.purchaseRate || 0);
                                  const ppVal = Number(current.profitPercent || main.profitPercent || 0);
                                  const nextMrp = mrpVal > 0 ? Number((mrpVal * factor).toFixed(2)) : 0;
                                  const nextPr = prVal > 0 ? Number((prVal * factor).toFixed(2)) : 0;
                                  const nextSell = nextPr > 0 ? Number((nextPr * (1 + ppVal / 100)).toFixed(2)) : (nextMrp > 0 ? nextMrp : Number(current.sellingPrice || 0));
                                  next[idx] = {
                                    ...current,
                                    mrp: nextMrp > 0 ? String(nextMrp) : current.mrp,
                                    purchaseRate: nextPr > 0 ? String(nextPr) : current.purchaseRate,
                                    sellingPrice: nextSell > 0 ? String(nextSell) : current.sellingPrice,
                                  };
                                  return next;
                                });
                              }}
                            />
                            <select
                              className="col-span-3 glass-input h-9 text-xs"
                              value={p.unitId ?? ''}
                              onChange={(e) => {
                                const nextUnitId = e.target.value ? Number(e.target.value) : null;
                                const u = invUnits?.find((x: any) => Number(x.id) === Number(nextUnitId));
                                setPackOptions(prev => prev.map((x, i) => i === idx ? { ...x, unitId: nextUnitId, unitLabel: u ? `${u.name} (${u.symbol})` : '' } : x));
                              }}
                            >
                              <option value="">Unit</option>
                              {invUnits?.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
                            </select>
                            <input
                              className="col-span-3 glass-input h-9 text-xs"
                              placeholder="Barcode"
                              value={p.productQR}
                              onChange={(e) => setPackOptions(prev => prev.map((x, i) => i === idx ? { ...x, productQR: e.target.value } : x))}
                            />
                            <button
                              type="button"
                              className="col-span-1 text-red-400 hover:text-red-300 font-black"
                              onClick={() => setPackOptions(prev => prev.filter((_, i) => i !== idx))}
                              aria-label="Remove pack option"
                            >
                              ×
                            </button>
                          </div>
                          <div className="grid grid-cols-12 gap-2">
                            <input className="col-span-2 glass-input h-9 text-xs" type="number" step="0.01" placeholder="MRP" value={p.mrp}
                              onChange={(e) => setPackOptions(prev => prev.map((x, i) => i === idx ? { ...x, mrp: e.target.value } : x))} />
                            <input className="col-span-2 glass-input h-9 text-xs" type="number" step="0.01" placeholder="Purchase" value={p.purchaseRate}
                              onChange={(e) => {
                                const v = e.target.value;
                                setPackOptions(prev => prev.map((x, i) => {
                                  if (i !== idx) return x;
                                  const pr = Number(v || 0);
                                  const pp = Number(x.profitPercent || 0);
                                  const sell = pr > 0 ? Number((pr * (1 + pp / 100)).toFixed(2)) : Number(x.sellingPrice || 0);
                                  return { ...x, purchaseRate: v, sellingPrice: sell > 0 ? String(sell) : x.sellingPrice };
                                }));
                              }} />
                            <input className="col-span-2 glass-input h-9 text-xs" type="number" step="0.01" placeholder="Profit %" value={p.profitPercent}
                              onChange={(e) => {
                                const v = e.target.value;
                                setPackOptions(prev => prev.map((x, i) => {
                                  if (i !== idx) return x;
                                  const pr = Number(x.purchaseRate || 0);
                                  const pp = Number(v || 0);
                                  const sell = pr > 0 ? Number((pr * (1 + pp / 100)).toFixed(2)) : Number(x.sellingPrice || 0);
                                  return { ...x, profitPercent: v, sellingPrice: sell > 0 ? String(sell) : x.sellingPrice };
                                }));
                              }} />
                            <input className="col-span-2 glass-input h-9 text-xs" type="number" step="0.01" placeholder="Selling" value={p.sellingPrice}
                              onChange={(e) => {
                                const v = e.target.value;
                                setPackOptions(prev => prev.map((x, i) => {
                                  if (i !== idx) return x;
                                  const sp = parseFloat(v || '');
                                  const pr = parseFloat(x.purchaseRate || '');
                                  let nextProfit = x.profitPercent;
                                  if (!isNaN(sp) && sp > 0 && !isNaN(pr) && pr > 0) {
                                    const pct = ((sp / pr) - 1) * 100;
                                    nextProfit = String(Math.round(pct * 100) / 100);
                                  }
                                  return { ...x, sellingPrice: v, profitPercent: nextProfit };
                                }));
                              }} />
                            <input className="col-span-2 glass-input h-9 text-xs" type="number" placeholder="Stock Warn" value={p.stockWarningThreshold}
                              onChange={(e) => setPackOptions(prev => prev.map((x, i) => i === idx ? { ...x, stockWarningThreshold: e.target.value } : x))} />
                          </div>
                        </div>
                      ))}
                      <div>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={addPackVariantFromMain}
                        >
                          Add Pack Option
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {showInventoryFields && (
            <div className="border border-border/40 bg-bg-tertiary/10 rounded-2xl p-4 space-y-4 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                <span className="text-xs">💰</span>
                <h4 className="text-xs font-black uppercase text-text-primary tracking-widest">Pricing & Taxation Setup</h4>
              </div>

              <div className="grid grid-cols-12 gap-4 items-end">
                <div className="col-span-6 flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase text-text-muted ml-1">Tax Type</label>
                  <select
                    className="glass-input h-10 text-sm font-bold"
                    value={formData.taxType}
                    onChange={(e) => setFormData(prev => ({ ...prev, taxType: e.target.value }))}
                  >
                    <option value="external">External (Tax Added)</option>
                    <option value="internal">Internal (Tax Included)</option>
                  </select>
                </div>
                <div className="col-span-6">
                  <Input
                    label="Tax %"
                    type="number"
                    value={formData.taxPercent}
                    onChange={(e) => setFormData(prev => ({ ...prev, taxPercent: e.target.value }))}
                    placeholder="e.g. 5"
                    className="h-10 text-sm"
                  />
                </div>
                <div className="col-span-12 rounded-xl border border-border/40 bg-bg-tertiary/20 px-4 py-3 text-xs">
                  <div className="font-black uppercase text-text-muted tracking-wider mb-2">Tax Auto Calculation Preview</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-text-secondary">
                    <div>Taxable: <span className="font-black text-text-primary">{formatCurrency(computedTaxPreview.taxable)}</span></div>
                    <div>Tax: <span className="font-black text-text-primary">{formatCurrency(computedTaxPreview.tax)}</span></div>
                    <div>Final Selling Price: <span className="font-black text-text-primary">{formatCurrency(computedTaxPreview.final)}</span></div>
                  </div>
                  <div className="mt-2 text-[10px] text-text-muted">
                    {normalizedTaxType === 'internal'
                      ? 'Internal tax: tax is included inside Selling Price.'
                      : 'External tax: tax is added on top of Selling Price.'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {showFoodFields && (
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
          )}

          {/* Modifier Group Selection - Now visible for NEW items too */}
          {showFoodFields && (
            <div className="pt-4 border-t border-border/50">
            <div className="mb-2 font-bold text-xs text-text-muted flex items-center gap-2">
               <Layers size={12} className="text-blue-400" />
               Linked Modifier Groups:
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {editingItem?.itemModifiers?.map((im: any) => (
                <Badge key={im.modifierGroup.id} variant="info" className="gap-1.5 px-3 py-1 text-xs font-bold flex items-center bg-blue-500/10 border border-blue-500/30 text-blue-300">
                   {im.modifierGroup.name}
                   <button 
                     type="button" 
                     onClick={() => handleUnlinkModifier(im.modifierGroup.id)}
                     className="hover:text-red-400 text-text-muted/60 transition-colors ml-1"
                     title="Unlink modifier group"
                   >
                     <X size={10} />
                   </button>
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
          )}
          <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
            <Button variant="ghost" className="uppercase font-black text-[10px]" onClick={() => setShowModal(false)}>Discard</Button>
            <Button disabled={uploading} className="bg-blue-600 px-8 uppercase font-black text-[10px]" onClick={handleSubmit}>
               {editingItem ? 'Update Vibe' : 'Craft Dish'}
            </Button>
          </div>
        </div>
      </Modal>
      {/* ImageLibraryModal embedded inline inside the Menu Items dialog */}
      <Modal open={showBulkModal} onClose={() => setShowBulkModal(false)} title="Bulk Upload Items" size="md">
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-2 items-center">
            <label className="text-sm font-bold">Template</label>
            <select className="glass-input h-10" value={bulkTemplate} onChange={(e) => setBulkTemplate(e.target.value as any)}>
              <option value="non-kot">Non-KOT (Stock)</option>
              <option value="kot">KOT (Food)</option>
            </select>
          </div>

          <div className="rounded-lg border border-border/60 bg-bg-tertiary/40 p-3 text-xs text-text-muted space-y-2">
            <p className="font-semibold text-text-primary">Template rules</p>
            <p><span className="font-semibold text-text-primary">Group</span> now decides item type during upload: values like <span className="font-semibold text-text-primary">KOT/Food</span> create KOT items, and values like <span className="font-semibold text-text-primary">Non KOT/Stock/Inventory</span> create Non-KOT items. If <span className="font-semibold text-text-primary">Category</span> does not exist it will be auto-created under that group.</p>
            <p><span className="font-semibold text-text-primary">ImageMode</span> values: <span className="font-semibold text-text-primary">ai</span>, <span className="font-semibold text-text-primary">auto</span>, <span className="font-semibold text-text-primary">lib</span>. For <span className="font-semibold text-text-primary">lib</span>, upload first tries local library filename match, then auto-searches via Pexels and saves to local static image.</p>
            <p><span className="font-semibold text-text-primary">PackVariants</span> format (Non-KOT): <span className="font-semibold text-text-primary">Label|Qty|Unit|Barcode|MRP|Purchase|Profit%|Selling|StockWarn</span>. Add multiple variants with semicolon separators.</p>
            <p>Uploaded files can be CSV or XLSX. Keep the header row unchanged.</p>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={() => downloadTemplate(bulkTemplate === 'kot' ? 'kot' : 'non-kot')} icon={<Layers size={14} />}>Download Template</Button>
            <input ref={bulkFileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleBulkFileChange} style={{ display: 'none' }} />
            <Button onClick={() => bulkFileRef.current?.click()} icon={<Upload size={14} />}>Choose File</Button>
            {bulkUploading && <span className="text-sm text-gray-500">Uploading...</span>}
          </div>

          {bulkResult && (
            <div className="text-sm">
              <div>Created: {bulkResult.created}</div>
              <div>Updated: {bulkResult.updated}</div>
              {bulkResult.errors?.length > 0 && (
                <div className="mt-2 text-xs text-red-600">Errors: {bulkResult.errors.length} — check upload log for details</div>
              )}
            </div>
          )}
        </div>
      </Modal>

      <BulkImageAIModal
        isOpen={showBulkAIModal}
        onClose={() => setShowBulkAIModal(false)}
        categories={categories || []}
        menus={menus || []}
        onSuccess={() => refetch()}
      />
    </div>
  );
}
