import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useSocket } from '@/hooks/useSocket';

export default function PurchaseOrders() {
  const qc = useQueryClient();
  const { socket } = useSocket();
  const [search, setSearch] = useState('');
  const { data: orders = [], isLoading } = useQuery({ queryKey: ['inventory-pos'], queryFn: () => api.get('/restaurant/inventory/purchase-orders').then(r => r.data.data) });
  const { data: suppliers = [] } = useQuery({ queryKey: ['inventory-suppliers'], queryFn: () => api.get('/restaurant/inventory/suppliers').then(r => r.data.data) });
  const { data: items = [] } = useQuery({ queryKey: ['inventory-items-lookup'], queryFn: () => api.get('/restaurant/inventory/items').then(r => r.data.data) });

  const [showCreate, setShowCreate] = useState(false);
  const [poSupplier, setPoSupplier] = useState<number | null>(null);
  const [poItems, setPoItems] = useState<Array<{ inventoryItemId?: number; quantity?: number; unitCost?: number }>>([{ quantity: 1 }]);
  const [supplierItems, setSupplierItems] = useState<any[]>([]);
  const [saveToSupplier, setSaveToSupplier] = useState<boolean>(true);
  const [orderDate, setOrderDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [expectedDate, setExpectedDate] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [currency, setCurrency] = useState<string>('');
  const [exchangeRate, setExchangeRate] = useState<number | ''>('');
  const [showPaymentsFor, setShowPaymentsFor] = useState<any | null>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [viewPO, setViewPO] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);

  const receive = async (id: number) => {
    try {
      await api.post(`/restaurant/inventory/purchase-orders/${id}/receive`);
      qc.invalidateQueries({ queryKey: ['inventory-pos'] });
      qc.invalidateQueries({ queryKey: ['inventory-items'] });
      alert('PO received');
    } catch (err: any) {
      alert('Receive failed: ' + (err?.response?.data?.error || err?.message || String(err)));
    }
  };

  useEffect(() => {
    if (!socket) return;
    const invalidateAll = () => {
      qc.invalidateQueries({ queryKey: ['inventory-pos'] });
      qc.invalidateQueries({ queryKey: ['inventory-items'] });
      qc.invalidateQueries({ queryKey: ['inventory-items-lookup'] });
      qc.invalidateQueries({ queryKey: ['inventory-suppliers'] });
    };

    socket.on('purchaseOrder.created', invalidateAll);
    socket.on('purchaseOrder.received', invalidateAll);
    socket.on('purchaseOrder.payment', invalidateAll);
    socket.on('inventory.item.updated', () => { qc.invalidateQueries({ queryKey: ['inventory-items'] }); qc.invalidateQueries({ queryKey: ['inventory-items-lookup'] }); });
    socket.on('supplier.updated', () => qc.invalidateQueries({ queryKey: ['inventory-suppliers'] }));

    return () => {
      socket.off('purchaseOrder.created', invalidateAll);
      socket.off('purchaseOrder.received', invalidateAll);
      socket.off('purchaseOrder.payment', invalidateAll);
      socket.off('inventory.item.updated', () => { qc.invalidateQueries({ queryKey: ['inventory-items'] }); qc.invalidateQueries({ queryKey: ['inventory-items-lookup'] }); });
      socket.off('supplier.updated', () => qc.invalidateQueries({ queryKey: ['inventory-suppliers'] }));
    };
  }, [socket, qc]);

  const createPO = async () => {
    if (!poSupplier) { alert('Select supplier'); return; }
    try {
      const itemsToSend = poItems
        .filter(i => i.inventoryItemId && Number(i.quantity) > 0 && Number(i.unitCost) >= 0)
        .map(i => {
        const base: any = {
          inventoryItemId: Number(i.inventoryItemId),
          quantity: Number(i.quantity),
          unitCost: Number(i.unitCost),
        };
        if (saveToSupplier) {
          base.mrp = Number(i.unitCost);
          base.purchaseRate = Number(i.unitCost);
        }
        if (typeof (i as any).taxPercent !== 'undefined') base.taxPercent = Number((i as any).taxPercent || 0);
        if (typeof (i as any).discountPercent !== 'undefined') base.discountPercent = Number((i as any).discountPercent || 0);
        return base;
      });
      if (itemsToSend.length === 0) { alert('Add at least one item with quantity and unit price greater than 0'); return; }
      const payload: any = { supplierId: poSupplier, items: itemsToSend };
      if (orderDate) payload.orderDate = orderDate;
      if (expectedDate) payload.expectedDate = expectedDate;
      if (note) payload.note = note;
      if (currency) payload.currency = currency;
      if (exchangeRate) payload.exchangeRate = Number(exchangeRate) || undefined;
      await api.post('/restaurant/inventory/purchase-orders', payload);
      setShowCreate(false);
      qc.invalidateQueries({ queryKey: ['inventory-pos'] });
      qc.invalidateQueries({ queryKey: ['inventory-items'] });
      alert('PO created');
    } catch (err: any) {
      console.error('Create PO error', err?.response?.status, err?.response?.data || err);
      console.dir(err?.response?.data || err);
      alert('Create PO failed: ' + JSON.stringify(err?.response?.data || err?.message || String(err)));
    }
  };

  const exportCsv = () => {
    const rows = [['PO#', 'Supplier', 'Order Date', 'Expected', 'Items', 'Total', 'Status']];
    for (const o of orders) {
      rows.push([o.orderNumber, o.supplier?.name || '', o.orderDate || '', o.expectedDate || '', (o.items || []).map((it: any) => `${it.inventoryItem?.name || it.inventoryItemId} x ${it.quantity}`).join('; '), String(o.total || 0), o.status]);
    }
    const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'purchase_orders.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const openPayments = async (po: any) => {
    setShowPaymentsFor(po);
    try {
      const res = await api.get(`/restaurant/inventory/purchase-orders/${po.id}/payments`);
      setPayments(res.data?.data || []);
    } catch (err: any) {
      setPayments([]);
    }
  };

  const addPayment = async (poId: number, amount: number) => {
    try {
      await api.post(`/restaurant/inventory/purchase-orders/${poId}/payments`, { amount });
      const res = await api.get(`/restaurant/inventory/purchase-orders/${poId}/payments`);
      setPayments(res.data?.data || []);
      qc.invalidateQueries({ queryKey: ['inventory-pos'] });
    } catch (err: any) {
      alert('Failed to add payment: ' + (err?.response?.data?.error || err?.message || String(err)));
    }
  };

  const openViewPO = (po: any) => { setViewPO(po); };

  const uploadAttachment = async (poId: number, file: File) => {
    setUploading(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
        fr.onerror = reject;
        fr.readAsDataURL(file);
      });
      const res = await api.post(`/restaurant/inventory/purchase-orders/${poId}/attachments`, { filename: file.name, data, mimeType: file.type });
      alert('Uploaded: ' + file.name);
      setUploading(false);
    } catch (err: any) {
      setUploading(false);
      alert('Upload failed: ' + (err?.response?.data?.error || err?.message || String(err)));
    }
  };

  // Fetch supplier-specific items when supplier selected
  const fetchSupplierItems = async (supplierId: number | null) => {
    if (!supplierId) return setSupplierItems([]);
    try {
      const res = await api.get(`/restaurant/inventory/suppliers/${supplierId}/items`);
      // res.data.data is array of MRPs with inventoryItem included; map to unique inventoryItems
      const data = res.data?.data || [];
      const invs: any[] = [];
      for (const r of data) {
        // Support either MRPs with `inventoryItem` nested, or inventoryItem objects directly
        const inv = r?.inventoryItem ?? r;
        if (!inv) continue;
        if (!invs.find(i => i.id === inv.id)) invs.push(inv);
      }
      setSupplierItems(invs);
    } catch (err) {
      setSupplierItems([]);
    }
  };

  // Auto-fetch supplier items when supplier changes (useEffect to ensure modal and header both work)
  useEffect(() => {
    if (poSupplier) fetchSupplierItems(poSupplier);
    else setSupplierItems([]);
  }, [poSupplier]);

  if (isLoading) return <div className="p-8 text-center text-text-muted">Loading purchase orders...</div>;

  return (
    <div className="space-y-4 animate-in">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h1 className="text-2xl font-black text-text-primary">Purchase Orders</h1>
          <p className="text-xs text-text-muted mt-1">Create and manage purchase orders</p>

          <div className="mt-4 grid grid-cols-4 gap-4">
            <div className="p-4 bg-bg-tertiary rounded-lg border border-border/50">
              <div className="text-sm text-text-muted">Total Orders</div>
              <div className="text-xl font-black">{orders.length}</div>
            </div>
            <div className="p-4 bg-bg-tertiary rounded-lg border border-border/50">
              <div className="text-sm text-text-muted">Pending Orders</div>
              <div className="text-xl font-black">{orders.filter((o: any) => o.status === 'pending').length}</div>
            </div>
            <div className="p-4 bg-bg-tertiary rounded-lg border border-border/50">
              <div className="text-sm text-text-muted">Completed Orders</div>
              <div className="text-xl font-black">{orders.filter((o: any) => o.status === 'completed').length}</div>
            </div>
            <div className="p-4 bg-bg-tertiary rounded-lg border border-border/50">
              <div className="text-sm text-text-muted">Suppliers</div>
              <div className="text-xl font-black">{suppliers.length}</div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <input value={search} onChange={(e) => setSearch(e.target.value)} className="glass-input w-full max-w-2xl pl-4 h-11 text-sm" placeholder="Search by PO number or supplier..." />
            <select className="glass-input h-11 text-sm" value={poSupplier ?? ''} onChange={(e) => { const v = Number(e.target.value) || null; setPoSupplier(v); }}>{/* supplier filter */}
              <option value="">All Suppliers</option>
              {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className="glass-input h-11 text-sm"><option>All Status</option></select>
            <button onClick={() => { setSearch(''); setPoSupplier(null); }} className="px-3 py-2 border border-gray-700 text-gray-400 rounded">Clear Filters</button>
          </div>
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="flex gap-2">
            <Button size="sm" onClick={exportCsv}>Export CSV</Button>
            <Button size="sm" onClick={() => { setPoItems([{ quantity: 1 }]); setShowCreate(true); }}>Create PO</Button>
          </div>
        </div>
      </div>

      <Card padding={false}>
        <div className="overflow-x-auto text-[11px]">
          <table className="w-full">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border text-left">
                <th className="py-2.5 px-4 font-medium text-text-secondary">PO#</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary">Supplier</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary">Order Date</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary">Expected Delivery Date</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary">Items</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary">Total</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary">Status</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary">Paid</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary">Due</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {orders.filter((o: any) => o.orderNumber?.toLowerCase().includes(search.toLowerCase()) || o.supplier?.name?.toLowerCase().includes(search.toLowerCase())).map((o: any) => (
                <tr key={o.id} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-3 px-4 font-medium text-text-primary">{o.orderNumber}</td>
                  <td className="py-3 px-4 text-text-muted">{o.supplier?.name}</td>
                  <td className="py-3 px-4 text-text-muted">{o.orderDate ? new Date(o.orderDate).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                  <td className="py-3 px-4 text-text-muted">{o.expectedDate ? new Date(o.expectedDate).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                  <td className="py-3 px-4 text-text-muted">{o.items?.length || 0}</td>
                  <td className="py-3 px-4 font-mono text-text-primary font-medium">₹{Number(o.total || 0).toFixed(2)}</td>
                  <td className="py-3 px-4 text-text-muted">{o.status}</td>
                  <td className="py-3 px-4 text-text-muted">₹0.00</td>
                  <td className="py-3 px-4 text-text-muted">₹{Number(o.total || 0).toFixed(2)}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex justify-end gap-2">
                      {o.status === 'pending' && <button onClick={() => receive(o.id)} className="text-green-400 text-[10px] font-bold">Receive</button>}
                      <button onClick={() => openViewPO(o)} className="text-blue-400 text-[10px] font-bold">View</button>
                      <button onClick={() => openPayments(o)} className="text-amber-400 text-[10px] font-bold">Payments</button>
                      <button onClick={() => { setPoItems(o.items?.map((it: any) => ({ inventoryItemId: it.inventoryItemId, quantity: Number(it.quantity), unitCost: Number(it.unitCost), taxPercent: Number(it.taxPercent || 0), discountPercent: Number(it.discountPercent || 0) }))); setPoSupplier(o.supplierId); setOrderDate(o.orderDate ? new Date(o.orderDate).toISOString().slice(0,10) : new Date().toISOString().slice(0,10)); setExpectedDate(o.expectedDate ? new Date(o.expectedDate).toISOString().slice(0,10) : ''); setNote(o.note || ''); setShowCreate(true); }} className="text-violet-400 text-[10px] font-bold">Duplicate</button>
                    </div>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-text-muted italic">No purchase orders found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1c23] rounded-2xl p-6 w-full max-w-3xl mx-4 border border-gray-800 shadow-2xl">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-white font-bold text-lg">Create Purchase Order</h3>
                <p className="text-xs text-text-muted">Add items and expected delivery details</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowCreate(false)} className="text-gray-400">Close</button>
              </div>
            </div>

                  <div className="grid grid-cols-4 gap-3 mb-3">
                    <select value={poSupplier ?? ''} onChange={(e) => { const v = Number(e.target.value); setPoSupplier(v); fetchSupplierItems(v); }} className="glass-input px-3 py-2">
                <option value="">Select Supplier</option>
                {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}{s.contactPerson ? ` · ${s.contactPerson}` : ''}</option>)}
              </select>
                    <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className="glass-input px-3 py-2" />
                    <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} placeholder="dd-----yyyy" className="glass-input px-3 py-2" />
                    <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="glass-input px-3 py-2">
                      <option value="">Currency</option>
                      <option value="INR">INR</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </select>
            </div>

                  <div className="mb-3 flex items-center gap-3">
                    <label className="text-xs text-text-muted">Exchange Rate</label>
                    <input type="number" value={exchangeRate ?? ''} onChange={(e) => setExchangeRate(e.target.value ? Number(e.target.value) : '')} className="glass-input px-3 py-2 w-40" placeholder="1.0" />
                    <div className="ml-auto">
                      <label className="text-xs text-text-muted mr-2">Import CSV</label>
                      <input type="file" accept="text/csv" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const txt = await file.text();
                        const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                        const rows = lines.map(l => l.split(','));
                        // Expect header: name,quantity,unitCost
                        const header = rows[0].map(h => h.toLowerCase());
                        const nameIdx = header.indexOf('name');
                        const qtyIdx = header.indexOf('quantity');
                        const priceIdx = header.indexOf('unitcost') >= 0 ? header.indexOf('unitcost') : header.indexOf('unit_price');
                        const newRows: any[] = [];
                        for (let i = 1; i < rows.length; i++) {
                          const r = rows[i];
                          if (!r) continue;
                          const name = nameIdx >= 0 ? r[nameIdx] : null;
                          const qty = qtyIdx >= 0 ? Number(r[qtyIdx]) : 1;
                          const price = priceIdx >= 0 ? Number(r[priceIdx]) : 0;
                          if (!name) continue;
                          const matched = items.find((it: any) => it.name.toLowerCase() === name.toLowerCase());
                          if (matched) newRows.push({ inventoryItemId: matched.id, quantity: qty || 1, unitCost: price || 0 });
                        }
                        if (newRows.length) setPoItems(prev => [...prev, ...newRows]);
                      }} />
                    </div>
                  </div>

            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm text-text-muted">Items</h4>
              <button onClick={() => setPoItems(prev => [...prev, {}])} className="px-3 py-2 bg-purple-600 text-white rounded text-sm">Add Item</button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto mb-4">
              <div className="grid grid-cols-12 gap-2 text-text-secondary text-xs px-2 mb-1">
                <div className="col-span-6">ITEM NAME</div>
                <div className="col-span-2">QUANTITY</div>
                <div className="col-span-2">UNIT PRICE</div>
                <div className="col-span-1">TAX %</div>
                <div className="col-span-1">DISC %</div>
                <div className="col-span-12 text-xs text-text-muted mt-1">(Tip: import CSV with header name,quantity,unitcost)</div>
              </div>
              {poItems.map((row, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center px-2">
                  <div className="col-span-6">
                    <select value={row.inventoryItemId ?? ''} onChange={(e) => setPoItems(prev => { const t = [...prev]; t[idx].inventoryItemId = Number(e.target.value); return t; })} className="w-full px-3 py-2 bg-[#0f1014] border border-gray-800 rounded">
                      <option value="">Select an item...</option>
                      {(poSupplier && supplierItems.length ? supplierItems : items).map((it: any) => <option key={it.id} value={it.id}>{it.name} {it.currentStock !== undefined ? `· Stock: ${it.currentStock}` : ''}</option>)}
                      {(poSupplier && supplierItems.length === 0) && <option value="" disabled>No items found for this supplier</option>}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <input type="number" placeholder="1" value={row.quantity ?? ''} onChange={(e) => setPoItems(prev => { const t = [...prev]; t[idx].quantity = Number(e.target.value); return t; })} className="w-full px-3 py-2 bg-[#0f1014] border border-gray-800 rounded" />
                  </div>
                  <div className="col-span-2">
                    <input type="number" placeholder="0" value={row.unitCost ?? ''} onChange={(e) => setPoItems(prev => { const t = [...prev]; t[idx].unitCost = Number(e.target.value); return t; })} className="w-full px-3 py-2 bg-[#0f1014] border border-gray-800 rounded" />
                  </div>
                  <div className="col-span-1">
                    <input type="number" placeholder="0" value={(row as any).taxPercent ?? ''} onChange={(e) => setPoItems(prev => { const t = [...prev]; (t[idx] as any).taxPercent = Number(e.target.value); return t; })} className="w-full px-2 py-1 bg-[#0f1014] border border-gray-800 rounded text-xs" />
                  </div>
                  <div className="col-span-1">
                    <input type="number" placeholder="0" value={(row as any).discountPercent ?? ''} onChange={(e) => setPoItems(prev => { const t = [...prev]; (t[idx] as any).discountPercent = Number(e.target.value); return t; })} className="w-full px-2 py-1 bg-[#0f1014] border border-gray-800 rounded text-xs" />
                  </div>
                  <div className="col-span-2 text-right">
                    <button onClick={() => setPoItems(prev => { const t = [...prev]; t.splice(idx,1); return t; })} className="text-red-500 text-sm font-medium">Remove</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mb-4">
              <label className="text-xs text-text-muted">Notes</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} className="w-full mt-2 h-28 p-3 bg-[#0f1014] border border-gray-800 rounded" />
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="px-3 py-2 border border-gray-700 text-gray-400 rounded">Close</button>
              <button onClick={createPO} className="px-3 py-2 bg-purple-600 text-white rounded">Save</button>
            </div>
          </div>
        </div>
      )}

      {showPaymentsFor && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1c23] rounded-2xl p-6 w-full max-w-md mx-4 border border-gray-800">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-white font-bold">Payments — {showPaymentsFor.orderNumber}</h3>
                <p className="text-xs text-text-muted">Supplier: {showPaymentsFor.supplier?.name}</p>
              </div>
              <button onClick={() => setShowPaymentsFor(null)} className="text-gray-400">Close</button>
            </div>
            <div className="mb-3">
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {payments.length === 0 && <div className="text-sm text-text-muted">No payments recorded.</div>}
                {payments.map(p => (
                  <div key={p.id} className="flex justify-between items-center p-2 bg-bg-tertiary rounded">
                    <div>
                      <div className="text-sm">₹{Number(p.amount).toFixed(2)}</div>
                      <div className="text-xs text-text-muted">{p.method || ''} · {p.reference || ''}</div>
                    </div>
                    <div className="text-xs text-text-muted">{p.paymentDate ? new Date(p.paymentDate).toLocaleString() : new Date(p.createdAt).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <input id="payment-amount" placeholder="Amount" type="number" className="glass-input flex-1" />
              <button className="px-3 py-2 bg-green-600 text-white rounded" onClick={() => { const el = document.getElementById('payment-amount') as HTMLInputElement; const v = Number(el?.value || 0); if (v > 0) addPayment(showPaymentsFor.id, v); else alert('Enter amount'); }}>Add</button>
            </div>
          </div>
        </div>
      )}

      {viewPO && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1c23] rounded-2xl p-6 w-full max-w-3xl mx-4 border border-gray-800">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-white font-bold">{viewPO.orderNumber}</h3>
                <p className="text-xs text-text-muted">Supplier: {viewPO.supplier?.name}</p>
              </div>
              <button onClick={() => setViewPO(null)} className="text-gray-400">Close</button>
            </div>

            <div className="mb-4">
              <h4 className="text-sm text-text-muted mb-2">Items</h4>
              <div className="space-y-2">
                {(viewPO.items || []).map((it: any) => (
                  <div key={it.id} className="p-2 bg-bg-tertiary rounded flex justify-between">
                    <div>
                      <div className="font-medium">{it.inventoryItem?.name || it.inventoryItemId}</div>
                      <div className="text-xs text-text-muted">Qty: {it.quantity} · Unit: ₹{Number(it.unitCost).toFixed(2)}</div>
                    </div>
                    <div className="text-sm font-mono">₹{Number(it.total || (it.unitCost * it.quantity)).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <h4 className="text-sm text-text-muted">Attachments</h4>
              <div className="flex items-center gap-2 mt-2">
                <input type="file" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAttachment(viewPO.id, f); }} />
                {uploading && <div className="text-xs text-text-muted">Uploading...</div>}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setViewPO(null)} className="px-3 py-2 border border-gray-700 text-gray-400 rounded">Close</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
