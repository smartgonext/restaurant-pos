import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import {
  Search, Plus, ChevronDown, ChevronUp, Check, DollarSign, Copy, XCircle, FileText
} from 'lucide-react';
import POCreationWizard from '@/components/inventory/POCreationWizard';
import { useToast } from '@/components/inventory/ToastProvider';

interface Props {
  quickAction?: string | null;
  onClearQuickAction?: () => void;
}

export default function PurchaseOrdersPage({ quickAction, onClearQuickAction }: Props) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [selectedSupplier, setSelectedSupplier] = useState('All');
  
  // Date range filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Expansion and Modals
  const [expandedPoId, setExpandedPoId] = useState<number | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  useEffect(() => {
    if (quickAction === 'new-po') {
      setWizardOpen(true);
      onClearQuickAction?.();
    }
  }, [quickAction]);
  const [paymentPo, setPaymentPo] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState<number | ''>('');
  const [payMethod, setPayMethod] = useState('Cash');

  // Queries
  const { data: pos = [], isLoading } = useQuery({
    queryKey: ['inventory-pos'],
    queryFn: () => api.get('/restaurant/inventory/purchase-orders').then(r => r.data.data)
  });
  const { data: suppliers = [] } = useQuery({ queryKey: ['inventory-suppliers'], queryFn: () => api.get('/restaurant/inventory/suppliers').then(r => r.data.data) });

  // Update Status Mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.put(`/restaurant/inventory/purchase-orders/${id}/status`, { status }),
    onSuccess: (_, variables) => {
      showToast('success', 'Status Updated', `PO status is now "${variables.status}".`);
      qc.invalidateQueries({ queryKey: ['inventory-pos'] });
      qc.invalidateQueries({ queryKey: ['inventory-items'] });
      qc.invalidateQueries({ queryKey: ['inventory-suppliers'] });
    },
    onError: (err: any) => {
      showToast('error', 'Status Change Failed', err?.response?.data?.error || 'Failed to update order status.');
    }
  });

  // Record Payment Mutation
  const payMutation = useMutation({
    mutationFn: ({ id, amount, method }: { id: number; amount: number; method: string }) =>
      api.post(`/restaurant/inventory/purchase-orders/${id}/payments`, { amount, method }),
    onSuccess: () => {
      showToast('success', 'Payment Recorded', 'Supplier outstanding balance adjusted successfully.');
      setPaymentPo(null);
      setPayAmount('');
      qc.invalidateQueries({ queryKey: ['inventory-pos'] });
      qc.invalidateQueries({ queryKey: ['inventory-suppliers'] });
    },
    onError: (err: any) => {
      showToast('error', 'Payment Failed', err?.response?.data?.error || 'Failed to add payment.');
    }
  });

  // Duplicate PO Mutation
  const duplicateMutation = useMutation({
    mutationFn: (po: any) =>
      api.post('/restaurant/inventory/purchase-orders', {
        supplierId: po.supplierId,
        note: `Duplicated from ${po.orderNumber}. ` + (po.note || ''),
        items: po.items.map((x: any) => ({
          inventoryItemId: x.inventoryItemId,
          quantity: x.quantity,
          unitCost: x.unitCost,
          taxPercent: x.taxPercent,
          discountPercent: x.discountPercent
        }))
      }),
    onSuccess: () => {
      showToast('success', 'PO Duplicated', 'A new pending PO was successfully dispatched.');
      qc.invalidateQueries({ queryKey: ['inventory-pos'] });
    },
    onError: (err: any) => {
      showToast('error', 'Duplication Failed', err?.response?.data?.error || 'Failed to duplicate PO.');
    }
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return { label: 'Pending', bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' };
      case 'sent': return { label: 'Sent', bg: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: 'rgba(59,130,246,0.3)' };
      case 'partially_received': return { label: 'Partially Received', bg: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: 'rgba(167,139,250,0.3)' };
      case 'received': return { label: 'Received', bg: 'rgba(16,185,129,0.12)', color: '#10b981', border: 'rgba(16,185,129,0.3)' };
      case 'cancelled': return { label: 'Cancelled', bg: 'rgba(156,163,175,0.12)', color: 'var(--text-muted)', border: 'rgba(156,163,175,0.3)' };
      default: return { label: status, bg: 'rgba(156,163,175,0.12)', color: 'var(--text-muted)', border: 'rgba(156,163,175,0.3)' };
    }
  };

  const filteredPos = pos.filter((po: any) => {
    const sTerm = search.toLowerCase().trim();
    const searchMatch = !sTerm ||
      po.orderNumber?.toLowerCase().includes(sTerm) ||
      po.supplier?.name?.toLowerCase().includes(sTerm);

    const statusMatch = selectedStatus === 'All' || po.status === selectedStatus;
    const supplierMatch = selectedSupplier === 'All' || String(po.supplierId) === selectedSupplier;

    let dateMatch = true;
    const orderTime = new Date(po.createdAt).getTime();
    if (dateFrom) {
      const fromTime = new Date(dateFrom).getTime();
      dateMatch = dateMatch && orderTime >= fromTime;
    }
    if (dateTo) {
      const toTime = new Date(dateTo).setHours(23, 59, 59, 999);
      dateMatch = dateMatch && orderTime <= toTime;
    }

    return searchMatch && statusMatch && supplierMatch && dateMatch;
  });

  // Aggregated Stats
  const totalCount = pos.length;
  const pendingCount = pos.filter((o: any) => o.status === 'pending').length;
  const partialCount = pos.filter((o: any) => o.status === 'partially_received').length;
  const receivedCount = pos.filter((o: any) => o.status === 'received').length;

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Procurement Purchase Orders</h1>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>Track supplier shipments, payments and raw stock receiving workflows</p>
        </div>
        <button onClick={() => setWizardOpen(true)}
          style={{
            height: 34, padding: '0 14px', background: '#7c3aed', border: 'none',
            borderRadius: 8, color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6
          }}>
          <Plus size={14} /> New Purchase Order
        </button>
      </div>

      {/* Stats Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {[
          { label: 'Total Orders', val: totalCount, color: 'var(--text)' },
          { label: 'Pending Dispatch', val: pendingCount, color: '#f59e0b' },
          { label: 'Partially Received', val: partialCount, color: '#a78bfa' },
          { label: 'Received & Stocked', val: receivedCount, color: '#10b981' }
        ].map(card => (
          <div key={card.label} style={{
            background: 'rgba(var(--bg-secondary-rgb), 0.5)', border: '1px solid var(--border)', borderRadius: 10,
            padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4
          }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{card.label}</span>
            <span style={{ fontSize: 20, fontWeight: 900, color: card.color }}>{card.val}</span>
          </div>
        ))}
      </div>

      {/* FILTER TOOLBAR */}
      <div style={{
        background: 'rgba(var(--bg-secondary-rgb), 0.5)', border: '1px solid var(--border)', borderRadius: 10,
        padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center'
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by PO#, supplier name..."
            style={{ width: '100%', height: 32, paddingLeft: 30, paddingRight: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 11, outline: 'none' }} />
        </div>

        {/* Status Filter */}
        <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}
          style={{ height: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', color: 'var(--text)', fontSize: 11, outline: 'none' }}>
          <option value="All">All Statuses</option>
          {['pending', 'sent', 'partially_received', 'received', 'cancelled'].map(st => (
            <option key={st} value={st}>{st.replace('_', ' ').toUpperCase()}</option>
          ))}
        </select>

        {/* Supplier Filter */}
        <select value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)}
          style={{ height: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', color: 'var(--text)', fontSize: 11, outline: 'none' }}>
          <option value="All">All Suppliers</option>
          {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        {/* Date Ranges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
          <span>From</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ height: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 8px', color: 'var(--text)', outline: 'none' }} />
          <span>To</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ height: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 8px', color: 'var(--text)', outline: 'none' }} />
        </div>
      </div>

      {/* PO DATA TABLE */}
      {isLoading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
          Loading procurement orders...
        </div>
      ) : filteredPos.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, border: '1px dashed var(--border)', borderRadius: 10 }}>
          No purchase orders match your filter criteria.
        </div>
      ) : (
        <div style={{
          background: 'rgba(var(--bg-secondary-rgb), 0.3)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ width: 30 }}></th>
                  {['PO #', 'Supplier', 'Order Date', 'Expected Date', 'Items', 'Total Cost', 'Paid', 'Outstanding Due', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 10 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredPos.map((po: any) => {
                  const badge = getStatusBadge(po.status);
                  const isExpanded = expandedPoId === po.id;
                  
                  // Paid amount tracking
                  const payments = po.payments || [];
                  const totalPaid = payments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
                  const outstanding = Math.max(0, Number(po.total || 0) - totalPaid);

                  return (
                    <>
                      <tr key={po.id} style={{ borderBottom: '1px solid rgba(42,45,62,0.5)', cursor: 'pointer' }} className="table-row">
                        <td style={{ padding: '10px 14px', textAlign: 'center' }} onClick={() => setExpandedPoId(isExpanded ? null : po.id)}>
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--text)' }} onClick={() => setExpandedPoId(isExpanded ? null : po.id)}>{po.orderNumber}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{po.supplier?.name}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{po.orderDate ? new Date(po.orderDate).toLocaleDateString() : '—'}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : '—'}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text)' }}>{po.items?.length || 0} materials</td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace' }}>₹{Number(po.total || 0).toFixed(2)}</td>
                        <td style={{ padding: '10px 14px', color: '#10b981', fontFamily: 'monospace' }}>₹{totalPaid.toFixed(2)}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: outstanding > 0 ? '#ef4444' : 'var(--text-secondary)', fontFamily: 'monospace' }}>
                          ₹{outstanding.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            display: 'inline-flex', padding: '2px 8px', borderRadius: 20, fontSize: 9, fontWeight: 700,
                            background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`
                          }}>{badge.label}</span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                            {po.status !== 'received' && po.status !== 'cancelled' && (
                              <button onClick={() => updateStatusMutation.mutate({ id: po.id, status: 'received' })}
                                style={{ height: 24, width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 6, cursor: 'pointer', color: '#10b981' }} title="Mark Received">
                                <Check size={11} />
                              </button>
                            )}
                            {outstanding > 0 && po.status !== 'cancelled' && (
                              <button onClick={() => setPaymentPo(po)}
                                style={{ height: 24, width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, cursor: 'pointer', color: '#f59e0b' }} title="Record Payment">
                                <DollarSign size={11} />
                              </button>
                            )}
                            <button onClick={() => duplicateMutation.mutate(po)}
                              style={{ height: 24, width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: '#a78bfa' }} title="Duplicate Reorder">
                              <Copy size={11} />
                            </button>
                            {po.status === 'pending' && (
                              <button onClick={() => updateStatusMutation.mutate({ id: po.id, status: 'cancelled' })}
                                style={{ height: 24, width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, cursor: 'pointer', color: '#ef4444' }} title="Cancel Order">
                                <XCircle size={11} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* ROW EXPANSION AREA */}
                      {isExpanded && (
                        <tr style={{ background: 'rgba(0,0,0,0.12)' }}>
                          <td colSpan={11} style={{ padding: '12px 18px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                              {/* Items Table */}
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                  <FileText size={12} />
                                  <span>Purchased Materials List</span>
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                                  <thead>
                                    <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border)' }}>
                                      {['Item Name', 'Qty Ordered', 'Unit Cost (₹)', 'Tax %', 'Discount %', 'Net Line Total (₹)'].map(lh => (
                                        <th key={lh} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>{lh}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(po.items || []).map((line: any) => {
                                      const quantity = Number(line.quantity || 0);
                                      const unitCost = Number(line.unitCost || 0);
                                      const discountPercent = Number(line.discountPercent || 0);
                                      const taxPercent = Number(line.taxPercent || 0);
                                      
                                      const base = quantity * unitCost;
                                      const disc = base * (discountPercent / 100);
                                      const total = (base - disc) * (1 + taxPercent / 100);
                                      return (
                                        <tr key={line.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                          <td style={{ padding: '6px 10px', fontWeight: 700, color: 'var(--text)' }}>{line.inventoryItem?.name}</td>
                                          <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{quantity}</td>
                                          <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>₹{unitCost.toFixed(2)}</td>
                                          <td style={{ padding: '6px 10px', color: '#f59e0b' }}>{taxPercent}%</td>
                                          <td style={{ padding: '6px 10px', color: '#ef4444' }}>{discountPercent}%</td>
                                          <td style={{ padding: '6px 10px', fontWeight: 700, color: 'var(--text)' }}>₹{total.toFixed(2)}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>

                              {/* Payout History */}
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                  <DollarSign size={12} />
                                  <span>Cash Settlements & Payments Applied</span>
                                </div>
                                {payments.length === 0 ? (
                                  <div style={{ fontSize: 10, color: 'var(--text-muted)', italic: true } as any}>No cash settlements logged against PO outstanding.</div>
                                ) : (
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                                    <thead>
                                      <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border)' }}>
                                        {['Settlement Date', 'Cleared Amount', 'Method Used', 'Reference code'].map(lh => (
                                          <th key={lh} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>{lh}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {payments.map((p: any) => (
                                        <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                          <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{new Date(p.paymentDate).toLocaleString()}</td>
                                          <td style={{ padding: '6px 10px', fontWeight: 700, color: '#10b981' }}>₹{Number(p.amount).toFixed(2)}</td>
                                          <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{p.method}</td>
                                          <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{p.reference || '—'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* RECORD PAYMENT DRAWER */}
      {paymentPo && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setPaymentPo(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }} />
          <div style={{
            position: 'relative', width: 400, background: 'var(--bg-primary)', borderRadius: 14, border: '1px solid var(--border)',
            padding: 20, boxShadow: '0 20px 48px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: 14
          }}>
            <h3 style={{ fontSize: 13, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Record Supplier Settlement</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Order ID Number</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{paymentPo.orderNumber}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Cleared Cash Amount (₹)</label>
              <input type="number" step="any" value={payAmount} onChange={e => setPayAmount(e.target.value ? Number(e.target.value) : '')} placeholder="Enter payment amount"
                style={{ height: 36, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 12px', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Payment Method</label>
              <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
                style={{ height: 36, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', color: 'var(--text)', fontSize: 12, outline: 'none' }}>
                {['Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
              <button type="button" onClick={() => setPaymentPo(null)}
                style={{ flex: 1, height: 34, background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                Cancel
              </button>
              <button type="button" onClick={() => {
                if (!payAmount || Number(payAmount) <= 0) return showToast('error', 'Amount Required', 'Please enter a valid cash amount.');
                payMutation.mutate({ id: paymentPo.id, amount: Number(payAmount), method: payMethod });
              }}
                style={{ flex: 1, height: 34, background: '#10b981', border: 'none', borderRadius: 8, color: 'var(--text)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                Save Settlement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PO CREATE WIZARD FULL SCREEN OVERLAY */}
      <POCreationWizard isOpen={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}
