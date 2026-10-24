import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Play, ClipboardList, Trash2, Calendar, AlertTriangle, X, FileText, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ProductionRuns() {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);

  // Form states
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | ''>('');
  const [branchId, setBranchId] = useState<number | ''>('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [overheadCost, setOverheadCost] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [wasteQty, setWasteQty] = useState<number | ''>('');
  const [wasteReason, setWasteReason] = useState('');

  // Queries
  const { data: runs = [], isLoading: loadingRuns } = useQuery({
    queryKey: ['production-runs'],
    queryFn: () => api.get('/restaurant/production/runs').then(r => r.data.data)
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ['production-recipes'],
    queryFn: () => api.get('/restaurant/production/recipes').then(r => r.data.data)
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
  const executeRunMutation = useMutation({
    mutationFn: (payload: any) => api.post('/restaurant/production/runs', payload),
    onSuccess: () => {
      toast.success('Production batch completed and inventory updated');
      queryClient.invalidateQueries({ queryKey: ['production-runs'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to complete production run');
    }
  });

  const resetForm = () => {
    setSelectedRecipeId('');
    setBranchId('');
    setQuantity('');
    setOverheadCost('');
    setNotes('');
    setWasteQty('');
    setWasteReason('');
    setShowAddModal(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecipeId || !branchId || !quantity) {
      toast.error('Please fill in all required fields');
      return;
    }

    const payload = {
      recipeId: Number(selectedRecipeId),
      branchId: Number(branchId),
      quantity: Number(quantity),
      overheadCost: overheadCost ? Number(overheadCost) : undefined,
      notes: notes.trim() || undefined,
      wasteQty: wasteQty ? Number(wasteQty) : undefined,
      wasteReason: wasteReason.trim() || undefined
    };

    executeRunMutation.mutate(payload);
  };

  // Resolve scaled ingredients requirements in real-time
  const getScaledIngredients = () => {
    if (!selectedRecipeId || !quantity) return [];
    const recipe = recipes.find((r: any) => r.id === Number(selectedRecipeId));
    if (!recipe) return [];

    const scaleFactor = Number(quantity) / Number(recipe.targetQuantity);

    return recipe.ingredients.map((ing: any) => {
      const neededQty = ing.quantity * scaleFactor;
      // Find branch stock or global stock
      let currentStock = 0;
      const invItem = inventoryItems.find((it: any) => it.id === ing.inventoryItemId);
      if (invItem) {
        if (!branchId) {
          currentStock = Number(invItem.currentStock || 0);
        } else {
          const bs = (invItem.branchStocks || []).find((b: any) => b.branchId === Number(branchId));
          currentStock = bs ? Number(bs.quantity || 0) : 0;
        }
      }

      return {
        id: ing.inventoryItemId,
        name: ing.inventoryItem?.name || 'Unknown',
        neededQty: Number(neededQty.toFixed(3)),
        currentStock: Number(currentStock.toFixed(3)),
        unitSymbol: ing.inventoryItem?.unit?.symbol || '',
        isSufficient: currentStock >= neededQty
      };
    });
  };

  const ingredientsPreview = getScaledIngredients();
  const isSufficientStock = ingredientsPreview.every((ing: any) => ing.isSufficient);

  return (
    <div className="space-y-4 animate-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-text-primary">Production Batches</h1>
          <p className="text-xs text-text-muted mt-1">Execute production runs, track batch overhead costs, and deduct ingredient stock instantly</p>
        </div>
        <Button className="bg-purple-600" size="sm" onClick={() => { resetForm(); setShowAddModal(true); }}>
          <Play className="w-4 h-4 mr-1" /> Run Production Batch
        </Button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-bg-tertiary rounded-lg border border-border/50">
          <div className="text-xs text-text-muted font-medium">Total Runs Completed</div>
          <div className="text-xl font-black text-text-primary mt-1">{runs.length}</div>
        </div>
        <div className="p-4 bg-bg-tertiary rounded-lg border border-border/50">
          <div className="text-xs text-text-muted font-medium">Total Quantity Produced</div>
          <div className="text-xl font-black text-purple-400 mt-1">
            {runs.reduce((acc: number, r: any) => acc + Number(r.quantity), 0).toFixed(1)} Unit(s)
          </div>
        </div>
        <div className="p-4 bg-bg-tertiary rounded-lg border border-border/50">
          <div className="text-xs text-text-muted font-medium">Total Overhead Incurred</div>
          <div className="text-xl font-black text-green-400 mt-1">
            ₹{runs.reduce((acc: number, r: any) => acc + Number(r.overheadCost || 0), 0).toFixed(2)}
          </div>
        </div>
      </div>

      <Card padding={false}>
        <div className="overflow-x-auto text-[11px]">
          <table className="w-full">
            <thead>
              <tr className="bg-bg-tertiary/50 border-b border-border text-left">
                <th className="py-2.5 px-4 font-medium text-text-secondary">Recipe / Finished Item</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary">Branch / Location</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary text-right">Yield Qty</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary text-right">Material Cost</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary text-right">Overhead Cost</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary text-right">Total Cost</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary text-right">Wastage</th>
                <th className="py-2.5 px-4 font-medium text-text-secondary text-center">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {runs.map((run: any) => (
                <tr key={run.id} className="hover:bg-bg-hover/30 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-text-primary">{run.recipe?.name}</div>
                    <div className="text-[10px] text-text-muted">Item: {run.inventoryItem?.name}</div>
                  </td>
                  <td className="py-3 px-4 text-text-secondary">
                    {run.branch?.name || 'Main Warehouse'}
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-text-primary text-right">
                    {Number(run.quantity)} {run.inventoryItem?.unit?.symbol}
                  </td>
                  <td className="py-3 px-4 font-mono text-text-secondary text-right">
                    ₹{Number(run.materialCost || 0).toFixed(2)}
                  </td>
                  <td className="py-3 px-4 font-mono text-text-secondary text-right">
                    ₹{Number(run.overheadCost || 0).toFixed(2)}
                  </td>
                  <td className="py-3 px-4 font-mono text-purple-400 font-bold text-right">
                    ₹{Number(run.totalCost || 0).toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {Number(run.wasteQty || 0) > 0 ? (
                      <div className="text-red-400 font-mono font-medium">
                        {Number(run.wasteQty)} {run.inventoryItem?.unit?.symbol}
                        {run.wasteReason && (
                          <div className="text-[9px] text-text-muted italic font-sans">{run.wasteReason}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-text-muted text-center font-mono">
                    {new Date(run.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-text-muted italic">No production runs recorded yet. Start a run to populate inventory.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* PRODUCTION RUN BATCH DIALOG */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-in fade-in">
          <div className="bg-[#1a1c23] rounded-2xl border border-gray-800 shadow-2xl w-full max-w-xl mx-4 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="text-white font-bold text-base flex items-center gap-1.5">
                <Play className="w-5 h-5 text-purple-400" />
                Run Production Batch
              </h3>
              <button onClick={resetForm} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[78vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5 col-span-2 md:col-span-1">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Production Recipe *</label>
                  <select
                    value={selectedRecipeId}
                    onChange={(e) => setSelectedRecipeId(e.target.value ? Number(e.target.value) : '')}
                    required
                    className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded text-sm text-white focus:outline-none focus:border-purple-600"
                  >
                    <option value="">Select Recipe</option>
                    {recipes.map((r: any) => (
                      <option key={r.id} value={r.id}>{r.name} (yields {r.targetQuantity} {r.unit?.symbol})</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5 col-span-2 md:col-span-1">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Warehouse Branch Location *</label>
                  <select
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : '')}
                    required
                    className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded text-sm text-white focus:outline-none focus:border-purple-600"
                  >
                    <option value="">Select Production Site</option>
                    {branches.map((b: any) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Actual Yield (Produced Qty) *</label>
                  <input
                    type="number"
                    step="any"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value ? Number(e.target.value) : '')}
                    required
                    placeholder="e.g. 50"
                    className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded text-sm text-white focus:outline-none focus:border-purple-600"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Overhead Cost (Gas, Labor, Power) (₹)</label>
                  <input
                    type="number"
                    step="any"
                    value={overheadCost}
                    onChange={(e) => setOverheadCost(e.target.value ? Number(e.target.value) : '')}
                    placeholder="e.g. 250"
                    className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded text-sm text-white focus:outline-none focus:border-purple-600"
                  />
                </div>
              </div>

              {/* Optional Wastage */}
              <div className="border border-gray-800 bg-[#0f1014]/30 rounded-xl p-3 space-y-3">
                <span className="text-[10px] uppercase font-bold tracking-wider text-red-400">Log Yield Wastage (Optional)</span>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] uppercase font-bold text-gray-400">Waste Qty</label>
                    <input
                      type="number"
                      step="any"
                      value={wasteQty}
                      onChange={(e) => setWasteQty(e.target.value ? Number(e.target.value) : '')}
                      placeholder="e.g. 2"
                      className="px-2 py-1.5 bg-[#0f1014] border border-gray-800 rounded text-xs text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] uppercase font-bold text-gray-400">Wastage Reason</label>
                    <input
                      value={wasteReason}
                      onChange={(e) => setWasteReason(e.target.value)}
                      placeholder="e.g. Burnt pieces"
                      className="px-2 py-1.5 bg-[#0f1014] border border-gray-800 rounded text-xs text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Scaled Ingredients Live Preview */}
              {selectedRecipeId && quantity && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Expected Stock Consumption</label>
                    {!isSufficientStock && (
                      <div className="text-[10px] text-red-400 font-bold flex items-center gap-1 animate-pulse">
                        <AlertTriangle className="w-3.5 h-3.5" /> Insufficient stock on-site!
                      </div>
                    )}
                  </div>

                  <div className="border border-gray-800 rounded-lg overflow-hidden text-xs">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-gray-900 border-b border-gray-800 text-[10px] font-bold text-gray-400 uppercase">
                          <th className="py-2 px-3">Ingredient</th>
                          <th className="py-2 px-3 text-right">Req. Qty</th>
                          <th className="py-2 px-3 text-right">Branch Stock</th>
                          <th className="py-2 px-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/50">
                        {ingredientsPreview.map((ing: any) => (
                          <tr key={ing.id} className="hover:bg-gray-800/10">
                            <td className="py-2 px-3 text-white font-medium">{ing.name}</td>
                            <td className="py-2 px-3 text-right font-mono text-gray-300">
                              {ing.neededQty} {ing.unitSymbol}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-gray-300">
                              {ing.currentStock} {ing.unitSymbol}
                            </td>
                            <td className="py-2 px-3 text-center">
                              {ing.isSufficient ? (
                                <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 text-[9px] font-bold">OK</span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 text-[9px] font-bold">LACKING</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Batch Notes</label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Baking ran smoothly. Texture looks normal."
                  className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded text-sm text-white focus:outline-none focus:border-purple-600"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-gray-800">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 border border-gray-700 text-gray-400 rounded-lg text-xs font-bold hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!isSufficientStock && quantity !== ''}
                  className={`px-5 py-2 rounded-lg text-xs font-bold text-white transition-all ${
                    !isSufficientStock && quantity !== ''
                      ? 'bg-purple-900/40 text-gray-500 cursor-not-allowed border border-purple-800/10'
                      : 'bg-purple-600 hover:bg-purple-700'
                  }`}
                >
                  Complete Batch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
