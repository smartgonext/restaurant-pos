import { useState, useEffect } from 'react';
import { X, Upload, Sparkles, QrCode } from 'lucide-react';
import api from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from './ToastProvider';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  editItem?: any | null;
}

export default function ItemFormModal({ isOpen, onClose, editItem }: Props) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [unitId, setUnitId] = useState<number | ''>('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [thresholdQty, setThresholdQty] = useState<number>(0);
  const [initialStock, setInitialStock] = useState<number>(0);
  const [costPerUnit, setCostPerUnit] = useState<number>(0);
  const [image, setImage] = useState('');
  
  // MRP Pricing Brackets
  const [mrps, setMrps] = useState<any[]>([]);
  const [mrpExpanded, setMrpExpanded] = useState(true);

  const { data: categories = [] } = useQuery({ queryKey: ['inventory-categories'], queryFn: () => api.get('/restaurant/inventory/categories').then(r => r.data.data) });
  const { data: units = [] } = useQuery({ queryKey: ['inventory-units'], queryFn: () => api.get('/restaurant/inventory/units').then(r => r.data.data) });
  const { data: suppliers = [] } = useQuery({ queryKey: ['inventory-suppliers'], queryFn: () => api.get('/restaurant/inventory/suppliers').then(r => r.data.data) });

  useEffect(() => {
    if (editItem) {
      setName(editItem.name || '');
      setCategoryId(editItem.categoryId || '');
      setUnitId(editItem.unitId || '');
      setSku(editItem.sku || '');
      setBarcode(editItem.barcode || '');
      setThresholdQty(editItem.thresholdQty || 0);
      setCostPerUnit(editItem.costPerUnit || 0);
      setImage(editItem.image || '');
      setMrps(editItem.inventoryMRPs || []);
    } else {
      setName('');
      setCategoryId('');
      setUnitId('');
      setSku('');
      setBarcode('');
      setThresholdQty(0);
      setInitialStock(0);
      setCostPerUnit(0);
      setImage('');
      setMrps([]);
    }
  }, [editItem, isOpen]);

  if (!isOpen) return null;

  const handleCreateCategory = async () => {
    const cname = prompt('Enter new category name:');
    if (!cname) return;
    try {
      const res = await api.post('/restaurant/inventory/categories', { name: cname });
      showToast('success', 'Category Created', `Category "${cname}" created successfully.`);
      qc.invalidateQueries({ queryKey: ['inventory-categories'] });
      setCategoryId(res.data.data.id);
    } catch (err: any) {
      showToast('error', 'Error', err?.response?.data?.error || 'Failed to create category');
    }
  };

  const handleCreateUnit = async () => {
    const uname = prompt('Enter new unit name (e.g. Kilogram):');
    if (!uname) return;
    const usym = prompt('Enter unit symbol (e.g. kg):');
    if (!usym) return;
    try {
      const res = await api.post('/restaurant/inventory/units', { name: uname, symbol: usym });
      showToast('success', 'Unit Created', `Unit "${uname}" created successfully.`);
      qc.invalidateQueries({ queryKey: ['inventory-units'] });
      setUnitId(res.data.data.id);
    } catch (err: any) {
      showToast('error', 'Error', err?.response?.data?.error || 'Failed to create unit');
    }
  };

  const generateSku = () => {
    const initials = name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 3);
    const timestamp = Date.now().toString().slice(-4);
    setSku(`${initials || 'RAW'}-${timestamp}`);
  };

  const addPricingBracket = () => {
    setMrps([...mrps, { supplierId: undefined, mrp: 0, purchaseRate: 0, profitPercent: 0 }]);
  };

  const updatePricingBracket = (index: number, key: string, value: any) => {
    const list = [...mrps];
    list[index][key] = value;
    if (key === 'purchaseRate' || key === 'profitPercent') {
      const pr = Number(list[index].purchaseRate || 0);
      const pp = Number(list[index].profitPercent || 0);
      list[index].sellingPrice = pr * (1 + pp / 100);
    }
    setMrps(list);
  };

  const removePricingBracket = (index: number) => {
    setMrps(mrps.filter((_, i) => i !== index));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !categoryId || !unitId) {
      showToast('error', 'Validation Failed', 'Item name, category, and unit are required fields.');
      return;
    }

    const payload = {
      name,
      categoryId: Number(categoryId),
      unitId: Number(unitId),
      sku: sku || undefined,
      barcode: barcode || undefined,
      thresholdQty: Number(thresholdQty),
      initialStock: editItem ? undefined : Number(initialStock),
      costPerUnit: Number(costPerUnit),
      image: image || undefined,
      mrps: mrps.map(m => ({
        supplierId: m.supplierId ? Number(m.supplierId) : undefined,
        mrp: Number(m.mrp || 0),
        purchaseRate: Number(m.purchaseRate || 0),
        profitPercent: Number(m.profitPercent || 0)
      }))
    };

    try {
      if (editItem) {
        await api.put(`/restaurant/inventory/items/${editItem.id}`, payload);
        showToast('success', 'Item Updated', `"${name}" updated successfully.`);
      } else {
        await api.post('/restaurant/inventory/items', payload);
        showToast('success', 'Item Created', `"${name}" created successfully.`);
      }
      qc.invalidateQueries({ queryKey: ['inventory-items'] });
      onClose();
    } catch (err: any) {
      showToast('error', 'Save Failed', err?.response?.data?.error || err?.message || 'Error occurred while saving item.');
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'relative', width: 520, background: 'var(--bg-primary)',
        height: '100%', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
        animation: 'slideIn 300ms ease-out', borderLeft: '1px solid var(--border)',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{editItem ? '✏️ Edit Raw Material' : '📦 Add New Raw Material'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSave} style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* SECTION 1 - Basic Info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', letterSpacing: '0.04em' }}>SECTION 1: BASIC INFORMATION</div>
            
            <div style={{ display: 'flex', gap: 14 }}>
              <div style={{
                width: 100, height: 100, border: '2px dashed var(--border)', borderRadius: 10,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', background: 'rgba(0,0,0,0.2)', gap: 6, position: 'relative', overflow: 'hidden'
              }} onClick={() => {
                const url = prompt('Enter relative or absolute image URL:');
                if (url) setImage(url);
              }}>
                {image ? (
                  <img src={image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <>
                    <Upload size={18} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Upload URL</span>
                  </>
                )}
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>Item Name *</label>
                <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Whole Milk 1L"
                  style={{ height: 36, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 12px', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>Category *</label>
                  <button type="button" onClick={handleCreateCategory} style={{ fontSize: 9, color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer' }}>+ Create new</button>
                </div>
                <select value={categoryId} onChange={e => setCategoryId(Number(e.target.value))} required
                  style={{ height: 36, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', color: 'var(--text)', fontSize: 12, outline: 'none' }}>
                  <option value="">Select Category</option>
                  {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>Unit *</label>
                  <button type="button" onClick={handleCreateUnit} style={{ fontSize: 9, color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer' }}>+ Create new</button>
                </div>
                <select value={unitId} onChange={e => setUnitId(Number(e.target.value))} required
                  style={{ height: 36, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', color: 'var(--text)', fontSize: 12, outline: 'none' }}>
                  <option value="">Select Unit</option>
                  {units.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>SKU (Optional)</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={sku} onChange={e => setSku(e.target.value)} placeholder="e.g. MLK-1002"
                    style={{ flex: 1, height: 36, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 12px', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
                  <button type="button" onClick={generateSku} style={{ height: 36, width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 8, cursor: 'pointer', color: '#a78bfa' }} title="Generate SKU">
                    <Sparkles size={14} />
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>Barcode (Optional)</label>
                <div style={{ position: 'relative' }}>
                  <input value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="Scan or enter code"
                    style={{ width: '100%', height: 36, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 32px 0 12px', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
                  <QrCode size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2 - Stock Settings */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', letterSpacing: '0.04em' }}>SECTION 2: STOCK & COST SETTINGS</div>
            
            <div style={{ display: 'grid', gridTemplateColumns: editItem ? '1fr 1fr' : '1fr 1fr 1fr', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>Threshold Qty</label>
                <input type="number" step="any" value={thresholdQty} onChange={e => setThresholdQty(Number(e.target.value))}
                  style={{ height: 36, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 12px', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
              </div>
              {!editItem && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>Initial Stock</label>
                  <input type="number" step="any" value={initialStock} onChange={e => setInitialStock(Number(e.target.value))}
                    style={{ height: 36, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 12px', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>Cost Per Unit (₹)</label>
                <input type="number" step="any" value={costPerUnit} onChange={e => setCostPerUnit(Number(e.target.value))}
                  style={{ height: 36, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 12px', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
              </div>
            </div>
          </div>

          {/* SECTION 3 - Collapsible Supplier Pricing / MRP */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <button type="button" onClick={() => setMrpExpanded(!mrpExpanded)}
              style={{ width: '100%', padding: '12px 14px', background: 'rgba(0,0,0,0.2)', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', color: 'var(--text)', fontSize: 11, fontWeight: 700 }}>
              <span>📝 SUPPLIER PRICING / MRP BRACKETS ({mrps.length})</span>
              <span>{mrpExpanded ? '▲' : '▼'}</span>
            </button>
            {mrpExpanded && (
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {mrps.map((m, idx) => {
                  const sp = Number(m.purchaseRate || 0) * (1 + Number(m.profitPercent || 0) / 100);
                  return (
                    <div key={idx} style={{ padding: 10, background: 'rgba(0,0,0,0.15)', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa' }}>Bracket #{idx + 1}</span>
                        <button type="button" onClick={() => removePricingBracket(idx)} style={{ fontSize: 9, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 8 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Supplier</span>
                          <select value={m.supplierId || ''} onChange={e => updatePricingBracket(idx, 'supplierId', e.target.value ? Number(e.target.value) : undefined)}
                            style={{ height: 28, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 6px', color: 'var(--text)', fontSize: 11, outline: 'none' }}>
                            <option value="">No Supplier (Global)</option>
                            {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Sticker MRP (₹)</span>
                          <input type="number" step="any" value={m.mrp || ''} onChange={e => updatePricingBracket(idx, 'mrp', Number(e.target.value))}
                            style={{ height: 28, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 8px', color: 'var(--text)', fontSize: 11, outline: 'none' }} />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Purchase Rate (₹)</span>
                          <input type="number" step="any" value={m.purchaseRate || ''} onChange={e => updatePricingBracket(idx, 'purchaseRate', Number(e.target.value))}
                            style={{ height: 28, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 8px', color: 'var(--text)', fontSize: 11, outline: 'none' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Profit Margin (%)</span>
                          <input type="number" step="any" value={m.profitPercent || ''} onChange={e => updatePricingBracket(idx, 'profitPercent', Number(e.target.value))}
                            style={{ height: 28, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 8px', color: 'var(--text)', fontSize: 11, outline: 'none' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Calculated Sell (₹)</span>
                          <div style={{ height: 28, display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 8px', color: '#10b981', fontSize: 11, fontWeight: 700 }}>
                            {sp.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <button type="button" onClick={addPricingBracket}
                  style={{ width: '100%', height: 32, background: 'rgba(124,58,237,0.12)', border: '1px dashed rgba(124,58,237,0.4)', borderRadius: 8, color: '#a78bfa', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  + Add Supplier Pricing Bracket
                </button>
              </div>
            )}
          </div>

          {/* Footer Action Buttons */}
          <div style={{ display: 'flex', gap: 10, marginTop: 'auto', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, height: 38, background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              Cancel
            </button>
            <button type="submit"
              style={{ flex: 1, height: 38, background: '#7c3aed', border: 'none', borderRadius: 8, color: 'var(--text)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              Save Item
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
