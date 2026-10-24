import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { GitBranch, ArrowLeftRight, Check, X } from 'lucide-react';
import { useToast } from '@/components/inventory/ToastProvider';

export default function BranchStockPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  
  // States
  const [selectedBranchId, setSelectedBranchId] = useState<number | 'Warehouse'>('Warehouse');
  const [transferItem, setTransferItem] = useState<any | null>(null);
  
  // Transfer modal fields
  const [targetBranchId, setTargetBranchId] = useState<number | 'Warehouse'>('Warehouse');
  const [transferQty, setTransferQty] = useState<number | ''>('');
  const [transferNote, setTransferNote] = useState('');

  // Queries
  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: () => api.get('/restaurant/branches').then(r => r.data.data).catch(() => []) });
  const { data: items = [], isLoading } = useQuery({ queryKey: ['inventory-items'], queryFn: () => api.get('/restaurant/inventory/items').then(r => r.data.data) });

  // Transfer stock mutation
  const transferMutation = useMutation({
    mutationFn: ({ itemId, payload }: { itemId: number; payload: any }) =>
      api.post(`/restaurant/inventory/items/${itemId}/movements`, payload),
    onSuccess: () => {
      showToast('success', 'Transfer Completed', 'Materials transferred successfully.');
      setTransferItem(null);
      setTransferQty('');
      setTransferNote('');
      qc.invalidateQueries({ queryKey: ['inventory-items'] });
    },
    onError: (err: any) => {
      showToast('error', 'Transfer Failed', err?.response?.data?.error || 'Failed to dispatch material transfer.');
    }
  });

  const getStockStatus = (stock: number, threshold: number) => {
    if (stock === 0) return { label: 'Empty', bg: 'rgba(239,68,68,0.1)', color: '#ef4444' };
    if (stock < threshold) return { label: 'Low', bg: 'rgba(245,158,11,0.1)', color: '#f59e0b' };
    return { label: 'Adequate', bg: 'rgba(16,185,129,0.1)', color: '#10b981' };
  };

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferQty || Number(transferQty) <= 0) return showToast('error', 'Invalid Qty', 'Please enter a transfer amount.');

    const source = selectedBranchId === 'Warehouse' ? undefined : Number(selectedBranchId);
    const dest = targetBranchId === 'Warehouse' ? undefined : Number(targetBranchId);

    if (source === dest) return showToast('error', 'Same Branch', 'Source and destination branches cannot be identical.');

    transferMutation.mutate({
      itemId: transferItem.id,
      payload: {
        type: 'transfer',
        quantity: Number(transferQty),
        sourceBranchId: source,
        destBranchId: dest,
        note: transferNote || 'Internal branch transfer'
      }
    });
  };

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Title Header */}
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Multi-Branch Stock Manager</h1>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>Monitor material partitions across branches and schedule internal stock transfers</p>
      </div>

      {/* Branch Selector Tabs */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
        <button onClick={() => setSelectedBranchId('Warehouse')}
          style={{
            height: 28, padding: '0 12px', fontSize: 10, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer',
            background: selectedBranchId === 'Warehouse' ? '#7c3aed' : 'rgba(255,255,255,0.02)',
            color: selectedBranchId === 'Warehouse' ? '#fff' : 'var(--text-muted)'
          }}>
          🏢 Main Warehouse
        </button>
        {branches.map((b: any) => (
          <button key={b.id} onClick={() => setSelectedBranchId(b.id)}
            style={{
              height: 28, padding: '0 12px', fontSize: 10, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer',
              background: selectedBranchId === b.id ? '#7c3aed' : 'rgba(255,255,255,0.02)',
              color: selectedBranchId === b.id ? '#fff' : 'var(--text-muted)'
            }}>
            📍 {b.name}
          </button>
        ))}
      </div>

      {/* STOCKS TABLE */}
      {isLoading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>Loading branch metrics...</div>
      ) : (
        <div style={{
          background: 'rgba(var(--bg-secondary-rgb), 0.3)', border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto', maxHeight: 'calc(100vh - 220px)', overflowY: 'auto'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid var(--border)' }}>
                {['Item Name', 'Category', 'Unit', 'Branch Stock', 'Global Stock pool', 'Share of Total', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 10 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it: any) => {
                // Resolve branch stock from BranchStock sub-relations
                let branchStock = 0;
                if (selectedBranchId === 'Warehouse') {
                  // Standard inventory item currentStock
                  branchStock = Number(it.currentStock || 0);
                } else {
                  const bs = (it.branchStocks || []).find((b: any) => b.branchId === selectedBranchId);
                  branchStock = bs ? Number(bs.quantity || 0) : 0;
                }

                const globalStock = Number(it.currentStock || 0);
                const share = globalStock > 0 ? (branchStock / globalStock) * 100 : 0;
                const threshold = Number(it.thresholdQty || 0);
                const status = getStockStatus(branchStock, threshold);

                return (
                  <tr key={it.id} style={{ borderBottom: '1px solid rgba(42,45,62,0.5)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--text)' }}>{it.name}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{it.category?.name || '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{it.unit?.name || '—'}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 900, color: 'var(--text)', fontFamily: 'monospace' }}>
                      {branchStock.toFixed(1)} {it.unit?.symbol}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {globalStock.toFixed(1)} {it.unit?.symbol}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${share}%`, height: '100%', background: '#7c3aed' }} />
                        </div>
                        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{share.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        display: 'inline-flex', padding: '2px 8px', borderRadius: 20, fontSize: 9, fontWeight: 700,
                        background: status.bg, color: status.color
                      }}>{status.label}</span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <button onClick={() => setTransferItem(it)}
                        style={{
                          height: 24, padding: '0 10px', background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)',
                          borderRadius: 6, color: '#a78bfa', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 4
                        }}>
                        <ArrowLeftRight size={10} /> Transfer
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* INTERNAL STOCK TRANSFER MODAL */}
      {transferItem && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setTransferItem(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }} />
          <form onSubmit={handleTransferSubmit} style={{
            position: 'relative', width: 400, background: 'var(--bg-primary)', borderRadius: 14, border: '1px solid var(--border)',
            padding: 20, boxShadow: '0 20px 48px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: 14
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--text)' }}>Schedule Stock Transfer</span>
              <button type="button" onClick={() => setTransferItem(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Transferring Material</span>
              <span style={{ fontSize: 12, fontWeight: 750, color: 'var(--text)' }}>{transferItem.name}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>From (Source)</span>
                <div style={{ height: 32, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 6, display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 11, color: 'var(--text-secondary)' }}>
                  {selectedBranchId === 'Warehouse' ? '🏢 Main Warehouse' : `📍 Branch #${selectedBranchId}`}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>To (Destination) *</label>
                <select value={targetBranchId} onChange={e => setTargetBranchId(e.target.value === 'Warehouse' ? 'Warehouse' : Number(e.target.value))}
                  style={{ height: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 8px', color: 'var(--text)', fontSize: 11, outline: 'none' }}>
                  <option value="Warehouse">🏢 Main Warehouse</option>
                  {branches.map((b: any) => <option key={b.id} value={b.id}>📍 {b.name}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Quantity to Transfer *</label>
              <input type="number" step="any" required value={transferQty} onChange={e => setTransferQty(e.target.value ? Number(e.target.value) : '')} placeholder={`Max available: ${selectedBranchId === 'Warehouse' ? Number(transferItem.currentStock || 0) : Number((transferItem.branchStocks || []).find((b: any) => b.branchId === selectedBranchId)?.quantity || 0)}`}
                style={{ height: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 10px', color: 'var(--text)', fontSize: 11, outline: 'none' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Transfer Notes</label>
              <input value={transferNote} onChange={e => setTransferNote(e.target.value)} placeholder="e.g. Replenishing branch stock"
                style={{ height: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 10px', color: 'var(--text)', fontSize: 11, outline: 'none' }} />
            </div>

            <div style={{ display: 'flex', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
              <button type="button" onClick={() => setTransferItem(null)}
                style={{ flex: 1, height: 34, background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                Cancel
              </button>
              <button type="submit"
                style={{ flex: 1, height: 34, background: '#7c3aed', border: 'none', borderRadius: 6, color: 'var(--text)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                Execute Transfer
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
