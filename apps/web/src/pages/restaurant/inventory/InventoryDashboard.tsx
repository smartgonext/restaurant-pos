import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { AlertTriangle, TrendingUp, Package, DollarSign, ShoppingCart, Clock, ArrowUp, ArrowDown, RefreshCw, Truck } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  onNavigate: (view: any) => void;
  onQuickAction?: (action: string) => void;
}

function KpiCard({ label, value, icon, color, trend, trendLabel }: any) {
  return (
    <div style={{
      background: 'rgba(var(--bg-secondary-rgb), 0.8)', backdropFilter: 'blur(12px)',
      border: '1px solid var(--border)', borderRadius: 14,
      padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10,
      transition: 'box-shadow 300ms',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>{label}</span>
        <span style={{ color, opacity: 0.7 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
      {trend !== undefined && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: trend > 0 ? 'rgba(16,185,129,0.1)' : trend < 0 ? 'rgba(239,68,68,0.1)' : 'rgba(156,163,175,0.1)',
          color: trend > 0 ? '#10b981' : trend < 0 ? '#ef4444' : '#9ca3af',
          borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 700,
          width: 'fit-content',
        }}>
          {trend > 0 ? <ArrowUp size={10} /> : trend < 0 ? <ArrowDown size={10} /> : null}
          {trendLabel}
        </div>
      )}
    </div>
  );
}

function UrgencyBar({ current, threshold }: { current: number; threshold: number }) {
  const pct = threshold > 0 ? Math.min(100, (current / threshold) * 100) : 0;
  const color = pct < 50 ? '#ef4444' : pct < 80 ? '#f59e0b' : '#10b981';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--bg-hover)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 600ms ease' }} />
      </div>
      <span style={{ fontSize: 10, color, fontWeight: 700, minWidth: 32 }}>{pct.toFixed(0)}%</span>
    </div>
  );
}

function RelTime({ ts }: { ts: string | number }) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  const label = s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
  return <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</span>;
}

