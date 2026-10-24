import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ArrowLeftRight, Truck, Check, X, ShieldAlert, CornerUpLeft, Plus, Trash2, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';

export default function WarehouseTransfers() {
  const queryClient = useQueryClient();
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState<any | null>(null);
  const [showReturnModal, setShowReturnModal] = useState<any | null>(null);

  // Dispatch Form states
  const [fromBranchId, setFromBranchId] = useState<number | ''>('');
  const [toBranchId, setToBranchId] = useState<number | ''>('');
  const [dispatchItems, setDispatchItems] = useState<any[]>([]); // { inventoryItemId, quantityShipped, name, unitSymbol }
  const [dispatchNotes, setDispatchNotes] = useState('');

  // Dispatch item temp inputs
  const [tempItemId, setTempItemId] = useState<number | ''>('');
  const [tempQty, setTempQty] = useState<number | ''>('');

  // Receive Form states (indexed by inventoryItemId)
  const [receiveQtys, setReceiveQtys] = useState<Record<number, number>>({});
  const [receiveDamageQtys, setReceiveDamageQtys] = useState<Record<number, number>>({});
  const [receiveNotes, setReceiveNotes] = useState('');

  // Return Form states (indexed by inventoryItemId)
  const [returnQtys, setReturnQtys] = useState<Record<number, number>>({});
  const [returnNotes, setReturnNotes] = useState('');

  // Queries
  const { data: transfers = [], isLoading: loadingTransfers } = useQuery({
    queryKey: ['production-transfers'],
    queryFn: () => api.get('/restaurant/production/transfers').then(r => r.data.data),
    refetchInterval: 10000 // Refetch every 10s for near real-time updates
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get('/restaurant/branches').then(r => r.data.data).catch(() => [])
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: () => api.get('/restaurant/inventory/items').then(r => r.data.data)
  });

  // Mutations
  const dispatchMutation = useMutation({
    mutationFn: (payload: any) => api.post('/restaurant/production/transfers/dispatch', payload),
    onSuccess: () => {
      toast.success('Shipment dispatched and warehouse stock deducted');
      queryClient.invalidateQueries({ queryKey: ['production-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      resetDispatchForm();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to dispatch shipment');
    }
  });

  const receiveMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => 
      api.post(`/restaurant/production/transfers/${id}/receive`, payload),
    onSuccess: () => {
      toast.success('Shipment received successfully. Local stock updated.');
      queryClient.invalidateQueries({ queryKey: ['production-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      setShowReceiveModal(null);
      setReceiveQtys({});
      setReceiveDamageQtys({});
      setReceiveNotes('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to receive shipment');
    }
  });

  const returnMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => 
      api.post(`/restaurant/production/transfers/${id}/return`, payload),
    onSuccess: () => {
      toast.success('Return shipment dispatched successfully.');
      queryClient.invalidateQueries({ queryKey: ['production-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      setShowReturnModal(null);
      setReturnQtys({});
      setReturnNotes('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to dispatch return shipment');
    }
  });

  const resetDispatchForm = () => {
    setFromBranchId('');
    setToBranchId('');
    setDispatchItems([]);
    setDispatchNotes('');
    setTempItemId('');
    setTempQty('');
    setShowDispatchModal(false);
  };

  const handleAddDispatchItem = () => {
    if (!tempItemId || !tempQty || Number(tempQty) <= 0) {
      toast.error('Select an item and enter a positive dispatch quantity');
      return;
    }

    const selectedItem = inventoryItems.find((it: any) => it.id === Number(tempItemId));
    if (!selectedItem) return;

    if (dispatchItems.some(di => di.inventoryItemId === selectedItem.id)) {
      toast.error('This item is already added to the dispatch list');
      return;
    }

    setDispatchItems([
      ...dispatchItems,
      {
        inventoryItemId: selectedItem.id,
        quantityShipped: Number(tempQty),
        name: selectedItem.name,
        unitSymbol: selectedItem.unit?.symbol || ''
      }
    ]);
    setTempItemId('');
    setTempQty('');
  };

  const handleRemoveDispatchItem = (id: number) => {
    setDispatchItems(dispatchItems.filter(di => di.inventoryItemId !== id));
  };

  const handleDispatchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromBranchId || !toBranchId || dispatchItems.length === 0) {
      toast.error('Please select branches and add at least one item');
      return;
    }
    if (fromBranchId === toBranchId) {
      toast.error('Source and destination branches must be different');
      return;
    }

    const payload = {
      fromBranchId: Number(fromBranchId),
      toBranchId: Number(toBranchId),
      notes: dispatchNotes.trim() || undefined,
      items: dispatchItems.map(di => ({
        inventoryItemId: di.inventoryItemId,
        quantityShipped: di.quantityShipped
      }))
    };

    dispatchMutation.mutate(payload);
  };

  const openReceiveModal = (transfer: any) => {
    setShowReceiveModal(transfer);
    const initialQtys: Record<number, number> = {};
    const initialDamage: Record<number, number> = {};
    transfer.items.forEach((item: any) => {
      initialQtys[item.inventoryItemId] = Number(item.quantityShipped);
      initialDamage[item.inventoryItemId] = 0;
    });
    setReceiveQtys(initialQtys);
    setReceiveDamageQtys(initialDamage);
  };

  const handleReceiveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showReceiveModal) return;

    const payload = {
      notes: receiveNotes.trim() || undefined,
      items: showReceiveModal.items.map((item: any) => {
        const itemId = item.inventoryItemId;
        return {
          inventoryItemId: itemId,
          quantityReceived: Number(receiveQtys[itemId] ?? 0),
          quantityDamaged: Number(receiveDamageQtys[itemId] ?? 0)
        };
      })
    };

    receiveMutation.mutate({ id: showReceiveModal.id, payload });
  };

  const openReturnModal = (transfer: any) => {
    setShowReturnModal(transfer);
    const initialQtys: Record<number, number> = {};
    transfer.items.forEach((item: any) => {
      initialQtys[item.inventoryItemId] = 0;
    });
    setReturnQtys(initialQtys);
  };

  const handleReturnSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showReturnModal) return;

    const itemsToReturn = showReturnModal.items
      .map((item: any) => ({
        inventoryItemId: item.inventoryItemId,
        quantityReturned: Number(returnQtys[item.inventoryItemId] ?? 0)
      }))
      .filter((i: any) => i.quantityReturned > 0);

    if (itemsToReturn.length === 0) {
      toast.error('Please enter a return quantity for at least one item');
      return;
    }

    const payload = {
      notes: returnNotes.trim() || undefined,
      items: itemsToReturn
    };

    returnMutation.mutate({ id: showReturnModal.id, payload });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'shipped':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">In Transit</span>;
      case 'received':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">Received</span>;
      case 'completed_with_discrepancy':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> Discrepancy</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-500/10 text-gray-400 border border-gray-500/20">{status}</span>;
    }
  };

  return (
    <div className="space-y-4 animate-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-text-primary">Warehouse Transfers</h1>
          <p className="text-xs text-text-muted mt-1">Dispatch manufactured bakery inventory to branches, reconcile stock discrepancies, and execute reverse returns</p>
        </div>
        <Button className="bg-purple-600" size="sm" onClick={() => { resetDispatchForm(); setShowDispatchModal(true); }}>
          <Truck className="w-4 h-4 mr-1" /> Dispatch Shipment
        </Button>
      </div>

      {loadingTransfers ? (
        <div className="p-8 text-center text-text-muted">Loading transfers...</div>
      ) : transfers.length === 0 ? (
        <div className="p-12 text-center text-text-muted border border-dashed border-border rounded-xl">
          No stock transfers recorded. Dispatch products from the main warehouse to start tracking.
        </div>
      ) : (
        <div className="space-y-4">
          {transfers.map((transfer: any) => (
            <Card key={transfer.id} className="border border-border/50 hover:border-purple-500/10 transition-all">
              <div className="p-4 space-y-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded bg-purple-500/10 flex items-center justify-center text-purple-400">
                      <Truck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-text-primary text-sm font-mono">{transfer.transferNumber}</span>
                        {getStatusBadge(transfer.status)}
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 capitalize">{transfer.transferType}</span>
                      </div>
                      <div className="text-[11px] text-text-secondary mt-0.5">
                        From: <span className="text-text-primary font-medium">{branches.find((b: any) => b.id === transfer.fromBranchId)?.name || 'Warehouse'}</span> → 
                        To: <span className="text-text-primary font-medium">{branches.find((b: any) => b.id === transfer.toBranchId)?.name || 'Restaurant'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono text-text-muted text-right">
                    <div>
                      <div>Shipped: {new Date(transfer.shippedAt).toLocaleDateString()}</div>
                      {transfer.receivedAt && (
                        <div>Received: {new Date(transfer.receivedAt).toLocaleDateString()}</div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {transfer.status === 'shipped' && (
                        <Button
                          size="sm"
                          className="bg-green-600/90 text-white font-bold"
                          onClick={() => openReceiveModal(transfer)}
                        >
                          <Check className="w-3.5 h-3.5 mr-0.5" /> Receive
                        </Button>
                      )}
                      {transfer.status === 'completed_with_discrepancy' && transfer.transferType !== 'return' && (
                        <Button
                          size="sm"
                          className="bg-amber-600/95 text-white font-bold"
                          onClick={() => openReturnModal(transfer)}
                        >
                          <CornerUpLeft className="w-3.5 h-3.5 mr-0.5" /> Return Damaged
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {transfer.notes && (
                  <div className="bg-bg-tertiary/20 p-2 rounded border border-border/30 text-[10px] text-text-muted">
                    <span className="font-bold text-text-secondary">Notes:</span> {transfer.notes}
                  </div>
                )}

                {/* Transfer Items Table */}
                <div className="border border-border/40 rounded-lg overflow-hidden text-[10px] mt-2">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-bg-tertiary/50 border-b border-border/40 text-text-secondary font-bold">
                        <th className="py-1.5 px-3">Item</th>
                        <th className="py-1.5 px-3 text-right">Shipped Qty</th>
                        <th className="py-1.5 px-3 text-right">Received Qty</th>
                        <th className="py-1.5 px-3 text-right">Damaged Qty</th>
                        <th className="py-1.5 px-3 text-right font-mono">Unit Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20 text-text-secondary">
                      {transfer.items?.map((item: any) => (
                        <tr key={item.id} className="hover:bg-bg-hover/10">
                          <td className="py-1.5 px-3 text-text-primary font-medium">{item.inventoryItem?.name}</td>
                          <td className="py-1.5 px-3 text-right font-mono">{Number(item.quantityShipped)}</td>
                          <td className="py-1.5 px-3 text-right font-mono">{Number(item.quantityReceived)}</td>
                          <td className={`py-1.5 px-3 text-right font-mono ${Number(item.quantityDamaged) > 0 ? 'text-red-400 font-bold' : ''}`}>
                            {Number(item.quantityDamaged)}
                          </td>
                          <td className="py-1.5 px-3 text-right font-mono">₹{Number(item.unitCost).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* DISPATCH SHIPMENT DIALOG */}
      {showDispatchModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-in fade-in">
          <div className="bg-[#1a1c23] rounded-2xl border border-gray-800 shadow-2xl w-full max-w-xl mx-4 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="text-white font-bold text-base flex items-center gap-1.5">
                <Truck className="w-5 h-5 text-purple-400" />
                Dispatch Stock Transfer
              </h3>
              <button onClick={resetDispatchForm} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDispatchSubmit} className="p-4 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Source (Warehouse) *</label>
                  <select
                    value={fromBranchId}
                    onChange={(e) => setFromBranchId(e.target.value ? Number(e.target.value) : '')}
                    required
                    className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded text-sm text-white focus:outline-none"
                  >
                    <option value="">Select Source</option>
                    {branches.map((b: any) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Destination (Restaurant Branch) *</label>
                  <select
                    value={toBranchId}
                    onChange={(e) => setToBranchId(e.target.value ? Number(e.target.value) : '')}
                    required
                    className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded text-sm text-white focus:outline-none"
                  >
                    <option value="">Select Destination</option>
                    {branches.map((b: any) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Add Items Box */}
              <div className="bg-[#0f1014]/60 border border-gray-800/80 rounded-xl p-3 space-y-3">
                <span className="text-[10px] uppercase font-bold tracking-wider text-purple-400">Add Items to Shipment</span>
                <div className="grid grid-cols-3 gap-2 items-end">
                  <div className="flex flex-col gap-1.5 col-span-2">
                    <select
                      value={tempItemId}
                      onChange={(e) => setTempItemId(e.target.value ? Number(e.target.value) : '')}
                      className="px-3 py-1.5 bg-[#0f1014] border border-gray-800 rounded text-xs text-white"
                    >
                      <option value="">Choose Finished Goods / Product</option>
                      {inventoryItems.map((it: any) => (
                        <option key={it.id} value={it.id}>{it.name} ({it.unit?.symbol || 'pcs'})</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-1">
                    <input
                      type="number"
                      step="any"
                      placeholder="Qty"
                      value={tempQty}
                      onChange={(e) => setTempQty(e.target.value ? Number(e.target.value) : '')}
                      className="w-16 px-2 py-1.5 bg-[#0f1014] border border-gray-800 rounded text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={handleAddDispatchItem}
                      className="flex-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-bold"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

              {/* Dispatch Items Table */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Shipment Items Checklist</label>
                <div className="border border-gray-800 rounded-lg overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gray-900 border-b border-gray-800 text-[10px] font-bold text-gray-400 uppercase">
                        <th className="py-2 px-3">Product Name</th>
                        <th className="py-2 px-3 text-right">Dispatch Qty</th>
                        <th className="py-2 px-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                      {dispatchItems.map((line) => (
                        <tr key={line.inventoryItemId} className="hover:bg-gray-800/10">
                          <td className="py-2 px-3 text-white font-medium">{line.name}</td>
                          <td className="py-2 px-3 text-right font-mono text-gray-300 font-bold">
                            {line.quantityShipped} {line.unitSymbol}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveDispatchItem(line.inventoryItemId)}
                              className="text-red-400 hover:text-red-300"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {dispatchItems.length === 0 && (
                        <tr>
                          <td colSpan={3} className="py-6 text-center text-gray-500 italic">Add products above to create shipment payload.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Transit Notes / Vehicle No.</label>
                <input
                  value={dispatchNotes}
                  onChange={(e) => setDispatchNotes(e.target.value)}
                  placeholder="e.g. Sent via delivery van TN-04-A-1234"
                  className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded text-sm text-white focus:outline-none"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-gray-800">
                <button
                  type="button"
                  onClick={resetDispatchForm}
                  className="px-4 py-2 border border-gray-700 text-gray-400 rounded-lg text-xs font-bold hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={dispatchItems.length === 0}
                  className={`px-5 py-2 rounded-lg text-xs font-bold text-white transition-all ${
                    dispatchItems.length === 0
                      ? 'bg-purple-900/40 text-gray-500 cursor-not-allowed border border-purple-800/10'
                      : 'bg-purple-600 hover:bg-purple-700'
                  }`}
                >
                  Confirm Dispatch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECEIVE SHIPMENT DIALOG */}
      {showReceiveModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-in fade-in">
          <div className="bg-[#1a1c23] rounded-2xl border border-gray-800 shadow-2xl w-full max-w-xl mx-4 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="text-white font-bold text-base flex items-center gap-1.5">
                <Check className="w-5 h-5 text-green-400" />
                Receive Shipment: {showReceiveModal.transferNumber}
              </h3>
              <button onClick={() => setShowReceiveModal(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReceiveSubmit} className="p-4 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
              <div className="border border-gray-800 rounded-lg overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-900 border-b border-gray-800 text-[10px] font-bold text-gray-400 uppercase">
                      <th className="py-2.5 px-3">Product</th>
                      <th className="py-2.5 px-3 text-right">Shipped Qty</th>
                      <th className="py-2.5 px-3 text-center">Good Rec. Qty</th>
                      <th className="py-2.5 px-3 text-center">Damaged Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {showReceiveModal.items?.map((item: any) => {
                      const itemId = item.inventoryItemId;
                      const shipped = Number(item.quantityShipped);
                      return (
                        <tr key={item.id} className="hover:bg-gray-800/10">
                          <td className="py-2 px-3 text-white font-medium">{item.inventoryItem?.name}</td>
                          <td className="py-2 px-3 text-right font-mono text-gray-300 font-bold">{shipped}</td>
                          <td className="py-2 px-3 text-center">
                            <input
                              type="number"
                              step="any"
                              value={receiveQtys[itemId] ?? ''}
                              onChange={(e) => {
                                const val = e.target.value === '' ? 0 : Number(e.target.value);
                                setReceiveQtys(prev => ({ ...prev, [itemId]: val }));
                              }}
                              className="w-16 px-1.5 py-1 bg-[#0f1014] border border-gray-800 rounded text-center text-xs text-white"
                            />
                          </td>
                          <td className="py-2 px-3 text-center">
                            <input
                              type="number"
                              step="any"
                              value={receiveDamageQtys[itemId] ?? ''}
                              onChange={(e) => {
                                const val = e.target.value === '' ? 0 : Number(e.target.value);
                                setReceiveDamageQtys(prev => ({ ...prev, [itemId]: val }));
                              }}
                              className="w-16 px-1.5 py-1 bg-[#0f1014] border border-gray-800 rounded text-center text-xs text-white"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Receive Comments / Remarks</label>
                <input
                  value={receiveNotes}
                  onChange={(e) => setReceiveNotes(e.target.value)}
                  placeholder="e.g. 2 buns were squashed in transit, logged as damaged."
                  className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded text-sm text-white focus:outline-none"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowReceiveModal(null)}
                  className="px-4 py-2 border border-gray-700 text-gray-400 rounded-lg text-xs font-bold hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold"
                >
                  Verify and Log Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RETURN DAMAGED DIALOG */}
      {showReturnModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-in fade-in">
          <div className="bg-[#1a1c23] rounded-2xl border border-gray-800 shadow-2xl w-full max-w-xl mx-4 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="text-white font-bold text-base flex items-center gap-1.5">
                <CornerUpLeft className="w-5 h-5 text-amber-400" />
                Return Transit Discrepancies: {showReturnModal.transferNumber}
              </h3>
              <button onClick={() => setShowReturnModal(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReturnSubmit} className="p-4 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
              <div className="border border-gray-800 rounded-lg overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-900 border-b border-gray-800 text-[10px] font-bold text-gray-400 uppercase">
                      <th className="py-2.5 px-3">Product</th>
                      <th className="py-2.5 px-3 text-right">Received Good</th>
                      <th className="py-2.5 px-3 text-right">Damaged Qty</th>
                      <th className="py-2.5 px-3 text-center">Return Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {showReturnModal.items?.map((item: any) => {
                      const itemId = item.inventoryItemId;
                      const maxReturn = Number(item.quantityReceived);
                      return (
                        <tr key={item.id} className="hover:bg-gray-800/10">
                          <td className="py-2 px-3 text-white font-medium">{item.inventoryItem?.name}</td>
                          <td className="py-2 px-3 text-right font-mono text-gray-400">{maxReturn}</td>
                          <td className="py-2 px-3 text-right font-mono text-red-400 font-bold">{Number(item.quantityDamaged)}</td>
                          <td className="py-2 px-3 text-center">
                            <input
                              type="number"
                              step="any"
                              max={maxReturn}
                              value={returnQtys[itemId] ?? ''}
                              onChange={(e) => {
                                const val = e.target.value === '' ? 0 : Number(e.target.value);
                                setReturnQtys(prev => ({ ...prev, [itemId]: val }));
                              }}
                              placeholder={`max ${maxReturn}`}
                              className="w-20 px-1.5 py-1 bg-[#0f1014] border border-gray-800 rounded text-center text-xs text-white"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Return Reason / Notes</label>
                <input
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder="e.g. Returning excess/spoiled buns back to warehouse"
                  className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded text-sm text-white focus:outline-none"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowReturnModal(null)}
                  className="px-4 py-2 border border-gray-700 text-gray-400 rounded-lg text-xs font-bold hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold"
                >
                  Dispatch Return Shipment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
