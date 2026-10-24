import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Search, Plus, Trash2, Edit, X, ChefHat, Check } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ProductionRecipes() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<any | null>(null);

  // Form states
  const [recipeName, setRecipeName] = useState('');
  const [description, setDescription] = useState('');
  const [targetQuantity, setTargetQuantity] = useState<number | ''>('');
  const [unitId, setUnitId] = useState<number | ''>('');
  const [inventoryItemId, setInventoryItemId] = useState<number | ''>('');
  const [ingredientsList, setIngredientsList] = useState<any[]>([]); // { inventoryItemId, quantity }

  // Temp ingredient states
  const [tempItemId, setTempItemId] = useState<number | ''>('');
  const [tempQty, setTempQty] = useState<number | ''>('');

  // Queries
  const { data: recipes = [], isLoading: loadingRecipes } = useQuery({
    queryKey: ['production-recipes'],
    queryFn: () => api.get('/restaurant/production/recipes').then(r => r.data.data)
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: () => api.get('/restaurant/inventory/items').then(r => r.data.data)
  });

  const { data: units = [] } = useQuery({
    queryKey: ['inventory-units'],
    queryFn: () => api.get('/restaurant/inventory/units').then(r => r.data.data)
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post('/restaurant/production/recipes', payload),
    onSuccess: () => {
      toast.success('Recipe created successfully');
      queryClient.invalidateQueries({ queryKey: ['production-recipes'] });
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to create recipe');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => 
      api.put(`/restaurant/production/recipes/${id}`, payload),
    onSuccess: () => {
      toast.success('Recipe updated successfully');
      queryClient.invalidateQueries({ queryKey: ['production-recipes'] });
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to update recipe');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/restaurant/production/recipes/${id}`),
    onSuccess: () => {
      toast.success('Recipe deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['production-recipes'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to delete recipe');
    }
  });

  const resetForm = () => {
    setRecipeName('');
    setDescription('');
    setTargetQuantity('');
    setUnitId('');
    setInventoryItemId('');
    setIngredientsList([]);
    setTempItemId('');
    setTempQty('');
    setShowAddModal(false);
    setEditingRecipe(null);
  };

  const handleOpenEdit = (recipe: any) => {
    setEditingRecipe(recipe);
    setRecipeName(recipe.name);
    setDescription(recipe.description || '');
    setTargetQuantity(Number(recipe.targetQuantity));
    setUnitId(recipe.unitId);
    setInventoryItemId(recipe.inventoryItemId);
    setIngredientsList(
      recipe.ingredients.map((ing: any) => ({
        inventoryItemId: ing.inventoryItemId,
        quantity: Number(ing.quantity),
        name: ing.inventoryItem?.name || 'Unknown',
        unitSymbol: ing.inventoryItem?.unit?.symbol || ''
      }))
    );
    setShowAddModal(true);
  };

  const handleAddIngredient = () => {
    if (!tempItemId || !tempQty || Number(tempQty) <= 0) {
      toast.error('Please select an item and enter a positive quantity');
      return;
    }
    const selectedItem = inventoryItems.find((it: any) => it.id === Number(tempItemId));
    if (!selectedItem) return;

    if (ingredientsList.some(item => item.inventoryItemId === selectedItem.id)) {
      toast.error('This ingredient is already in the list');
      return;
    }

    setIngredientsList([
      ...ingredientsList,
      {
        inventoryItemId: selectedItem.id,
        quantity: Number(tempQty),
        name: selectedItem.name,
        unitSymbol: selectedItem.unit?.symbol || ''
      }
    ]);
    setTempItemId('');
    setTempQty('');
  };

  const handleRemoveIngredient = (id: number) => {
    setIngredientsList(ingredientsList.filter(item => item.inventoryItemId !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipeName.trim() || !targetQuantity || !unitId || !inventoryItemId) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (ingredientsList.length === 0) {
      toast.error('Please add at least one ingredient');
      return;
    }

    const payload = {
      name: recipeName.trim(),
      description: description.trim() || undefined,
      targetQuantity: Number(targetQuantity),
      unitId: Number(unitId),
      inventoryItemId: Number(inventoryItemId),
      ingredients: ingredientsList.map(ing => ({
        inventoryItemId: ing.inventoryItemId,
        quantity: ing.quantity
      }))
    };

    if (editingRecipe) {
      updateMutation.mutate({ id: editingRecipe.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const filteredRecipes = recipes.filter((r: any) =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.inventoryItem?.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 animate-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-text-primary">Production Recipes (BOM)</h1>
          <p className="text-xs text-text-muted mt-1">Manage Bill of Materials (BOM) for manufactured goods and bakery items</p>
        </div>
        <Button className="bg-purple-600" size="sm" onClick={() => { resetForm(); setShowAddModal(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Add Recipe
        </Button>
      </div>

      <div className="flex items-center gap-2 max-w-md">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="glass-input w-full pl-4 h-10 text-sm"
          placeholder="Search recipes..."
        />
      </div>

      {loadingRecipes ? (
        <div className="p-8 text-center text-text-muted">Loading recipes...</div>
      ) : filteredRecipes.length === 0 ? (
        <div className="p-12 text-center text-text-muted border border-dashed border-border rounded-xl">
          No production recipes found. Create one to begin baking runs.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredRecipes.map((recipe: any) => (
            <Card key={recipe.id} className="border border-border/50 hover:border-purple-500/30 transition-all flex flex-col justify-between">
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded bg-purple-500/10 flex items-center justify-center text-purple-400">
                      <ChefHat className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-text-primary text-sm leading-none">{recipe.name}</h3>
                      <span className="text-[10px] text-text-muted mt-1 inline-block">Produces: {recipe.inventoryItem?.name}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono font-bold text-purple-400">Yield: {recipe.targetQuantity} {recipe.unit?.symbol}</span>
                  </div>
                </div>

                {recipe.description && (
                  <p className="text-[11px] text-text-muted line-clamp-2">{recipe.description}</p>
                )}

                <div className="border-t border-border/40 pt-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">Ingredients BOM</h4>
                  <ul className="space-y-1 text-xs">
                    {recipe.ingredients?.map((ing: any) => (
                      <li key={ing.id} className="flex justify-between items-center text-[11px] text-text-secondary">
                        <span>• {ing.inventoryItem?.name}</span>
                        <span className="font-mono text-text-muted">{ing.quantity} {ing.inventoryItem?.unit?.symbol}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="p-3 bg-bg-tertiary/30 border-t border-border/50 flex justify-end gap-2 rounded-b-xl">
                <button
                  onClick={() => handleOpenEdit(recipe)}
                  className="text-blue-400 text-xs font-bold hover:underline px-2 py-1"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Are you sure you want to delete the recipe for "${recipe.name}"?`)) {
                      deleteMutation.mutate(recipe.id);
                    }
                  }}
                  className="text-red-400 text-xs font-bold hover:underline px-2 py-1"
                >
                  Delete
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* CREATE / EDIT DIALOG */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-in fade-in">
          <div className="bg-[#1a1c23] rounded-2xl border border-gray-800 shadow-2xl w-full max-w-xl mx-4 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="text-white font-bold text-base flex items-center gap-1.5">
                <ChefHat className="w-5 h-5 text-purple-400" />
                {editingRecipe ? `Edit Recipe: ${editingRecipe.name}` : 'Create Production Recipe'}
              </h3>
              <button onClick={resetForm} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Recipe Name *</label>
                  <input
                    value={recipeName}
                    onChange={(e) => setRecipeName(e.target.value)}
                    required
                    placeholder="e.g. Hamburger Bun Recipe"
                    className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded text-sm text-white focus:outline-none focus:border-purple-600"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Yield Item (Finished Good) *</label>
                  <select
                    value={inventoryItemId}
                    onChange={(e) => setInventoryItemId(e.target.value ? Number(e.target.value) : '')}
                    required
                    className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded text-sm text-white focus:outline-none"
                  >
                    <option value="">Select Finished Item</option>
                    {inventoryItems.map((it: any) => (
                      <option key={it.id} value={it.id}>{it.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Yield Quantity *</label>
                  <input
                    type="number"
                    step="any"
                    value={targetQuantity}
                    onChange={(e) => setTargetQuantity(e.target.value ? Number(e.target.value) : '')}
                    required
                    placeholder="e.g. 100"
                    className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded text-sm text-white focus:outline-none focus:border-purple-600"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Yield Unit *</label>
                  <select
                    value={unitId}
                    onChange={(e) => setUnitId(e.target.value ? Number(e.target.value) : '')}
                    required
                    className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded text-sm text-white focus:outline-none"
                  >
                    <option value="">Select Unit</option>
                    {units.map((u: any) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Recipe Instructions / Notes</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Mix raw materials, ferment for 20 minutes, bake at 220C..."
                  className="px-3 py-2 bg-[#0f1014] border border-gray-800 rounded text-sm text-white h-16 focus:outline-none focus:border-purple-600"
                />
              </div>

              {/* Ingredients Adder */}
              <div className="bg-[#0f1014]/60 border border-gray-800/80 rounded-xl p-3 space-y-3">
                <span className="text-[10px] uppercase font-bold tracking-wider text-purple-400">Add Raw Ingredients</span>
                <div className="grid grid-cols-3 gap-2 items-end">
                  <div className="flex flex-col gap-1.5 col-span-2">
                    <select
                      value={tempItemId}
                      onChange={(e) => setTempItemId(e.target.value ? Number(e.target.value) : '')}
                      className="px-3 py-1.5 bg-[#0f1014] border border-gray-800 rounded text-xs text-white"
                    >
                      <option value="">Choose Raw Ingredient</option>
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
                      onClick={handleAddIngredient}
                      className="flex-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-bold"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

              {/* Ingredients Table */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Ingredients List</label>
                <div className="border border-gray-800 rounded-lg overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gray-900 border-b border-gray-800 text-[10px] font-bold text-gray-400 uppercase">
                        <th className="py-2 px-3">Ingredient</th>
                        <th className="py-2 px-3 text-right">Required Qty</th>
                        <th className="py-2 px-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                      {ingredientsList.map((line) => (
                        <tr key={line.inventoryItemId} className="hover:bg-gray-800/10">
                          <td className="py-2 px-3 text-white font-medium">{line.name}</td>
                          <td className="py-2 px-3 text-right font-mono text-gray-300">
                            {line.quantity} {line.unitSymbol}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveIngredient(line.inventoryItemId)}
                              className="text-red-400 hover:text-red-300"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {ingredientsList.length === 0 && (
                        <tr>
                          <td colSpan={3} className="py-6 text-center text-gray-500 italic">No ingredients added yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
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
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold"
                >
                  {editingRecipe ? 'Save Changes' : 'Create Recipe'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
