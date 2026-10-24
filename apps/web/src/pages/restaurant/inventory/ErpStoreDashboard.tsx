import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { 
  RefreshCw, Settings, X, Package, Truck, PlusCircle, 
  CheckCircle, AlertCircle, HelpCircle, ArrowRightLeft, Info,
  Upload, Image as ImageIcon, Sparkles
} from 'lucide-react';
import { resolveImageUrl } from '@/lib/utils';
import ImageLibraryModal from '@/components/ImageLibraryModal';
import toast from 'react-hot-toast';

export default function ErpStoreDashboard() {
  const queryClient = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [transferQty, setTransferQty] = useState<number | ''>(1);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [dispatching, setDispatching] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showLibModal, setShowLibModal] = useState(false);

  // Fetch ERP connection config
  const { data: config = null, isLoading: loadingConfig } = useQuery({
    queryKey: ['erp-store-config'],
    queryFn: () => api.get('/restaurant/erp-store/config').then(r => r.data.data).catch(() => null),
    retry: false
  });

  // Fetch ERP ready products (proxied)
  const { data: readyProducts = [], isLoading: loadingReady, error: readyError, refetch: refetchReady } = useQuery({
    queryKey: ['erp-ready-products'],
    queryFn: () => api.get('/restaurant/erp-store/ready-products').then(r => Array.isArray(r.data.data) ? r.data.data : (r.data.data?.products || [])),
    enabled: !!config?.baseUrl,
    retry: false
  });

  // Fetch local inventory items to display my stock side-by-side
  const { data: localItems = [], isLoading: loadingLocal } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: () => api.get('/restaurant/inventory/items').then(r => r.data.data),
  });

  // Fetch local categories for mapping
  const { data: categories = [] } = useQuery({
    queryKey: ['local-categories'],
    queryFn: () => api.get('/restaurant/inventory/categories').then(r => r.data.data),
  });

  const [isNewItemModalOpen, setIsNewItemModalOpen] = useState(false);
  const [newItemConfig, setNewItemConfig] = useState<{
    product_id: number;
    name: string;
    categoryId: string;
    price: number;
    image: string;
    qty: number;
    sku: string;
  } | null>(null);

  // Populate config fields once loaded
  useEffect(() => {
    if (config) {
      setBaseUrl(config.baseUrl || '');
      setApiKey(''); // Do not display existing API key for security
    }
  }, [config]);

  // Show auto-expiring toast notifications
  const triggerToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!baseUrl) return alert('Base URL is required.');
    try {
      await api.post('/restaurant/erp-store/config', { baseUrl, apiKey });
      queryClient.invalidateQueries({ queryKey: ['erp-store-config'] });
      setSettingsOpen(false);
      triggerToast('ERP Configuration updated successfully.');
    } catch (err: any) {
      alert('Failed to save config: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/restaurant/erp-store/sync');
      const appliedCount = res.data?.appliedCount || 0;
      queryClient.invalidateQueries({ queryKey: ['erp-ready-products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      triggerToast(`Manual sync finished. Applied ${appliedCount} pending dispatches.`);
    } catch (err: any) {
      triggerToast(err.response?.data?.error || err.message || 'Sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) return triggerToast('Please select a product first.', 'error');
    const qty = Number(transferQty);
    if (!qty || qty <= 0) return triggerToast('Quantity must be greater than zero.', 'error');

    // Find the product in rows to see if it's new
    const rp = rows.find((r: any) => String(r.product_id) === String(selectedProductId));
    if (rp?.isNew) {
      setNewItemConfig({
        product_id: rp.product_id,
        name: rp.name,
        categoryId: categories[0]?.id ? String(categories[0].id) : '',
        price: Number(rp.selling_price || 0),
        image: rp.image || '',
        qty: qty,
        sku: rp.sku || ''
      });
      setIsNewItemModalOpen(true);
      return;
    }

    setDispatching(true);
    try {
      await api.post('/restaurant/erp-store/dispatch', {
        items: [{ product_id: Number(selectedProductId), qty }]
      });
      queryClient.invalidateQueries({ queryKey: ['erp-ready-products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      triggerToast(`Successfully received ${qty} units into stock.`);
      setSelectedProductId('');
      setTransferQty(1);
    } catch (err: any) {
      triggerToast(err.response?.data?.error || err.message || 'Transfer failed', 'error');
    } finally {
      setDispatching(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    const toastId = toast.loading('Uploading image...');
    const uploadData = new FormData();
    uploadData.append('file', file);

    try {
      const res = await api.post('/restaurant/upload', uploadData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (newItemConfig) {
        setNewItemConfig({ ...newItemConfig, image: res.data.url });
      }
      toast.success('Image uploaded successfully!', { id: toastId });
    } catch (err: any) {
      toast.error('Upload failed: ' + (err.response?.data?.error || err.message), { id: toastId });
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleLibSelect = (url: string) => {
    if (newItemConfig) {
      setNewItemConfig({ ...newItemConfig, image: url });
    }
    setShowLibModal(false);
  };

  const handleNewItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemConfig) return;
    if (!newItemConfig.categoryId) return triggerToast('Please select a category.', 'error');
    if (newItemConfig.qty <= 0) return triggerToast('Quantity must be greater than zero.', 'error');

    setDispatching(true);
    try {
      await api.post('/restaurant/erp-store/dispatch', {
        items: [{
          product_id: newItemConfig.product_id,
          qty: newItemConfig.qty,
          name: newItemConfig.name,
          categoryId: Number(newItemConfig.categoryId),
          price: newItemConfig.price,
          image: newItemConfig.image
        }]
      });
      queryClient.invalidateQueries({ queryKey: ['erp-ready-products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      triggerToast(`Successfully created "${newItemConfig.name}" and received ${newItemConfig.qty} units into stock.`);
      setIsNewItemModalOpen(false);
      setNewItemConfig(null);
      setSelectedProductId('');
      setTransferQty(1);
    } catch (err: any) {
      triggerToast(err.response?.data?.error || err.message || 'Transfer failed', 'error');
    } finally {
      setDispatching(false);
    }
  };

  // Match ERP SKU or Name to Local Items
  const erpImportedItems = useMemo(() => {
    return localItems.filter((item: any) => item.category?.name === 'ERP Imported' || item.sku);
  }, [localItems]);

  const localStockBySku = useMemo(() => {
    const map: Record<string, number> = {};
    localItems.forEach((it: any) => {
      if (it.sku) {
        let baseSku = it.sku.toLowerCase().trim();
        const suffix = `-${it.restaurantId}`;
        if (baseSku.endsWith(suffix)) {
          baseSku = baseSku.slice(0, -suffix.length);
        }
        map[baseSku] = Number(it.currentStock || 0);
      }
    });
    return map;
  }, [localItems]);

  const rows = useMemo(() => {
    return readyProducts.map((rp: any) => {
      const skuKey = rp.sku ? rp.sku.toLowerCase().trim() : '';
      const localStock = localStockBySku[skuKey] ?? 0;
      const isConfiguredLocally = localStockBySku[skuKey] !== undefined;
      return {
        ...rp,
        myStock: localStock,
        isNew: !isConfiguredLocally
      };
    });
  }, [readyProducts, localStockBySku]);

  const isConnected = !!config?.baseUrl && !readyError;

  return (
    <div className="space-y-4 animate-in p-6">
      {/* Top Header Row */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-primary">ERP Store Connection</h1>
          <p className="text-xs text-text-muted mt-1">
            Fetch baking products dynamically from manufacturing and adjust POS store stock automatically
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Status Pill */}
          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
            isConnected 
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            {isConnected ? 'Connected' : 'Offline / Unconfigured'}
          </div>

          <Button 
            size="sm" 
            variant="secondary" 
            onClick={handleSyncNow} 
            disabled={syncing || !config?.baseUrl}
            className="flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </Button>

          <Button 
            size="sm" 
            variant="primary" 
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5"
          >
            <Settings size={14} />
            Configure ERP
          </Button>
        </div>
      </div>

      {/* Custom Toast Notification Alert */}
      {toastMessage && (
        <div className={`p-4 rounded-lg flex items-start gap-3 border animate-in ${
          toastMessage.type === 'success' 
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' 
            : 'bg-rose-500/10 text-rose-400 border-rose-500/25'
        }`}>
          {toastMessage.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <div className="text-xs font-medium">{toastMessage.text}</div>
        </div>
      )}

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Products Ready from Maker */}
        <div className="lg:col-span-8 space-y-4">
          <Card padding={true}>
            <div className="flex items-center justify-between mb-4 border-b border-border/40 pb-3">
              <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <Package size={16} className="text-purple-400" />
                Products Ready at Maker / Bakery ({rows.length})
              </h2>
              <Button size="sm" variant="secondary" onClick={() => refetchReady()} disabled={loadingReady || !config?.baseUrl}>
                <RefreshCw size={12} className={loadingReady ? 'animate-spin' : ''} />
              </Button>
            </div>

            {loadingReady && <div className="p-8 text-center text-text-muted text-xs">Fetching bakery products from ERP...</div>}
            
            {!config?.baseUrl && (
              <div className="p-8 text-center border border-dashed border-border rounded-xl">
                <HelpCircle size={32} className="mx-auto text-text-muted mb-2" />
                <p className="text-sm font-semibold text-text-secondary">ERP Connection Required</p>
                <p className="text-xs text-text-muted mt-1 max-w-sm mx-auto">
                  Click 'Configure ERP' to link this restaurant POS with the baker's manufacturing system using your API key.
                </p>
                <Button size="sm" variant="primary" className="mt-3" onClick={() => setSettingsOpen(true)}>Configure now</Button>
              </div>
            )}

            {config?.baseUrl && readyError && (
              <div className="p-6 text-center border border-dashed border-rose-500/30 bg-rose-500/10 rounded-xl space-y-2 my-2">
                <AlertCircle size={32} className="mx-auto text-rose-400 mb-1" />
                <p className="text-sm font-semibold text-rose-300">ERP Store Sync / Connection Error</p>
                <p className="text-xs text-rose-400/90 max-w-md mx-auto">
                  {(readyError as any)?.response?.data?.error || (readyError as any)?.message || 'Unable to sync with the external ERP store. Please verify your connection settings.'}
                </p>
                <div className="pt-2 flex justify-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => refetchReady()}>
                    <RefreshCw size={12} className="mr-1.5" /> Retry Sync
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => setSettingsOpen(true)}>
                    <Settings size={12} className="mr-1.5" /> Configure ERP
                  </Button>
                </div>
              </div>
            )}

            {config?.baseUrl && !loadingReady && !readyError && rows.length === 0 && (
              <div className="p-8 text-center text-text-muted text-xs italic">
                No ready products available at the bakery right now.
              </div>
            )}

            {config?.baseUrl && !loadingReady && !readyError && rows.length > 0 && (
              <div className="overflow-x-auto text-[11px]">
                <table className="w-full">
                  <thead>
                    <tr className="bg-bg-tertiary/50 border-b border-border text-left">
                      <th className="py-2.5 px-4 font-medium text-text-secondary">Product Name</th>
                      <th className="py-2.5 px-4 font-medium text-text-secondary">SKU</th>
                      <th className="py-2.5 px-4 font-medium text-text-secondary text-center">Ready Stock</th>
                      <th className="py-2.5 px-4 font-medium text-text-secondary text-center">Selling Price</th>
                      <th className="py-2.5 px-4 font-medium text-text-secondary text-center">My POS Stock</th>
                      <th className="py-2.5 px-4 font-medium text-text-secondary text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {rows.map((rp: any) => (
                      <tr key={rp.product_id} className="hover:bg-bg-hover/30 transition-colors">
                        <td className="py-3 px-4 font-medium text-text-primary">
                          <div className="flex items-center gap-2">
                            <span>{rp.name}</span>
                            {rp.isNew && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.25">
                                <PlusCircle size={8} /> New
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-text-muted font-mono">{rp.sku || 'N/A'}</td>
                        <td className="py-3 px-4 text-center font-mono text-purple-300 font-bold">{rp.ready_stock}</td>
                        <td className="py-3 px-4 text-center font-mono text-text-primary">₹{Number(rp.selling_price || 0).toFixed(2)}</td>
                        <td className={`py-3 px-4 text-center font-mono font-medium ${rp.myStock > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {rp.myStock}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button 
                            size="sm" 
                            variant="secondary" 
                            onClick={() => {
                              if (rp.isNew) {
                                setNewItemConfig({
                                  product_id: rp.product_id,
                                  name: rp.name,
                                  categoryId: categories[0]?.id ? String(categories[0].id) : '',
                                  price: Number(rp.selling_price || 0),
                                  image: rp.image || '',
                                  qty: 1,
                                  sku: rp.sku || ''
                                });
                                setIsNewItemModalOpen(true);
                              } else {
                                setSelectedProductId(String(rp.product_id));
                                setTransferQty(1);
                              }
                            }}
                            disabled={Number(rp.ready_stock || 0) <= 0}
                          >
                            Transfer Stock
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Right Side: Local Stock and Quick Transfer */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Quick Stock Transfer Request form */}
          <Card padding={true}>
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2 mb-3 border-b border-border/40 pb-2">
              <ArrowRightLeft size={16} className="text-emerald-400" />
              Quick Stock Transfer
            </h2>
            <form onSubmit={handleTransfer} className="space-y-4">
              <div>
                <label className="block text-[10px] text-text-muted font-bold mb-1.5 uppercase">Select Product</label>
                <select 
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-purple-500"
                >
                  <option value="">-- Choose Bakery Product --</option>
                  {readyProducts.map((p: any) => (
                    <option key={p.product_id} value={p.product_id} disabled={Number(p.ready_stock || 0) <= 0}>
                      {p.name} (Ready: {p.ready_stock})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-text-muted font-bold mb-1.5 uppercase">Quantity to Transfer</label>
                <input 
                  type="number"
                  min="1"
                  value={transferQty}
                  onChange={(e) => setTransferQty(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Enter dispatch quantity"
                  className="w-full text-xs px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <Button 
                type="submit" 
                size="sm" 
                variant="primary" 
                className="w-full"
                disabled={dispatching || !selectedProductId}
              >
                {dispatching ? 'Processing dispatch...' : 'Request Transfer'}
              </Button>
            </form>
          </Card>

          {/* Local Stock Summary */}
          <Card padding={true}>
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2 mb-3 border-b border-border/40 pb-2">
              <Truck size={16} className="text-blue-400" />
              POS Local Stock (ERP Imported)
            </h2>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {erpImportedItems.map((item: any) => (
                <div key={item.id} className="p-2.5 rounded-lg bg-bg-tertiary/40 border border-border/30 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-text-primary">{item.name}</div>
                    <div className="text-[10px] text-text-muted font-mono">{item.sku || 'No SKU'}</div>
                  </div>
                  <div className="font-mono text-emerald-400 font-bold">{item.currentStock} {item.unit?.symbol || 'pc'}</div>
                </div>
              ))}
              {erpImportedItems.length === 0 && (
                <div className="text-xs text-text-muted text-center py-4 italic">
                  No local ERP items imported yet. Keep syncing!
                </div>
              )}
            </div>
          </Card>

          {/* Information box */}
          <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/10 flex gap-3 text-xs text-purple-300">
            <Info size={16} className="flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block mb-0.5">Automated Adjustments</span>
              Dispatches from the baker's manufacturing kitchen are pulled in the background. Fresh stock will automatically adjust local POS quantities and mirror bakery items directly to saleable Menu Items.
            </div>
          </div>

        </div>
      </div>

      {/* New Product Setup Modal */}
      {isNewItemModalOpen && newItemConfig && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-[#1a1c23] rounded-2xl p-6 w-full max-w-md mx-4 border border-gray-800 shadow-2xl animate-scale-up">
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <h3 className="text-white font-bold flex items-center gap-2">
                <PlusCircle size={18} className="text-emerald-400" />
                New Product Transfer Setup
              </h3>
              <button onClick={() => setIsNewItemModalOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleNewItemSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] text-gray-400 font-bold mb-1.5 uppercase">Product Name</label>
                <input 
                  type="text"
                  value={newItemConfig.name}
                  onChange={(e) => setNewItemConfig({ ...newItemConfig, name: e.target.value })}
                  required
                  className="w-full text-xs px-3 py-2 bg-[#0f1014] border border-gray-800 rounded-lg text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-[10px] text-gray-400 font-bold mb-1.5 uppercase">Select POS Menu Category</label>
                <select 
                  value={newItemConfig.categoryId}
                  onChange={(e) => setNewItemConfig({ ...newItemConfig, categoryId: e.target.value })}
                  required
                  className="w-full text-xs px-3 py-2 bg-[#0f1014] border border-gray-800 rounded-lg text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="">-- Choose Category --</option>
                  {categories.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.group ? `(${c.group.name})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-gray-400 font-bold mb-1.5 uppercase">Selling Price (₹)</label>
                  <input 
                    type="number"
                    step="0.01"
                    min="0"
                    value={newItemConfig.price}
                    onChange={(e) => setNewItemConfig({ ...newItemConfig, price: Number(e.target.value) })}
                    required
                    className="w-full text-xs px-3 py-2 bg-[#0f1014] border border-gray-800 rounded-lg text-white focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-gray-400 font-bold mb-1.5 uppercase">Quantity to Transfer</label>
                  <input 
                    type="number"
                    min="1"
                    value={newItemConfig.qty}
                    onChange={(e) => setNewItemConfig({ ...newItemConfig, qty: Number(e.target.value) })}
                    required
                    className="w-full text-xs px-3 py-2 bg-[#0f1014] border border-gray-800 rounded-lg text-white focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 border border-gray-800 bg-[#0f1014] rounded-lg p-3">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 rounded-xl border border-dashed border-gray-700 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-purple-500 hover:bg-purple-500/5 transition-all overflow-hidden relative group shrink-0"
                >
                  {newItemConfig.image ? (
                    <div className="relative w-full h-full">
                      <img 
                        src={resolveImageUrl(newItemConfig.image)} 
                        alt="Preview" 
                        className="w-full h-full object-cover" 
                      />
                      <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Upload size={14} className="text-white" />
                        <span className="text-[8px] text-white uppercase font-bold mt-0.5">Upload</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-gray-500">
                      <Upload size={16} />
                      <span className="text-[8px] uppercase font-bold mt-1">Upload</span>
                    </div>
                  )}
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                </div>

                <div className="flex-1 space-y-2">
                  <div className="text-[10px] text-gray-400 font-bold uppercase">Product Image</div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="text-[10px] uppercase font-bold h-8 flex items-center justify-center"
                      onClick={() => setShowLibModal(true)}
                      icon={<ImageIcon size={12} />}
                    >
                      LIB
                    </Button>
                    {newItemConfig.image && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-[10px] uppercase font-bold h-8 border-rose-500/30 hover:border-rose-500 text-rose-400 flex items-center justify-center"
                        onClick={() => setNewItemConfig({ ...newItemConfig, image: '' })}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <div className="text-[9px] text-gray-500 truncate max-w-[200px]">
                    {newItemConfig.image || 'No image selected'}
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-gray-800">
                <button 
                  type="button" 
                  onClick={() => setIsNewItemModalOpen(false)} 
                  className="px-4 py-2 border border-gray-700 hover:bg-gray-800 text-gray-400 hover:text-white rounded-lg text-xs transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={dispatching}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                >
                  {dispatching ? 'Adding & Transferring...' : 'Add & Transfer Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showLibModal && newItemConfig && (
        <ImageLibraryModal 
          open={showLibModal} 
          onClose={() => setShowLibModal(false)} 
          onSelect={handleLibSelect} 
          defaultQuery={newItemConfig.name} 
          selectedUrl={newItemConfig.image} 
        />
      )}

      {/* Settings Configuration Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-[#1a1c23] rounded-2xl p-6 w-full max-w-md mx-4 border border-gray-800 shadow-2xl animate-scale-up">
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <h3 className="text-white font-bold flex items-center gap-2">
                <Settings size={18} className="text-purple-400" />
                Configure ERP Connection
              </h3>
              <button onClick={() => setSettingsOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div>
                <label className="block text-[10px] text-gray-400 font-bold mb-1.5 uppercase">ERP Base URL</label>
                <input 
                  type="url"
                  placeholder="https://manufacturing-api.example.com"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  required
                  className="w-full text-xs px-3 py-2 bg-[#0f1014] border border-gray-800 rounded-lg text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-[10px] text-gray-400 font-bold mb-1.5 uppercase flex justify-between">
                  <span>API Connection Key</span>
                  {config?.hasApiKey && <span className="text-emerald-400 lowercase font-medium">currently configured</span>}
                </label>
                <input 
                  type="password"
                  placeholder={config?.hasApiKey ? "••••••••••••••••••••" : "Paste connection API key"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  required={!config?.hasApiKey}
                  className="w-full text-xs px-3 py-2 bg-[#0f1014] border border-gray-800 rounded-lg text-white focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-gray-800">
                <button 
                  type="button" 
                  onClick={() => setSettingsOpen(false)} 
                  className="px-4 py-2 border border-gray-700 hover:bg-gray-800 text-gray-400 hover:text-white rounded-lg text-xs transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-colors"
                >
                  Save Connection Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
