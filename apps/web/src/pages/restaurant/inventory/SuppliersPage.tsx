import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import {
  Search, Plus, User, Phone, Mail, MapPin, Award, DollarSign, List, ShieldAlert, Edit, Trash
} from 'lucide-react';
import { useToast } from '@/components/inventory/ToastProvider';

interface Props {
  quickAction?: string | null;
  onClearQuickAction?: () => void;
}

export default function SuppliersPage({ quickAction, onClearQuickAction }: Props) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'All' | 'OverLimit' | 'Active'>('All');
  
  // Selection/Detail View States
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'pos' | 'ledger' | 'items'>('overview');

  // Supplier Form Modals
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    if (quickAction === 'add-supplier') {
      setEditingSupplier(null);
      resetForm();
      setFormOpen(true);
      onClearQuickAction?.();
    }
  }, [quickAction]);
  const [editingSupplier, setEditingSupplier] = useState<any | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [creditLimit, setCreditLimit] = useState<number>(50000);
  const [notes, setNotes] = useState('');

  // Queries
  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['inventory-suppliers'],
    queryFn: () => api.get('/restaurant/inventory/suppliers').then(r => r.data.data)
  });

  const { data: pos = [] } = useQuery({
    queryKey: ['inventory-pos'],
    queryFn: () => api.get('/restaurant/inventory/purchase-orders').then(r => r.data.data).catch(() => [])
  });

  const { data: items = [] } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: () => api.get('/restaurant/inventory/items').then(r => r.data.data).catch(() => [])
  });

  // Create Supplier Mutation
  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post('/restaurant/inventory/suppliers', payload),
    onSuccess: (res) => {
      showToast('success', 'Supplier Registered', `Vendor "${res.data.data.name}" added successfully.`);
      setFormOpen(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ['inventory-suppliers'] });
    },
    onError: (err: any) => {
      showToast('error', 'Registration Failed', err?.response?.data?.error || 'Failed to add supplier.');
    }
  });

  // Edit Supplier Mutation
  const editMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => api.put(`/restaurant/inventory/suppliers/${id}`, payload),
    onSuccess: (res) => {
      showToast('success', 'Supplier Updated', `Vendor details saved.`);
      setEditingSupplier(null);
      qc.invalidateQueries({ queryKey: ['inventory-suppliers'] });
    },
    onError: (err: any) => {
      showToast('error', 'Update Failed', err?.response?.data?.error || 'Failed to save changes.');
    }
  });

  // Delete Supplier Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/restaurant/inventory/suppliers/${id}`),
    onSuccess: () => {
      showToast('success', 'Supplier Deleted', 'Vendor relationship terminated.');
      setSelectedSupplierId(null);
      qc.invalidateQueries({ queryKey: ['inventory-suppliers'] });
    },
    onError: (err: any) => {
      showToast('error', 'Delete Failed', err?.response?.data?.error || 'Failed to delete supplier.');
    }
  });

  const resetForm = () => {
    setName('');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setAddress('');
    setGstNumber('');
    setCreditLimit(50000);
    setNotes('');
  };

  const handleOpenEdit = (s: any) => {
    setEditingSupplier(s);
    setName(s.name || '');
    setContactPerson(s.contactPerson || '');
    setPhone(s.phone || '');
    setEmail(s.email || '');
    setAddress(s.address || '');
    setGstNumber(s.gstNumber || '');
    setCreditLimit(Number(s.creditLimit || 0));
    setNotes(s.notes || '');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return showToast('error', 'Missing Name', 'Supplier business name is required.');
    const payload = { name, contactPerson, phone, email, address, gstNumber, creditLimit: Number(creditLimit), notes };
    if (editingSupplier) {
      editMutation.mutate({ id: editingSupplier.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  // Filter supplier list
  const filteredSuppliers = suppliers.filter((s: any) => {
    const sTerm = search.toLowerCase().trim();
    const searchMatch = !sTerm ||
      s.name?.toLowerCase().includes(sTerm) ||
      s.contactPerson?.toLowerCase().includes(sTerm) ||
      s.phone?.toLowerCase().includes(sTerm);

    const limitVal = Number(s.creditLimit || 0);
    const balance = Number(s.outstandingBalance || 0);
    
    let statusMatch = true;
    if (selectedStatus === 'OverLimit') {
      statusMatch = limitVal > 0 && balance > limitVal;
    }

    return searchMatch && statusMatch;
  });

  // Selected supplier item
  const selectedSupplier = suppliers.find((s: any) => s.id === (selectedSupplierId || (filteredSuppliers[0]?.id)));
  const selectedPOList = pos.filter((p: any) => p.supplierId === selectedSupplier?.id);

  // Map outstanding MRP items supplied
  const suppliedItems = items.filter((it: any) =>
    (it.inventoryMRPs || []).some((mrp: any) => mrp.supplierId === selectedSupplier?.id)
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', height: 'calc(100vh - 120px)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'rgba(var(--bg-secondary-rgb), 0.1)' }}>
      
      {/* LEFT COLUMN: SUPPLIER DIRECTORY */}
      <div style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'rgba(var(--bg-secondary-rgb), 0.3)' }}>
        {/* Header Search toolbar */}
        <div style={{ padding: 14, borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--text)' }}>Suppliers ({filteredSuppliers.length})</span>
            <button onClick={() => { setEditingSupplier(null); resetForm(); setFormOpen(true); }}
              style={{
                width: 24, height: 24, borderRadius: 6, background: '#7c3aed', border: 'none',
                color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
              }} title="Add Supplier">
              <Plus size={14} />
            </button>
          </div>

          <div style={{ position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search supplier catalog..."
              style={{ width: '100%', height: 28, paddingLeft: 26, paddingRight: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 11, outline: 'none' }} />
          </div>

          <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.2)', padding: 3, borderRadius: 6 }}>
            {['All', 'OverLimit'].map(tab => (
              <button key={tab} onClick={() => setSelectedStatus(tab as any)}
                style={{
                  flex: 1, height: 22, fontSize: 9, fontWeight: 700, border: 'none', borderRadius: 4, cursor: 'pointer',
                  background: selectedStatus === tab ? '#7c3aed' : 'transparent',
                  color: selectedStatus === tab ? '#fff' : 'var(--text-muted)'
                }}>
                {tab === 'OverLimit' ? '⚠️ Over Limit' : '📋 All'}
              </button>
            ))}
          </div>
        </div>

        {/* Directory List */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {isLoading ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>Loading supplier directory...</div>
          ) : filteredSuppliers.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>No vendors found.</div>
          ) : (
            filteredSuppliers.map((s: any) => {
              const active = selectedSupplier?.id === s.id;
              const limit = Number(s.creditLimit || 0);
              const balance = Number(s.outstandingBalance || 0);
              const ratio = limit > 0 ? Math.min(100, (balance / limit) * 100) : 0;
              const isOver = limit > 0 && balance > limit;

              return (
                <div key={s.id} onClick={() => { setSelectedSupplierId(s.id); setActiveTab('overview'); }}
                  style={{
                    padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer',
                    background: active ? 'rgba(124,58,237,0.08)' : 'transparent', display: 'flex', flexDirection: 'column', gap: 6,
                    borderLeft: active ? '3px solid #7c3aed' : 'none'
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 800, color: 'var(--text)', fontSize: 11 }}>{s.name}</div>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: isOver ? '#ef4444' : '#10b981'
                    }} />
                  </div>

                  <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                    Phone: {s.phone || '—'} | Contact: {s.contactPerson || '—'}
                  </div>

                  {/* Limit Progress bar */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)' }}>
                      <span>Balance: ₹{balance.toFixed(0)}</span>
                      <span>Max: ₹{limit.toFixed(0)}</span>
                    </div>
                    {limit > 0 && (
                      <div style={{ height: 4, background: 'var(--bg-hover)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${ratio}%`, height: '100%', background: isOver ? '#ef4444' : '#7c3aed' }} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: SUPPLIER Tabbed INSPECTOR */}
      <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(var(--bg-secondary-rgb), 0.1)' }}>
        {selectedSupplier ? (
          <>
            {/* Header Title Row */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 900, color: 'var(--text)', margin: 0 }}>{selectedSupplier.name}</h2>
                <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                  <span>GSTIN: {selectedSupplier.gstNumber || 'None'}</span>
                  <span>•</span>
                  <span>Contact: {selectedSupplier.contactPerson || 'No Name'}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => handleOpenEdit(selectedSupplier)}
                  style={{ height: 26, padding: '0 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 10, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Edit size={10} /> Edit
                </button>
                <button onClick={() => {
                  if (confirm('Delete this vendor relationship?')) deleteMutation.mutate(selectedSupplier.id);
                }}
                  style={{ height: 26, padding: '0 10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, cursor: 'pointer', fontSize: 10, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Trash size={10} /> Terminate
                </button>
              </div>
            </div>

            {/* TAB SELECTOR */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.15)', padding: '0 14px' }}>
              {([
                { id: 'overview', label: '📊 Overview' },
                { id: 'pos', label: '📦 Orders History' },
                { id: 'ledger', label: '💳 Payment Ledger' },
                { id: 'items', label: '🍎 Supplied Items' }
              ] as const).map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  style={{
                    height: 36, padding: '0 16px', background: 'none', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    color: activeTab === tab.id ? '#a78bfa' : 'var(--text-muted)',
                    borderBottom: activeTab === tab.id ? '2px solid #7c3aed' : 'none',
                    transition: 'all 150ms'
                  }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* TAB CONTAINER WORKSPACES */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              {activeTab === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                  {/* Contact Info Card */}
                  <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#7c3aed', letterSpacing: '0.04em' }}>VENDOR DETAILS</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
                      <div style={{ display: 'flex', gap: 8, color: 'var(--text-secondary)' }}>
                        <User size={14} style={{ color: 'var(--text-muted)' }} />
                        <span>Name: {selectedSupplier.contactPerson || '—'}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, color: 'var(--text-secondary)' }}>
                        <Phone size={14} style={{ color: 'var(--text-muted)' }} />
                        <span>Phone: {selectedSupplier.phone || '—'}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, color: 'var(--text-secondary)' }}>
                        <Mail size={14} style={{ color: 'var(--text-muted)' }} />
                        <span>Email: {selectedSupplier.email || '—'}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, color: 'var(--text-secondary)' }}>
                        <MapPin size={14} style={{ color: 'var(--text-muted)' }} />
                        <span>Address: {selectedSupplier.address || '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Credit Limit Gauges */}
                  <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#7c3aed', letterSpacing: '0.04em' }}>CREDIT STATUS SUMMARY</div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, textAlign: 'center', marginTop: 10 }}>
                      <div style={{ padding: 10, background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)' }}>₹{Number(selectedSupplier.creditLimit || 0).toFixed(0)}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>CREDIT CEILING</div>
                      </div>
                      <div style={{ padding: 10, background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: '#ef4444' }}>₹{Number(selectedSupplier.outstandingBalance || 0).toFixed(0)}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>TOTAL DEBT OUTSTANDING</div>
                      </div>
                    </div>

                    <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: '1.4em', marginTop: 6 }}>
                      {selectedSupplier.notes || 'No custom notes set on this supplier profile.'}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'pos' && (
                <div style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto', maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                    <thead>
                      <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border)' }}>
                        {['PO #', 'Date Submitted', 'Cost Total (₹)', 'Paid Amount (₹)', 'Remaining Debt', 'Status'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPOList.map((po: any) => {
                        const totalPaid = (po.payments || []).reduce((s: number, p: any) => s + Number(p.amount), 0);
                        const debt = Math.max(0, Number(po.total || 0) - totalPaid);
                        return (
                          <tr key={po.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 800, color: 'var(--text)' }}>{po.orderNumber}</td>
                            <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{new Date(po.createdAt).toLocaleDateString()}</td>
                            <td style={{ padding: '8px 12px', color: 'var(--text)', fontFamily: 'monospace' }}>₹{Number(po.total || 0).toFixed(2)}</td>
                            <td style={{ padding: '8px 12px', color: '#10b981', fontFamily: 'monospace' }}>₹{totalPaid.toFixed(2)}</td>
                            <td style={{ padding: '8px 12px', color: debt > 0 ? '#ef4444' : 'var(--text-muted)', fontFamily: 'monospace' }}>₹{debt.toFixed(2)}</td>
                            <td style={{ padding: '8px 12px', color: 'var(--text)' }}>{po.status.toUpperCase()}</td>
                          </tr>
                        );
                      })}
                      {selectedPOList.length === 0 && (
                        <tr>
                          <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', italic: true } as any}>No purchase orders dispatched to this vendor.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === 'ledger' && (
                <div style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto', maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                    <thead>
                      <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border)' }}>
                        {['Date', 'Reference Action', 'Charged Total (₹)', 'Settled Cash (₹)', 'Running Debt Balance'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Compile PO and Payments chronologically */}
                      {(() => {
                        const ledgerEntries: any[] = [];
                        selectedPOList.forEach((po: any) => {
                          ledgerEntries.push({
                            date: new Date(po.createdAt),
                            ref: `Charged PO ${po.orderNumber}`,
                            charge: Number(po.total || 0),
                            credit: 0
                          });
                          (po.payments || []).forEach((pm: any) => {
                            ledgerEntries.push({
                              date: new Date(pm.paymentDate),
                              ref: `Cash Payment on ${po.orderNumber} (${pm.method})`,
                              charge: 0,
                              credit: Number(pm.amount)
                            });
                          });
                        });
                        ledgerEntries.sort((a, b) => a.date.getTime() - b.date.getTime());

                        let runningDebt = 0;
                        return ledgerEntries.map((e, idx) => {
                          runningDebt = runningDebt + e.charge - e.credit;
                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                              <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{e.date.toLocaleString()}</td>
                              <td style={{ padding: '8px 12px', color: 'var(--text)', fontWeight: 700 }}>{e.ref}</td>
                              <td style={{ padding: '8px 12px', color: 'var(--text)', fontFamily: 'monospace' }}>{e.charge > 0 ? `₹${e.charge.toFixed(2)}` : '—'}</td>
                              <td style={{ padding: '8px 12px', color: '#10b981', fontFamily: 'monospace' }}>{e.credit > 0 ? `₹${e.credit.toFixed(2)}` : '—'}</td>
                              <td style={{ padding: '8px 12px', fontWeight: 800, color: runningDebt > 0 ? '#ef4444' : '#10b981', fontFamily: 'monospace' }}>₹{runningDebt.toFixed(2)}</td>
                            </tr>
                          );
                        });
                      })()}
                      {selectedPOList.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', italic: true } as any}>No settlements or purchase logs found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === 'items' && (
                <div style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto', maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                    <thead>
                      <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border)' }}>
                        {['Item Name', 'Global SKU', 'Supplier Cost (₹)', 'Sticker MRP (₹)', 'Active Profit Margin', 'Stock On Hand'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {suppliedItems.map((it: any) => {
                        const mrpRecord = (it.inventoryMRPs || []).find((m: any) => m.supplierId === selectedSupplier?.id);
                        return (
                          <tr key={it.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 750, color: 'var(--text)' }}>{it.name}</td>
                            <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{it.sku || '—'}</td>
                            <td style={{ padding: '8px 12px', color: 'var(--text)', fontFamily: 'monospace' }}>₹{Number(mrpRecord?.purchaseRate || 0).toFixed(2)}</td>
                            <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>₹{Number(mrpRecord?.mrp || 0).toFixed(2)}</td>
                            <td style={{ padding: '8px 12px', color: '#10b981', fontWeight: 700 }}>{Number(mrpRecord?.profitPercent || 0).toFixed(1)}%</td>
                            <td style={{ padding: '8px 12px', color: 'var(--text)', fontFamily: 'monospace' }}>{it.currentStock} {it.unit?.symbol}</td>
                          </tr>
                        );
                      })}
                      {suppliedItems.length === 0 && (
                        <tr>
                          <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', italic: true } as any}>No custom pricing brackets set up for this vendor.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>Please select a supplier from the list to inspect their record.</div>
        )}
      </div>

      {/* ADD/EDIT SUPPLIER MODAL */}
      {formOpen || editingSupplier ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={() => { setFormOpen(false); setEditingSupplier(null); }} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }} />
          <form onSubmit={handleSave} style={{
            position: 'relative', width: '100%', maxWidth: 440, background: 'var(--bg-primary)', height: '100%', display: 'flex', flexDirection: 'column',
            boxShadow: '-8px 0 32px rgba(0,0,0,0.5)', animation: 'slideIn 300ms ease-out', borderLeft: '1px solid var(--border)', padding: 20, gap: 14
          }}>
            <h3 style={{ fontSize: 13, fontWeight: 900, color: 'var(--text)', margin: 0, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
              {editingSupplier ? '✏️ Edit Supplier Details' : '🤝 Add Supplier Vendor'}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Business Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Metro Wholesale Foods"
                style={{ height: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 10px', color: 'var(--text)', fontSize: 11, outline: 'none' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Contact Person</label>
                <input value={contactPerson} onChange={e => setContactPerson(e.target.value)} placeholder="e.g. John Doe"
                  style={{ height: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 10px', color: 'var(--text)', fontSize: 11, outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Phone *</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. +91 9988776655"
                  style={{ height: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 10px', color: 'var(--text)', fontSize: 11, outline: 'none' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Email Address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. accounts@metro.com"
                  style={{ height: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 10px', color: 'var(--text)', fontSize: 11, outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>GSTIN / Tax ID</label>
                <input value={gstNumber} onChange={e => setGstNumber(e.target.value)} placeholder="e.g. 07AAAAA1111A1Z1"
                  style={{ height: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 10px', color: 'var(--text)', fontSize: 11, outline: 'none' }} />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Credit Limit (₹)</label>
              <input type="number" value={creditLimit} onChange={e => setCreditLimit(Number(e.target.value))}
                style={{ height: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 10px', color: 'var(--text)', fontSize: 11, outline: 'none' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Mailing Address</label>
              <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Warehouse or shop layout address"
                style={{ height: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 10px', color: 'var(--text)', fontSize: 11, outline: 'none' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Internal Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Supplier terms, payment schedules..."
                style={{ height: 60, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 11, outline: 'none', resize: 'none' }} />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 'auto', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <button type="button" onClick={() => { setFormOpen(false); setEditingSupplier(null); }}
                style={{ flex: 1, height: 36, background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                Cancel
              </button>
              <button type="submit"
                style={{ flex: 1, height: 36, background: '#7c3aed', border: 'none', borderRadius: 6, color: 'var(--text)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                Save Supplier
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