function StockReconciler({ items, queryClient }: { items: any[]; queryClient: any }) {
  const [selectedItemId, setSelectedItemId] = useState<number | ''>('');
  const [physicalCount, setPhysicalCount] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedItem = items.find(it => it.id === Number(selectedItemId));
  const systemStock = selectedItem ? Number(selectedItem.currentStock) : 0;
  const unitSymbol = selectedItem ? selectedItem.unit?.symbol || '' : '';
  const discrepancy = selectedItemId !== '' && physicalCount !== '' ? Number(physicalCount) - systemStock : null;

  const handleReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedItemId === '' || physicalCount === '') {
      toast.error('Please select an item and enter the physical count');
      return;
    }
    if (discrepancy === null || discrepancy === 0) {
      toast.error('No discrepancy to reconcile');
      return;
    }

    setIsSubmitting(true);
    try {
      const type = discrepancy > 0 ? 'adjustment' : 'waste';
      const quantity = Math.abs(discrepancy);
      const payload = {
        type,
        quantity,
        note: note || `Manual stock reconciliation correction (${discrepancy > 0 ? 'Surplus' : 'Shortage'})`
      };

      await api.post(`/restaurant/inventory/items/${selectedItemId}/movements`, payload);
      
      toast.success('Stock reconciled successfully!');
      setSelectedItemId('');
      setPhysicalCount('');
      setNote('');
      
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['inv-summary'] });
      queryClient.invalidateQueries({ queryKey: ['inv-movements'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to apply reconciliation');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      background: 'rgba(var(--bg-secondary-rgb), 0.8)', backdropFilter: 'blur(12px)',
      border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden',
      height: '100%', display: 'flex', flexDirection: 'column'
    }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <RefreshCw size={15} style={{ color: '#7c3aed' }} />
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>Stock Reconciler</span>
      </div>
      <form onSubmit={handleReconcile} style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Select Inventory Item</label>
          <select 
            value={selectedItemId} 
            onChange={(e) => { setSelectedItemId(e.target.value ? Number(e.target.value) : ''); setPhysicalCount(''); }}
            style={{
              background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '8px 10px', fontSize: 12, color: 'var(--text-primary)', outline: 'none'
            }}
          >
            <option value="">-- Select Item --</option>
            {items.map(it => (
              <option key={it.id} value={it.id}>{it.name} ({Number(it.currentStock).toFixed(1)} {it.unit?.symbol})</option>
            ))}
          </select>
        </div>

        {selectedItem && (
          <div style={{
            background: 'rgba(0,0,0,0.15)', borderRadius: 10, padding: '10px 12px',
            display: 'flex', flexDirection: 'column', gap: 8
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: 'var(--text-muted)' }}>System Stock:</span>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                {systemStock.toFixed(1)} {unitSymbol}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Physical Count</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input 
                  type="number" 
                  step="0.01"
                  placeholder="0.00"
                  value={physicalCount}
                  onChange={(e) => setPhysicalCount(e.target.value)}
                  style={{
                    background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 6,
                    padding: '6px 8px', fontSize: 12, color: 'var(--text-primary)', outline: 'none',
                    width: '100px', fontFamily: 'monospace'
                  }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{unitSymbol}</span>
              </div>
            </div>

            {discrepancy !== null && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 11
              }}>
                <span style={{ color: 'var(--text-muted)' }}>Discrepancy:</span>
                {discrepancy === 0 ? (
                  <span style={{ color: '#10b981', fontWeight: 700 }}>None</span>
                ) : discrepancy > 0 ? (
                  <span style={{ color: '#10b981', fontWeight: 700 }}>
                    +{discrepancy.toFixed(2)} {unitSymbol} (Surplus)
                  </span>
                ) : (
                  <span style={{ color: '#ef4444', fontWeight: 700 }}>
                    {discrepancy.toFixed(2)} {unitSymbol} (Shortage)
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Reconciliation Reason / Note</label>
          <textarea 
            placeholder="e.g. Damaged during transfer / counting error"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            style={{
              background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '8px 10px', fontSize: 11, color: 'var(--text-primary)', outline: 'none',
              resize: 'none', fontFamily: 'inherit'
            }}
          />
        </div>

        <button 
          type="submit"
          disabled={isSubmitting || selectedItemId === '' || physicalCount === '' || discrepancy === 0}
          style={{
            background: isSubmitting || discrepancy === 0 ? 'var(--bg-hover)' : 'linear-gradient(135deg, #7c3aed, #4f46e5)',
            border: 'none', borderRadius: 8, padding: '10px 14px', fontSize: 12, fontWeight: 700,
            color: '#fff', cursor: isSubmitting || discrepancy === 0 ? 'not-allowed' : 'pointer',
            textAlign: 'center', transition: 'opacity 200ms', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
          }}
        >
          {isSubmitting ? 'Posting...' : 'Apply Reconciliation'}
        </button>
      </form>
    </div>
  );
}

function TransitInventory({ transfers, items, branches }: { transfers: any[]; items: any[]; branches: any[] }) {
  const transitItemsMap: Record<number, { name: string; sku: string; qty: number; unit: string; transfers: any[] }> = {};
  
  transfers.forEach((t: any) => {
    if (t.status === 'shipped') {
      const fromBranch = branches.find((b: any) => b.id === t.fromBranchId)?.name || `Branch #${t.fromBranchId}`;
      const toBranch = branches.find((b: any) => b.id === t.toBranchId)?.name || `Branch #${t.toBranchId}`;
      
      t.items?.forEach((item: any) => {
        const invItem = items.find((it: any) => it.id === item.inventoryItemId);
        if (!invItem) return;
        
        if (!transitItemsMap[item.inventoryItemId]) {
          transitItemsMap[item.inventoryItemId] = {
            name: invItem.name,
            sku: invItem.sku || '—',
            qty: 0,
            unit: invItem.unit?.symbol || 'pcs',
            transfers: []
          };
        }
        transitItemsMap[item.inventoryItemId].qty += Number(item.quantityShipped);
        transitItemsMap[item.inventoryItemId].transfers.push({
          transferNumber: t.transferNumber,
          fromBranch,
          toBranch,
          qty: Number(item.quantityShipped),
          shippedAt: t.shippedAt
        });
      });
    }
  });

  const transitList = Object.values(transitItemsMap);

  return (
    <div style={{
      background: 'rgba(var(--bg-secondary-rgb), 0.8)', backdropFilter: 'blur(12px)',
      border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden',
      height: '100%', display: 'flex', flexDirection: 'column'
    }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Truck size={15} style={{ color: '#10b981' }} />
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>Transit Inventory</span>
      </div>
      <div style={{ overflowY: 'auto', flex: 1, maxHeight: '340px' }}>
        {transitList.length === 0 ? (
          <div style={{ padding: '32px 18px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            🚚 No items currently in transit
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
                {['Item Name', 'SKU', 'In Transit Qty', 'Transfers'].map(h => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 10 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transitList.map((item, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid rgba(42,45,62,0.5)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{item.sku}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#10b981', fontWeight: 700 }}>
                    {item.qty.toFixed(1)} {item.unit}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {item.transfers.map((tr, tIdx) => (
                        <div key={tIdx} style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{tr.transferNumber}</span>: {tr.qty} {item.unit} ({tr.fromBranch} → {tr.toBranch})
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const MOVE_COLORS: Record<string, string> = {
  purchase: '#10b981', sale: '#3b82f6', waste: '#ef4444',
  adjust: '#f59e0b', damage: '#f97316', transfer: '#a78bfa',
};

export default function InventoryDashboard({ onNavigate, onQuickAction }: Props) {
  const queryClient = useQueryClient();
  const { data: summary } = useQuery({
    queryKey: ['inv-summary'],
    queryFn: () => api.get('/restaurant/inventory/summary').then(r => r.data.data),
    refetchInterval: 30000,
  });
  const { data: items = [] } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: () => api.get('/restaurant/inventory/items').then(r => r.data.data),
  });
  const { data: transfers = [] } = useQuery({
    queryKey: ['production-transfers'],
    queryFn: () => api.get('/restaurant/production/transfers').then(r => r.data.data).catch(() => [])
  });
  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get('/restaurant/branches').then(r => r.data.data).catch(() => [])
  });
  const { data: pos = [] } = useQuery({
    queryKey: ['inventory-pos'],
    queryFn: () => api.get('/restaurant/inventory/purchase-orders').then(r => r.data.data),
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ['inventory-suppliers'],
    queryFn: () => api.get('/restaurant/inventory/suppliers').then(r => r.data.data),
  });
  const { data: movements = [] } = useQuery({
    queryKey: ['inv-movements'],
    queryFn: () => api.get('/restaurant/inventory/movements').then(r => r.data.data),
    refetchInterval: 15000,
  });

  const totalValuation = items.reduce((s: number, it: any) => s + Number(it.currentStock || 0) * Number(it.costPerUnit || 0), 0);
  const lowStock = items.filter((it: any) => Number(it.currentStock) <= Number(it.thresholdQty) && Number(it.thresholdQty) > 0);
  const pendingPOValue = pos.filter((o: any) => ['pending', 'sent'].includes(o.status)).reduce((s: number, o: any) => s + Number(o.total || 0), 0);

  const topSuppliers = [...suppliers]
    .sort((a: any, b: any) => Number(b.outstandingBalance || 0) - Number(a.outstandingBalance || 0))
    .slice(0, 5);

  const recentMovements = [...movements].slice(0, 15);

  const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Section 1 — KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KpiCard label="Total SKUs" value={items.length} icon={<Package size={20} />} color="#3b82f6" trend={0} trendLabel="Active items" />
        <KpiCard label="Total Valuation" value={fmt(totalValuation)} icon={<DollarSign size={20} />} color="#10b981" trend={1} trendLabel="In stock value" />
        <KpiCard label="Low Stock Items" value={lowStock.length} icon={<AlertTriangle size={20} />} color={lowStock.length > 0 ? '#ef4444' : '#10b981'} trend={lowStock.length > 0 ? -1 : 0} trendLabel={lowStock.length > 0 ? 'Needs attention' : 'All good'} />
        <KpiCard label="Pending PO Value" value={fmt(pendingPOValue)} icon={<ShoppingCart size={20} />} color="#f59e0b" trend={0} trendLabel={`${pos.filter((o: any) => o.status === 'pending').length} POs pending`} />
      </div>

      {/* Section 2 + 3 — Two Columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        {/* Low Stock Panel */}
        <div style={{ background: 'rgba(var(--bg-secondary-rgb), 0.8)', backdropFilter: 'blur(12px)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={15} style={{ color: '#f59e0b' }} />
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>⚠ Needs Reorder</span>
            <span style={{ marginLeft: 4, background: '#ef4444', color: 'var(--text)', fontSize: 9, fontWeight: 700, borderRadius: 10, padding: '2px 6px' }}>{lowStock.length}</span>
          </div>
          {lowStock.length === 0 ? (
            <div style={{ padding: '32px 18px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              ✅ All items above threshold
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
                    {['Item Name', 'Category', 'On Hand', 'Threshold', 'Urgency', ''].map(h => (
                      <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 10, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lowStock.slice(0, 8).map((it: any) => (
                    <tr key={it.id} style={{ borderBottom: '1px solid rgba(42,45,62,0.5)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{it.name}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{it.category?.name || '—'}</td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#ef4444', fontWeight: 700 }}>
                        {Number(it.currentStock).toFixed(1)} {it.unit?.symbol}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{Number(it.thresholdQty).toFixed(1)}</td>
                      <td style={{ padding: '10px 14px', minWidth: 120 }}>
                        <UrgencyBar current={Number(it.currentStock)} threshold={Number(it.thresholdQty)} />
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <button onClick={() => { onNavigate('purchase-orders'); onQuickAction?.('new-po'); }}
                          style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', color: '#a78bfa', borderRadius: 6, padding: '4px 8px', fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          Quick Reorder
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Activity Feed */}
        <div style={{ background: 'rgba(var(--bg-secondary-rgb), 0.8)', backdropFilter: 'blur(12px)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={14} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>Recent Activity</span>
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto', padding: '4px 0' }}>
            {recentMovements.length === 0 ? (
              <div style={{ padding: '24px 18px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>No recent movements</div>
            ) : recentMovements.map((m: any) => (
              <div key={m.id} style={{ padding: '8px 16px', borderBottom: '1px solid rgba(42,45,62,0.3)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{
                  background: (MOVE_COLORS[m.type] || '#9ca3af') + '22',
                  color: MOVE_COLORS[m.type] || '#9ca3af',
                  border: `1px solid ${(MOVE_COLORS[m.type] || '#9ca3af')}44`,
                  borderRadius: 6, padding: '2px 6px', fontSize: 9, fontWeight: 700, flexShrink: 0, textTransform: 'uppercase',
                }}>{m.type}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.3 }}>{m.item?.name || `Item #${m.itemId}`}</div>
                  <div style={{ fontSize: 10, color: m.quantity > 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                    {m.quantity > 0 ? '+' : ''}{m.quantity} {m.item?.unit?.symbol || ''}
                  </div>
                </div>
                <RelTime ts={m.createdAt} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section 3 — Stock Reconciler & Transit Inventory */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16 }}>
        <StockReconciler items={items} queryClient={queryClient} />
        <TransitInventory transfers={transfers} items={items} branches={branches} />
      </div>

      {/* Section 4 — Top Suppliers */}
      <div style={{ background: 'rgba(var(--bg-secondary-rgb), 0.8)', backdropFilter: 'blur(12px)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>Top Suppliers</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 0 }}>
          {topSuppliers.map((s: any, i) => {
            const over = s.creditLimit && Number(s.outstandingBalance) > Number(s.creditLimit);
            return (
              <div key={s.id} style={{
                padding: '14px 16px', borderRight: i < 4 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', background: '#7c3aed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 800, color: 'var(--text)', flexShrink: 0,
                  }}>{(s.name || '?').charAt(0).toUpperCase()}</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{s.name}</div>
                    <span style={{
                      fontSize: 9, padding: '1px 5px', borderRadius: 8, fontWeight: 700,
                      background: s.isActive ? 'rgba(16,185,129,0.15)' : 'rgba(156,163,175,0.15)',
                      color: s.isActive ? '#10b981' : '#9ca3af',
                    }}>{s.isActive ? 'Active' : 'Inactive'}</span>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Outstanding</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: over ? '#ef4444' : '#10b981' }}>
                  {fmt(Number(s.outstandingBalance || 0))}
                </div>
                {s.creditLimit && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    Limit: {fmt(Number(s.creditLimit))}
                  </div>
                )}
              </div>
            );
          })}
          {topSuppliers.length === 0 && (
            <div style={{ gridColumn: 'span 5', padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              No suppliers yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
