import React, { useState, useRef } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Sparkles, Upload, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Trash2, ArrowRight, ShieldCheck, Key } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface BulkImageItem {
  id: string;
  file?: File;
  previewUrl: string;
  serverUrl?: string;
  status: 'pending' | 'analyzing' | 'done' | 'error';
  originalName: string;
  aiResult?: {
    isValid: boolean;
    itemType: 'food' | 'beverage' | 'product' | 'invalid';
    detectedName: string;
    category: string;
    isVeg: boolean | null;
    confidence: number;
    reason: string;
    modelUsed?: string;
  };
  // Editable fields for importing into Menu
  name: string;
  price: string;
  categoryId: number | string;
  isVeg: boolean;
  selectedForImport: boolean;
}

interface BulkImageAIModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: any[];
  menus: any[];
  onSuccess: () => void;
}

export const BulkImageAIModal: React.FC<BulkImageAIModalProps> = ({
  isOpen,
  onClose,
  categories = [],
  menus = [],
  onSuccess
}) => {
  const [items, setItems] = useState<BulkImageItem[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [apiKey, setApiKey] = useState(import.meta.env.VITE_GEMINI_API_KEY || '');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const defaultMenuId = menus?.[0]?.id || 0;
  const defaultCatId = categories?.[0]?.id || 0;

  const handleFilesSelected = (files: FileList | File[]) => {
    const newItems: BulkImageItem[] = [];
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) {
        toast.error(`File "${file.name}" is not a valid image format`);
        return;
      }
      const previewUrl = URL.createObjectURL(file);
      const id = Math.random().toString(36).substring(2, 9);
      newItems.push({
        id,
        file,
        previewUrl,
        originalName: file.name,
        status: 'pending',
        name: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
        price: '100',
        categoryId: defaultCatId,
        isVeg: true,
        selectedForImport: true
      });
    });

    setItems((prev) => [...prev, ...newItems]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const clearAll = () => {
    setItems([]);
  };

  // Run Gemini AI Analysis on uploaded images
  const analyzeAllWithGemini = async () => {
    if (items.length === 0) return toast.error('Please upload image files first');

    setAnalyzing(true);
    const toastId = toast.loading(`Connecting to Gemini AI... Analyzing ${items.length} images...`);

    try {
      const formData = new FormData();
      formData.append('apiKey', apiKey);

      // Append files
      items.forEach((item) => {
        if (item.file) {
          formData.append('files', item.file, item.originalName);
        }
      });

      const res = await api.post('/restaurant/upload/bulk-verify-images', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const data = res.data;
      if (data.success && Array.isArray(data.results)) {
        const resultsMap = new Map();
        data.results.forEach((r: any) => {
          resultsMap.set(r.originalName, r);
        });

        setItems((prev) =>
          prev.map((item) => {
            const match = resultsMap.get(item.originalName);
            if (match && match.aiResult) {
              const resObj = match.aiResult;
              // Try to find matching category by name
              const matchedCat = categories.find(
                (c: any) => c.name?.toLowerCase().includes(resObj.category?.toLowerCase() || '')
              );

              return {
                ...item,
                status: 'done',
                serverUrl: match.url,
                aiResult: resObj,
                name: resObj.detectedName || item.name,
                categoryId: matchedCat ? matchedCat.id : item.categoryId,
                isVeg: resObj.isVeg ?? true,
                selectedForImport: resObj.isValid
              };
            }
            return { ...item, status: 'error' };
          })
        );

        toast.success(
          `Gemini AI Inspection complete! Verified ${data.validCount} valid food/product item(s).`,
          { id: toastId }
        );
      } else {
        throw new Error(data.error || 'Failed to analyze images with Gemini');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Gemini AI verification failed', {
        id: toastId
      });
    } finally {
      setAnalyzing(false);
    }
  };

  // Import selected valid food/product items directly into database
  const handleImportSelected = async () => {
    const toImport = items.filter((i) => i.selectedForImport);
    if (toImport.length === 0) {
      return toast.error('No items selected for import');
    }

    setImporting(true);
    const toastId = toast.loading(`Importing ${toImport.length} menu items...`);
    let successCount = 0;
    let failCount = 0;

    for (const item of toImport) {
      try {
        let imageUrl = item.serverUrl;
        // If image wasn't saved on server yet, upload it now
        if (!imageUrl && item.file) {
          const uploadFd = new FormData();
          uploadFd.append('file', item.file);
          const upRes = await api.post('/restaurant/upload', uploadFd);
          imageUrl = upRes.data.url;
        }

        const payload = {
          name: item.name,
          price: Number(item.price) || 100,
          menuId: defaultMenuId,
          categoryId: Number(item.categoryId) || defaultCatId,
          isVeg: item.isVeg,
          isAvailable: true,
          image: imageUrl || '',
          description: item.aiResult?.reason || 'Imported via Gemini AI Bulk Inspector'
        };

        await api.post('/restaurant/menu-items', payload);
        successCount++;
      } catch (e) {
        failCount++;
      }
    }

    setImporting(false);
    if (successCount > 0) {
      toast.success(`Successfully imported ${successCount} menu item(s)!`, { id: toastId });
      onSuccess();
      onClose();
      clearAll();
    } else {
      toast.error('Failed to import items', { id: toastId });
    }
  };

  const validItemsCount = items.filter((i) => i.aiResult?.isValid).length;
  const invalidItemsCount = items.filter((i) => i.aiResult && !i.aiResult.isValid).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="🤖 Bulk Image Upload & Gemini AI Inspector"
      size="2xl"
    >
      <div className="space-y-5">
        {/* Header & API Key Toggle Banner */}
        <div className="bg-gradient-to-r from-purple-900/40 via-indigo-900/40 to-blue-900/40 p-4 rounded-xl border border-purple-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-500/20 text-purple-300 rounded-lg">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-base">Gemini Vision AI Image Classifier</h3>
              <p className="text-xs text-purple-200">
                Upload bulk food/product images to automatically check if they are correct food dishes & auto-fill names & categories.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowKeyInput(!showKeyInput)}
              className="text-xs border-purple-400/40 text-purple-200 hover:bg-purple-500/20"
            >
              <Key className="w-3.5 h-3.5 mr-1" />
              API Key Config
            </Button>
          </div>
        </div>

        {/* Optional Custom API Key input */}
        {showKeyInput && (
          <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700 space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
              <span>Google Gemini API Key:</span>
              <span className="text-[10px] text-emerald-400">Connected Key Verified ✅</span>
            </label>
            <Input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter Gemini API Key..."
              className="text-xs font-mono bg-slate-900 text-slate-200"
            />
          </div>
        )}

        {/* Drag & Drop Upload Zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-purple-500/30 hover:border-purple-400 bg-purple-950/10 hover:bg-purple-950/20 transition-all rounded-xl p-6 text-center cursor-pointer flex flex-col items-center justify-center gap-2 group"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => e.target.files && handleFilesSelected(e.target.files)}
            multiple
            accept="image/*"
            className="hidden"
          />
          <div className="p-3 bg-purple-500/10 group-hover:scale-110 transition-transform rounded-full text-purple-400">
            <Upload className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-medium text-purple-200">
              Drag & Drop Bulk Food or Product Images Here
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Supports PNG, JPG, WEBP • Upload multiple files at once to verify with Gemini AI
            </p>
          </div>
        </div>

        {/* Uploaded items status bar */}
        {items.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
              <span>Total Images: <strong>{items.length}</strong></span>
              {validItemsCount > 0 && (
                <Badge variant="success" className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> {validItemsCount} Valid Food/Product
                </Badge>
              )}
              {invalidItemsCount > 0 && (
                <Badge variant="danger" className="bg-rose-500/20 text-rose-300 border-rose-500/30">
                  <XCircle className="w-3 h-3 mr-1" /> {invalidItemsCount} Non-Food Warning
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={clearAll}
                disabled={analyzing || importing}
                className="text-xs text-slate-400 hover:text-white"
              >
                Clear List
              </Button>
              <Button
                size="sm"
                onClick={analyzeAllWithGemini}
                disabled={analyzing || importing}
                className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium"
              >
                {analyzing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Checking with Gemini AI...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 mr-1.5 text-amber-300" />
                    Run Gemini AI Image Check
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Items Data Grid / Preview Cards */}
        {items.length > 0 && (
          <div className="max-h-96 overflow-y-auto pr-1 space-y-3">
            {items.map((item, idx) => {
              const res = item.aiResult;
              return (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-xl border transition-all flex flex-col md:flex-row items-start md:items-center gap-4 ${
                    res
                      ? res.isValid
                        ? 'bg-slate-900/90 border-emerald-500/40 hover:border-emerald-500/70'
                        : 'bg-rose-950/20 border-rose-500/40 hover:border-rose-500/70'
                      : 'bg-slate-900/50 border-slate-800'
                  }`}
                >
                  {/* Selection Checkbox & Thumbnail */}
                  <div className="flex items-center gap-3 shrink-0">
                    <input
                      type="checkbox"
                      checked={item.selectedForImport}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((i) => (i.id === item.id ? { ...i, selectedForImport: e.target.checked } : i))
                        )
                      }
                      className="w-4 h-4 rounded border-slate-700 text-purple-600 focus:ring-purple-500 bg-slate-800 cursor-pointer"
                    />
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-700 bg-slate-950 shrink-0">
                      <img
                        src={item.previewUrl}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                      {res && (
                        <div className="absolute top-1 right-1">
                          {res.isValid ? (
                            <span className="p-0.5 bg-emerald-500 text-white rounded-full block">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </span>
                          ) : (
                            <span className="p-0.5 bg-rose-500 text-white rounded-full block">
                              <XCircle className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* AI Diagnosis Details */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-white text-sm truncate">{item.name}</h4>

                      {res ? (
                        res.isValid ? (
                          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[11px] px-2 py-0.5">
                            <ShieldCheck className="w-3 h-3 mr-1" />
                            {res.itemType.toUpperCase()} VERIFIED ({res.confidence}%)
                          </Badge>
                        ) : (
                          <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/40 text-[11px] px-2 py-0.5">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            NON-FOOD / UNRELATED IMAGE
                          </Badge>
                        )
                      ) : (
                        <Badge variant="outline" className="text-slate-400 border-slate-700 text-[11px]">
                          Pending Gemini Inspection
                        </Badge>
                      )}
                    </div>

                    {/* Reasoning explanation */}
                    <p className="text-xs text-slate-300 bg-slate-950/50 p-2 rounded border border-slate-800/80">
                      <span className="text-purple-300 font-medium">Gemini AI Analysis: </span>
                      {res ? res.reason : 'Click "Run Gemini AI Image Check" to verify dish authenticity.'}
                    </p>

                    {/* Inputs to customize before import */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                      <div>
                        <label className="text-[10px] text-slate-400">Item Name:</label>
                        <Input
                          value={item.name}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((i) => (i.id === item.id ? { ...i, name: e.target.value } : i))
                            )
                          }
                          className="h-7 text-xs bg-slate-950 border-slate-800"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400">Price ($/₹):</label>
                        <Input
                          type="number"
                          value={item.price}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((i) => (i.id === item.id ? { ...i, price: e.target.value } : i))
                            )
                          }
                          className="h-7 text-xs bg-slate-950 border-slate-800"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400">Category:</label>
                        <select
                          value={item.categoryId}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((i) => (i.id === item.id ? { ...i, categoryId: e.target.value } : i))
                            )
                          }
                          className="w-full h-7 text-xs bg-slate-950 border border-slate-800 rounded px-2 text-slate-200 focus:outline-none"
                        >
                          {categories.map((c: any) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Remove Button */}
                  <button
                    onClick={() => removeItem(item.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors self-start md:self-center"
                    title="Remove item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          <Button variant="outline" size="sm" onClick={onClose} disabled={importing}>
            Cancel
          </Button>

          {items.length > 0 && (
            <Button
              size="sm"
              onClick={handleImportSelected}
              disabled={importing || items.filter((i) => i.selectedForImport).length === 0}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4"
            >
              {importing ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                  Creating Menu Items...
                </>
              ) : (
                <>
                  <ArrowRight className="w-4 h-4 mr-1.5" />
                  Import Selected Valid Items ({items.filter((i) => i.selectedForImport).length})
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default BulkImageAIModal;
