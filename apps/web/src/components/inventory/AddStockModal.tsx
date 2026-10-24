import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import api from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from './ToastProvider';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  item: any | null;
}

type MoveType = 'purchase' | 'sale' | 'waste' | 'transfer' | 'adjust' | 'damage';

export default function AddStockModal({ isOpen, onClose, item }: Props) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [type, setType] = useState<MoveType>('purchase');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [newTotalStock, setNewTotalStock] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [sourceBranchId, setSourceBranchId] = useState<number | ''>('');
  const [destBranchId, setDestBranchId] = useState<number | ''>('');

  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: () => api.get('/restaurant/branches').then(r => r.data.data).catch(() => []) });

  useEffect(() => {
    if (item) {
      setQuantity('');
      setNewTotalStock('');
      setNote('');
      setType('purchase');
      setDate(new Date().toISOString().split('T')[0]);
      setSourceBranchId('');
      setDestBranchId('');
    }
  }, [item, isOpen]);

  if (!isOpen || !item) return null;

  // Stock Delta live calculation
  const curStock = Number(item.currentStock || 0);
  let delta = 0;
  if (type === 'adjust') {
    delta = newTotalStock !== '' ? Number(newTotalStock) - curStock : 0;
  } else {
    const qtyVal = Number(quantity || 0);
    if (['purchase', 'transfer'].includes(type)) {
      delta = qtyVal;
    } else {
      delta = -qtyVal;
    }
  }

  const finalStock = curStock + delta;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const qtyVal = type === 'adjust' ? Math.abs(delta) : Number(quantity || 0);
    if (qtyVal <= 0 && type !== 'adjust') {
      showToast('error', 'Invalid Quantity', 'Please enter a positive value.');
      return;
    }

    const mType = type === 'adjust' ? (delta >= 0 ? 'purchase' : 'waste') : type;

    try {
      await api.post(`/restaurant/inventory/items/${item.id}/movements`, {
        type: mType,
        quantity: qtyVal,
        note: note || undefined,
        createdAt: date ? new Date(date).toISOString() : undefined,
        sourceBranchId: sourceBranchId ? Number(sourceBranchId) : undefined,
        destBranchId: destBranchId ? Number(destBranchId) : undefined,
      });

      showToast('success', 'Stock Movement Recorded', `Successfully logged stock adjustment for "${item.name}".`);
      qc.invalidateQueries({ queryKey: ['inventory-items'] });
      qc.invalidateQueries({ queryKey: ['inv-movements'] });
      onClose();
    } catch (err: any) {
      showToast('error', 'Adjustment Failed', err?.response?.data?.error || 'Failed to register manual stock movement.');
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'relative', width: 480, background: 'var(--bg-primary)',
        borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'scaleIn 200ms ease-out'
      }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>📦 Adjust Raw Stock</span>
            <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 6px', color: 'var(--text-secondary)' }}>
              Current: {curStock.toFixed(1)} {item.unit?.symbol}
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{item.name}</div>

          {/* Movement Type - Custom Segmented Control */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>Adjustment Action</label>
            <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.2)', padding: 4, borderRadius: 8 }}>
              {([
                { id: 'purchase', label: '📥 Add Stock' },
                { id: 'waste', label: '🗑 Waste' },
                { id: 'adjust', label: '♻ Adjust' },
                { id: 'damage', label: '💥 Damage' }
              ] as const).map(tab => (
                <button key={tab.id} type="button" onClick={() => setType(tab.id as MoveType)}
                  style={{
                    flex: 1, height: 28, border: 'none', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                    background: type === tab.id ? '#7c3aed' : 'transparent',
                    color: type === tab.id ? '#fff' : 'var(--text-muted)',
                    transition: 'all 150ms'
                  }}>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quantity Fields */}
          {type === 'adjust' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>New Total Stock ({item.unit?.symbol})</label>
              <input type="number" step="any" required value={newTotalStock} onChange={e => setNewTotalStock(e.target.value ? Number(e.target.value) : '')} placeholder="Enter absolute target stock"
                style={{ height: 36, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 12px', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>Quantity to Change ({item.unit?.symbol}) *</label>
              <input type="number" step="any" required value={quantity} onChange={e => setQuantity(e.target.value ? Number(e.target.value) : '')} placeholder="e.g. 10.5"
                style={{ height: 36, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 12px', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
            </div>
          )}

          {/* Branch Selectors (Optional) */}
          {branches.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>Source Branch</label>
                <select value={sourceBranchId} onChange={e => setSourceBranchId(e.target.value ? Number(e.target.value) : '')}
                  style={{ height: 36, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', color: 'var(--text)', fontSize: 12, outline: 'none' }}>
                  <option value="">Standard Warehouse</option>
                  {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>Destination Branch</label>
                <select value={destBranchId} onChange={e => setDestBranchId(e.target.value ? Number(e.target.value) : '')}
                  style={{ height: 36, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', color: 'var(--text)', fontSize: 12, outline: 'none' }}>
                  <option value="">Not Transferred</option>
                  {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Note / Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>Adjustment Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                style={{ height: 36, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>Ref / Remarks</label>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="Reason for change"
                style={{ height: 36, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 12px', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
            </div>
          </div>

          {/* Live Preview Display */}
          <div style={{
            background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px',
            display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
              <span>Current On-Hand:</span>
              <span style={{ fontWeight: 600 }}>{curStock.toFixed(2)} {item.unit?.symbol}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: delta >= 0 ? '#10b981' : '#ef4444' }}>
              <span>Quantity Shift:</span>
              <span style={{ fontWeight: 700 }}>{delta >= 0 ? '+' : ''}{delta.toFixed(2)} {item.unit?.symbol}</span>
            </div>
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
              <span>New On-Hand Total:</span>
              <span style={{ color: finalStock >= item.thresholdQty ? '#10b981' : '#ef4444' }}>{finalStock.toFixed(2)} {item.unit?.symbol}</span>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, height: 36, background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
              Cancel
            </button>
            <button type="submit"
              style={{ flex: 1, height: 36, background: '#7c3aed', border: 'none', borderRadius: 8, color: 'var(--text)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
              Record Movement
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
