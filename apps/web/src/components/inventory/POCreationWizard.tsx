import { useState } from 'react';
import { X, Search, Sparkles, AlertTriangle, Check, ArrowLeft, ArrowRight, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from './ToastProvider';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function POCreationWizard({ isOpen, onClose }: Props) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // STEP 1 - Supplier state
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  
  // STEP 2 - Items state
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [expectedDate, setExpectedDate] = useState('');
  const [note, setNote] = useState('');
  const [autoReceive, setAutoReceive] = useState(false);
  const [selectedItems, setSelectedItems] = useState<any[]>([]); // { item, quantity, unitCost, taxPercent, discountPercent }
  const [itemQuery, setItemQuery] = useState('');

  // STEP 3 - Payment state
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Queries
  const { data: suppliers = [] } = useQuery({ queryKey: ['inventory-suppliers'], queryFn: () => api.get('/restaurant/inventory/suppliers').then(r => r.data.data) });
  const { data: items = [] } = useQuery({ queryKey: ['inventory-items'], queryFn: () => api.get('/restaurant/inventory/items').then(r => r.data.data) });

  if (!isOpen) return null;

  const supplier = suppliers.find((s: any) => s.id === selectedSupplierId);

  // Line item calculation formulas
  const calculateLineTotal = (qty: number, cost: number, disc: number, tax: number) => {
    const base = qty * cost;
    const discounted = base * (1 - disc / 100);
    return discounted * (1 + tax / 100);
  };

  const getRunningTotals = () => {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    selectedItems.forEach(line => {
      const base = line.quantity * line.unitCost;
      const discAmt = base * (line.discountPercent / 100);
      const taxedAmt = (base - discAmt) * (line.taxPercent / 100);
      
      subtotal += base;
      totalDiscount += discAmt;
      totalTax += taxedAmt;
    });

    const grandTotal = subtotal - totalDiscount + totalTax;
    return { subtotal, totalDiscount, totalTax, grandTotal };
  };

  const totals = getRunningTotals();
  const amountDue = Math.max(0, totals.grandTotal - paidAmount);

  const handleSelectItem = (it: any) => {
    if (selectedItems.find(x => x.item.id === it.id)) return;
    // Get last purchase cost or costPerUnit
    const rate = Number(it.costPerUnit || 0);
    setSelectedItems([...selectedItems, {
      item: it,
      quantity: 1,
      unitCost: rate,
      taxPercent: 0,
      discountPercent: 0
    }]);
  };

  const updateLineItem = (index: number, key: string, val: any) => {
    const list = [...selectedItems];
    list[index][key] = val;
    setSelectedItems(list);
  };

  const handleRemoveLineItem = (idx: number) => {
    setSelectedItems(selectedItems.filter((_, i) => i !== idx));
  };

  const handleCreateSupplier = async () => {
    const sname = prompt('Enter supplier business name:');
    if (!sname) return;
    const sphone = prompt('Enter contact phone number:');
    try {
      const res = await api.post('/restaurant/inventory/suppliers', { name: sname, phone: sphone });
      showToast('success', 'Supplier Added', `Supplier "${sname}" registered successfully.`);
      qc.invalidateQueries({ queryKey: ['inventory-suppliers'] });
      setSelectedSupplierId(res.data.data.id);
    } catch (err: any) {
      showToast('error', 'Registration Failed', err?.response?.data?.error || 'Failed to add supplier.');
    }
  };

  const handleSubmit = async () => {
    if (selectedItems.length === 0) {
      showToast('error', 'Empty Order', 'Please select at least one material line item.');
      return;
    }
    setSubmitting(true);

    const payload = {
      supplierId: Number(selectedSupplierId),
      orderDate: orderDate ? new Date(orderDate).toISOString() : undefined,
      expectedDate: expectedDate ? new Date(expectedDate).toISOString() : undefined,
      note: note || undefined,
      autoReceive,
      paidAmount: Number(paidAmount),
      paymentMethod: paidAmount > 0 ? paymentMethod : undefined,
      paymentReference: paidAmount > 0 ? paymentReference : undefined,
      paymentNotes: paidAmount > 0 ? paymentNotes : undefined,
      items: selectedItems.map(x => ({
        inventoryItemId: x.item.id,
        quantity: Number(x.quantity),
        unitCost: Number(x.unitCost),
        taxPercent: Number(x.taxPercent || 0),
        discountPercent: Number(x.discountPercent || 0)
      }))
    };

    try {
      await api.post('/restaurant/inventory/purchase-orders', payload);
      showToast('success', 'PO Submitted Successfully', `Procurement order created under supplier outstanding credit.`);
      qc.invalidateQueries({ queryKey: ['inventory-pos'] });
      qc.invalidateQueries({ queryKey: ['inventory-items'] });
      qc.invalidateQueries({ queryKey: ['inventory-suppliers'] });
      onClose();
    } catch (err: any) {
      showToast('error', 'Submission Failed', err?.response?.data?.error || 'Failed to dispatch purchase order.');
    } finally {
      setSubmitting(false);
    }
  };

  // Searching items client side
  const filteredItems = items.filter((it: any) =>
    it.name?.toLowerCase().includes(itemQuery.toLowerCase()) ||
    it.sku?.toLowerCase().includes(itemQuery.toLowerCase())
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)' }} />
      <div style={{
        position: 'relative', width: 900, maxWidth: '95vw', height: '85vh', background: 'var(--bg-primary)',
        borderRadius: 16, border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'scaleIn 200ms ease-out'
      }}>
        {/* Modal Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Create New Purchase Order</h2>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Step {step} of 4</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Wizard Progress Indicator */}
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 14 }}>
          {['1 Supplier', '2 Items', '3 Payment', '4 Review'].map((label, idx) => {
            const current = step === idx + 1;
            const completed = step > idx + 1;
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: current || completed ? 1 : 0.4 }}>
                <span style={{
                  width: 18, height: 18, borderRadius: '50%', background: completed ? '#10b981' : current ? '#7c3aed' : 'var(--bg-tertiary)',
                  color: 'var(--text)', fontSize: 10, fontWeight: 850, display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {completed ? <Check size={10} /> : idx + 1}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: current ? '#a78bfa' : completed ? '#10b981' : 'var(--text-muted)' }}>{label}</span>
                {idx < 3 && <span style={{ color: 'var(--text-muted)' }}>➔</span>}
              </div>
            );
          })}
        </div>

        {/* STEP WORKSPACES */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {/* STEP 1: Select Supplier */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 750, color: 'var(--text)' }}>Choose Supplier Vendor</span>
                <button type="button" onClick={handleCreateSupplier} style={{ fontSize: 11, color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>+ Create New Supplier</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
                {suppliers.map((s: any) => {
                  const selected = selectedSupplierId === s.id;
                  const limitVal = Number(s.creditLimit || 0);
                  const isOver = limitVal > 0 && Number(s.outstandingBalance) >= limitVal;

                  return (
                    <div key={s.id} onClick={() => setSelectedSupplierId(s.id)}
                      style={{
                        padding: 14, borderRadius: 12, border: selected ? '2px solid #7c3aed' : '1px solid var(--border)',
                        background: selected ? 'rgba(124,58,237,0.06)' : 'rgba(30,34,53,0.5)', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', gap: 8, transition: 'all 150ms'
                      }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ fontWeight: 800, color: 'var(--text)', fontSize: 12 }}>{s.name}</div>
                        {isOver && <span title="Over Credit Limit"><AlertTriangle size={14} style={{ color: '#ef4444' }} /></span>}
                      </div>

                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        Contact: {s.contactPerson || '—'} | {s.phone || 'No phone'}
                      </div>

                      <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                        <span style={{ color: 'var(--text-muted)' }}>Outstanding Balance:</span>
                        <span style={{ fontWeight: 700, color: isOver ? '#ef4444' : '#10b981' }}>₹{Number(s.outstandingBalance || 0).toFixed(0)}</span>
                      </div>

                      {limitVal > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)' }}>
                          <span>Credit limit:</span>
                          <span>₹{limitVal.toFixed(0)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 2: Add Line Items */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Date controls */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Order Date</span>
                  <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
                    style={{ height: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Expected Delivery Date</span>
                  <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)}
                    style={{ height: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
                </div>
              </div>

              {/* Item selection row */}
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input value={itemQuery} onChange={e => setItemQuery(e.target.value)} placeholder="Type raw material name or SKU to add..."
                  style={{ width: '100%', height: 36, paddingLeft: 32, paddingRight: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12, outline: 'none' }} />
                {itemQuery.trim().length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-primary)', border: '1px solid var(--border)',
                    borderRadius: 8, boxShadow: '0 12px 24px rgba(0,0,0,0.4)', zIndex: 10, maxHeight: 150, overflowY: 'auto', marginTop: 4
                  }}>
                    {filteredItems.slice(0, 5).map((it: any) => (
                      <div key={it.id} onClick={() => { handleSelectItem(it); setItemQuery(''); }}
                        style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text)', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                        {it.name} {it.sku && `(${it.sku})`} — Stock: {it.currentStock} {it.unit?.symbol}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Added Lines Table */}
              <div style={{ overflowX: 'auto', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border)', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border)' }}>
                      {['Item Name', 'Qty', 'Unit Cost (₹)', 'Tax %', 'Discount %', 'Total (₹)', ''].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 10 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedItems.map((line, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 750, color: 'var(--text)' }}>{line.item.name}</td>
                        <td style={{ padding: '8px 12px', width: 80 }}>
                          <input type="number" step="any" value={line.quantity} onChange={e => updateLineItem(idx, 'quantity', Number(e.target.value))}
                            style={{ width: '100%', height: 26, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 6px', color: 'var(--text)', outline: 'none' }} />
                        </td>
                        <td style={{ padding: '8px 12px', width: 90 }}>
                          <input type="number" step="any" value={line.unitCost} onChange={e => updateLineItem(idx, 'unitCost', Number(e.target.value))}
                            style={{ width: '100%', height: 26, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 6px', color: 'var(--text)', outline: 'none' }} />
                        </td>
                        <td style={{ padding: '8px 12px', width: 70 }}>
                          <input type="number" value={line.taxPercent} onChange={e => updateLineItem(idx, 'taxPercent', Number(e.target.value))}
                            style={{ width: '100%', height: 26, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 6px', color: 'var(--text)', outline: 'none' }} />
                        </td>
                        <td style={{ padding: '8px 12px', width: 70 }}>
                          <input type="number" value={line.discountPercent} onChange={e => updateLineItem(idx, 'discountPercent', Number(e.target.value))}
                            style={{ width: '100%', height: 26, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 6px', color: 'var(--text)', outline: 'none' }} />
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace' }}>
                          ₹{calculateLineTotal(line.quantity, line.unitCost, line.discountPercent, line.taxPercent).toFixed(2)}
                        </td>
                        <td style={{ padding: '8px 12px', width: 40 }}>
                          <button type="button" onClick={() => handleRemoveLineItem(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {selectedItems.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', italic: true } as any}>No raw materials added to purchase order yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Auto receive and remarks */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14, alignItems: 'center' }}>
                <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Terms, delivery instructions, remarks..."
                  style={{ height: 50, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 11, outline: 'none', resize: 'none' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <input type="checkbox" checked={autoReceive} onChange={e => setAutoReceive(e.target.checked)} style={{ cursor: 'pointer', width: 15, height: 15 }} />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>Auto-Receive Stock</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>Instantly receive all quantities into stock on submit.</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Payment details */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 500, margin: '0 auto' }}>
              <div style={{ textAlign: 'center', padding: '14px 20px', background: 'rgba(0,0,0,0.2)', borderRadius: 12, border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>PURCHASE ORDER TOTAL AMOUNT</span>
                <div style={{ fontSize: 26, fontWeight: 900, color: '#a78bfa', marginTop: 4 }}>₹{totals.grandTotal.toFixed(2)}</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>Amount Paid (₹)</label>
                <input type="number" step="any" value={paidAmount || ''} onChange={e => setPaidAmount(Number(e.target.value))} placeholder="Leave 0 for full supplier credit"
                  style={{ height: 36, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 12px', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
              </div>

              {paidAmount > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>Payment Method</label>
                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                      style={{ height: 36, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', color: 'var(--text)', fontSize: 12, outline: 'none' }}>
                      {['Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque'].map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>Txn Reference ID</label>
                    <input value={paymentReference} onChange={e => setPaymentReference(e.target.value)} placeholder="Ref transaction code"
                      style={{ height: 36, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 12px', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
                  </div>
                </div>
              )}

              {/* Outstanding balance preview */}
              <div style={{
                background: amountDue > 0 ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.06)',
                border: amountDue > 0 ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(16,185,129,0.2)',
                borderRadius: 10, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>Remaining Outstanding Due</div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                    {amountDue > 0 ? "This amount will be added to the supplier's outstanding ledger." : "Full order payment received."}
                  </div>
                </div>
                <span style={{ fontSize: 16, fontWeight: 900, color: amountDue > 0 ? '#ef4444' : '#10b981' }}>₹{amountDue.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* STEP 4: Review summary */}
          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 14 }}>
                {/* Vendor Card */}
                <div style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: '#7c3aed', letterSpacing: '0.04em' }}>SUPPLIER VENDOR</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>{supplier?.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{supplier?.contactPerson} | {supplier?.phone}</div>
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Notes: {note || 'None'}</div>
                  {autoReceive && <div style={{ fontSize: 10, color: '#10b981', fontWeight: 700, marginTop: 4 }}>✓ Auto-Receiving Enabled</div>}
                </div>

                {/* Totals Summary */}
                <div style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: '#7c3aed', letterSpacing: '0.04em' }}>ORDER COST SEGMENTATION</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
                    <span>Subtotal Cost:</span>
                    <span>₹{totals.subtotal.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#ef4444' }}>
                    <span>Lines Discount:</span>
                    <span>- ₹{totals.totalDiscount.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#f59e0b' }}>
                    <span>Estimated Tax:</span>
                    <span>+ ₹{totals.totalTax.toFixed(2)}</span>
                  </div>
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>
                    <span>Grand Total:</span>
                    <span>₹{totals.grandTotal.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#10b981', marginTop: 4 }}>
                    <span>Immediate Paid Cash:</span>
                    <span>₹{paidAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Items checklist */}
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>PURCHASED RAW MATERIALS ({selectedItems.length})</div>
              <div style={{
                maxHeight: 150, overflowY: 'auto', background: 'rgba(0,0,0,0.1)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px',
                display: 'flex', flexDirection: 'column', gap: 4
              }}>
                {selectedItems.map((line, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text)' }}>
                    <span>{line.item.name} (x{line.quantity})</span>
                    <span style={{ fontFamily: 'monospace' }}>₹{calculateLineTotal(line.quantity, line.unitCost, line.discountPercent, line.taxPercent).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,0.1)' }}>
          {step > 1 ? (
            <button type="button" onClick={() => setStep(step - 1)}
              style={{
                height: 34, padding: '0 14px', background: 'none', border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6
              }}>
              <ArrowLeft size={14} /> Back
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <button type="button" onClick={() => {
              if (step === 1 && !selectedSupplierId) return showToast('error', 'Selection Required', 'Please select a supplier business vendor.');
              if (step === 2 && selectedItems.length === 0) return showToast('error', 'Items Required', 'Please add at least one material.');
              setStep(step + 1);
            }}
              style={{
                height: 34, padding: '0 14px', background: '#7c3aed', border: 'none',
                borderRadius: 8, color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6
              }}>
              Next <ArrowRight size={14} />
            </button>
          ) : (
            <button type="button" onClick={handleSubmit} disabled={submitting}
              style={{
                height: 34, padding: '0 16px', background: '#10b981', border: 'none',
                borderRadius: 8, color: 'var(--text)', fontSize: 12, fontWeight: 800, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6
              }}>
              {submitting ? 'Creating PO...' : '✓ Create Purchase Order'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
