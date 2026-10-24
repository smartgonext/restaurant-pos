import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { ChefHat, Search, Plus, X, Edit, Trash2, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/inventory/ToastProvider';

export default function RecipesPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  
  // Selection and Panel states
  const [selectedRecipe, setSelectedRecipe] = useState<any | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Detail panel editing states
  const [yieldQty, setYieldQty] = useState<number>(1);
  const [ingredientsList, setIngredientsList] = useState<any[]>([]); // { inventoryItemId, quantity }
  
  // Adding single ingredient temp state
  const [tempItemId, setTempItemId] = useState<number | ''>('');
  const [tempQty, setTempQty] = useState<number | ''>('');

  // Create/New recipe temp states
  const [newMenuItemId, setNewMenuItemId] = useState<number | ''>('');

  // Queries
  const { data: recipes = [], isLoading: loadingRecipes } = useQuery({
    queryKey: ['inventory-recipes'],
    queryFn: () => api.get('/restaurant/inventory/recipes').then(r => r.data.data)
  });

  const { data: menuItems = [] } = useQuery({
    queryKey: ['menu-items'],
    queryFn: () => api.get('/restaurant/menu-items').then(r => r.data.data).catch(() => [])
  });

  const { data: items = [] } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: () => api.get('/restaurant/inventory/items').then(r => r.data.data)
  });

  // Save/Update Mutation
  const saveMutation = useMutation({
    mutationFn: ({ id, payload }: { id?: number; payload: any }) => {
      if (id) {
        return api.put(`/restaurant/inventory/recipes/${id}`, payload);
      }
      return api.post('/restaurant/inventory/recipes', payload);
    },
    onSuccess: () => {
      showToast('success', 'Recipe Saved', 'Ingredient structure and yields saved successfully.');
      setSelectedRecipe(null);
      setCreateOpen(false);
      qc.invalidateQueries({ queryKey: ['inventory-recipes'] });
    },
    onError: (err: any) => {
      showToast('error', 'Save Failed', err?.response?.data?.error || 'Failed to register recipe.');
    }
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/restaurant/inventory/recipes/${id}`),
    onSuccess: () => {
      showToast('success', 'Recipe Removed', 'Recipe configuration deleted.');
      setSelectedRecipe(null);
      qc.invalidateQueries({ queryKey: ['inventory-recipes'] });
    },
    onError: (err: any) => {
      showToast('error', 'Delete Failed', err?.response?.data?.error || 'Failed to delete recipe.');
    }
  });

  const handleOpenEdit = (recipe: any) => {
    setSelectedRecipe(recipe);
    setYieldQty(Number(recipe.yield || 1));
    setIngredientsList(
      (recipe.ingredients || []).map((x: any) => ({
        inventoryItemId: x.inventoryItemId,
        quantity: Number(x.quantity),
        name: x.inventoryItem?.name,
        unit: x.inventoryItem?.unit?.symbol,
        currentStock: Number(x.inventoryItem?.currentStock || 0)
      }))
    );
  };

  const handleAddIngredient = () => {
    if (!tempItemId || !tempQty || Number(tempQty) <= 0) return;
    const it = items.find((x: any) => x.id === tempItemId);
    if (!it) return;

    if (ingredientsList.some(x => x.inventoryItemId === it.id)) {
      showToast('warning', 'Duplicate Ingredient', 'Ingredient already exists in recipe list.');
      return;
    }

    setIngredientsList([
      ...ingredientsList,
      {
        inventoryItemId: it.id,
        quantity: Number(tempQty),
        name: it.name,
        unit: it.unit?.symbol,
        currentStock: Number(it.currentStock || 0)
      }
    ]);
    setTempItemId('');
    setTempQty('');
  };

  const handleRemoveIngredient = (idx: number) => {
    setIngredientsList(ingredientsList.filter((_, i) => i !== idx));
  };

  const handleSaveRecipe = () => {
    if (ingredientsList.length === 0) return showToast('error', 'Missing Ingredients', 'Please add at least one raw material ingredient.');
    
    const payload = {
      menuItemId: selectedRecipe ? selectedRecipe.menuItemId : Number(newMenuItemId),
      yield: Number(yieldQty),
      ingredients: ingredientsList.map(x => ({
        inventoryItemId: x.inventoryItemId,
        quantity: x.quantity
      }))
    };

    saveMutation.mutate({ id: selectedRecipe?.id, payload });
  };

  // Recipe portion availability math solver
  const solveRecipeAvailability = (recipe: any) => {
    const ingr = recipe.ingredients || [];
    if (ingr.length === 0) return { label: 'Cannot Make', status: 'red', portions: 0 };
    
    let portionsList = ingr.map((line: any) => {
      const stock = Number(line.inventoryItem?.currentStock || 0);
      const req = Number(line.quantity || 0);
      if (req <= 0) return Infinity;
      // yield portions computed based on recipe yield settings
      const yieldAmt = Number(recipe.yield || 1);
      return (stock / req) * yieldAmt;
    });

    const minPortions = Math.floor(Math.min(...portionsList));
    
    if (minPortions === 0) return { label: 'Cannot Make', status: 'red', portions: 0 };
    if (minPortions < 5) return { label: `Limited: ${minPortions} portions`, status: 'amber', portions: minPortions };
    return { label: `Can Make: ${minPortions} portions`, status: 'green', portions: minPortions };
  };

  const filteredRecipes = recipes.filter((rec: any) =>
    rec.menuItem?.name?.toLowerCase().includes(search.toLowerCase())
  );

  // List of menu items that don't have recipes yet
  const unlinkedMenuItems = menuItems.filter((mi: any) =>
    !recipes.some((r: any) => r.menuItemId === mi.id)
  );

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      
      {/* Title Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Recipe Raw Material Bindings</h1>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>Define ingredient yields for billing, and monitor instant servable portions possible</p>
        </div>
        <button onClick={() => { setCreateOpen(true); setSelectedRecipe(null); setIngredientsList([]); setYieldQty(1); setNewMenuItemId(''); }}
          style={{
            height: 34, padding: '0 14px', background: '#7c3aed', border: 'none',
            borderRadius: 8, color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6
          }}>
          <Plus size={14} /> Create Recipe
        </button>
      </div>

      {/* SEARCH TOOLBAR */}
      <div style={{
        background: 'rgba(var(--bg-secondary-rgb), 0.5)', border: '1px solid var(--border)', borderRadius: 10,
        padding: '10px 14px', display: 'flex', gap: 12, alignItems: 'center'
      }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search recipes by menu item name..."
            style={{ width: '100%', height: 32, paddingLeft: 30, paddingRight: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 11, outline: 'none' }} />
        </div>
      </div>

      {/* RECIPES CARD GRID */}
      {loadingRecipes ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>Loading recipes...</div>
      ) : filteredRecipes.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 10 }}>No recipe configurations discovered.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {filteredRecipes.map((recipe: any) => {
            const avail = solveRecipeAvailability(recipe);
            const badgeBg = avail.status === 'green' ? 'rgba(16,185,129,0.1)' : avail.status === 'amber' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)';
            const badgeColor = avail.status === 'green' ? '#10b981' : avail.status === 'amber' ? '#f59e0b' : '#ef4444';
            const badgeBorder = avail.status === 'green' ? 'rgba(16,185,129,0.2)' : avail.status === 'amber' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)';

            return (
              <div key={recipe.id} style={{
                background: 'rgba(30,34,53,0.6)', border: '1px solid var(--border)', borderRadius: 12,
                overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 10, transition: 'all 200ms'
              }} className="glass-card">
                
                {/* Menu Image Banner */}
                <div style={{ height: 120, position: 'relative', overflow: 'hidden', background: 'rgba(0,0,0,0.3)' }}>
                  <img src={recipe.menuItem?.image || `https://loremflickr.com/300/150/food?lock=${recipe.id}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <span style={{
                    position: 'absolute', bottom: 8, right: 8, padding: '2px 8px', borderRadius: 20, fontSize: 8, fontWeight: 900,
                    background: 'rgba(0,0,0,0.6)', color: 'var(--text)', backdropFilter: 'blur(4px)', border: '1px solid var(--border)'
                  }}>
                    Yield: {recipe.yield} Portion(s)
                  </span>
                </div>

                {/* Body Details */}
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                  <div>
                    <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{recipe.menuItem?.name}</h3>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                      Category: {recipe.menuItem?.category?.name || 'KOT Item'} | {recipe.ingredients?.length || 0} ingredients
                    </div>
                  </div>

                  {/* Urgency Availability Gauge */}
                  <div style={{
                    padding: '8px 12px', borderRadius: 8, background: badgeBg, border: `1px solid ${badgeBorder}`,
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 850, color: badgeColor,
                    marginTop: 'auto'
                  }}>
                    {avail.status === 'green' ? <CheckCircle2 size={12} /> : avail.status === 'amber' ? <AlertTriangle size={12} /> : <AlertCircle size={12} />}
                    <span>{avail.label}</span>
                  </div>

                  <button onClick={() => handleOpenEdit(recipe)}
                    style={{
                      height: 28, width: '100%', background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.2)',
                      borderRadius: 6, color: '#a78bfa', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4
                    }}>
                    <Edit size={11} /> View / Edit Recipe
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* RECIPE DETAIL / CREATE SLIDE OVER PANEL */}
      {(selectedRecipe || createOpen) && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={() => { setSelectedRecipe(null); setCreateOpen(false); }} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }} />
          <div style={{
            position: 'relative', width: 500, background: 'var(--bg-primary)', height: '100%', display: 'flex', flexDirection: 'column',
            boxShadow: '-8px 0 32px rgba(0,0,0,0.5)', animation: 'slideIn 300ms ease-out', borderLeft: '1px solid var(--border)',
          }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 900, color: 'var(--text)', margin: 0 }}>
                  {selectedRecipe ? `✏️ Adjust Recipe for ${selectedRecipe.menuItem?.name}` : '🍳 Register New Menu Recipe'}
                </h3>
              </div>
              <button onClick={() => { setSelectedRecipe(null); setCreateOpen(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={16} />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Menu Item select for create mode */}
              {!selectedRecipe && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Select Menu Item *</label>
                  <select value={newMenuItemId} onChange={e => setNewMenuItemId(Number(e.target.value))}
                    style={{ height: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 8px', color: 'var(--text)', fontSize: 11, outline: 'none' }}>
                    <option value="">Choose item...</option>
                    {unlinkedMenuItems.map((mi: any) => <option key={mi.id} value={mi.id}>{mi.name}</option>)}
                  </select>
                </div>
              )}

              {/* Yield portions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Servables Yield *</label>
                <input type="number" value={yieldQty} onChange={e => setYieldQty(Number(e.target.value))} placeholder="e.g. Makes 4 portions"
                  style={{ height: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 10px', color: 'var(--text)', fontSize: 11, outline: 'none' }} />
              </div>

              {/* Dynamic ingredient adder */}
              <div style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa' }}>Add Recipe Raw Ingredients</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 50px', gap: 8, alignItems: 'end' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Material</span>
                    <select value={tempItemId} onChange={e => setTempItemId(e.target.value ? Number(e.target.value) : '')}
                      style={{ height: 28, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 6px', color: 'var(--text)', fontSize: 11, outline: 'none' }}>
                      <option value="">Select Raw Item</option>
                      {items.map((it: any) => <option key={it.id} value={it.id}>{it.name} ({it.unit?.symbol})</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Required Qty</span>
                    <input type="number" step="any" value={tempQty} onChange={e => setTempQty(e.target.value ? Number(e.target.value) : '')} placeholder="0.5"
                      style={{ height: 28, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 8px', color: 'var(--text)', fontSize: 11, outline: 'none' }} />
                  </div>
                  <button type="button" onClick={handleAddIngredient}
                    style={{ height: 28, background: '#7c3aed', border: 'none', borderRadius: 6, color: 'var(--text)', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                    + Add
                  </button>
                </div>
              </div>

              {/* Added list */}
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>Recipe Ingredients Checklist</span>
              <div style={{ overflowX: 'auto', background: 'rgba(0,0,0,0.1)', border: '1px solid var(--border)', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                  <thead>
                    <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border)' }}>
                      {['Material', 'Portion Req.', 'Stock On-Hand', 'Possible Portion Yield', ''].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ingredientsList.map((line, idx) => {
                      const possible = line.quantity > 0 ? Math.floor((line.currentStock / line.quantity) * yieldQty) : 0;
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                          <td style={{ padding: '6px 10px', fontWeight: 750, color: 'var(--text)' }}>{line.name}</td>
                          <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{line.quantity} {line.unit}</td>
                          <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{line.currentStock.toFixed(1)} {line.unit}</td>
                          <td style={{ padding: '6px 10px', fontWeight: 700, color: possible >= 5 ? '#10b981' : possible > 0 ? '#f59e0b' : '#ef4444' }}>
                            {possible} portions
                          </td>
                          <td style={{ padding: '6px 10px', width: 30 }}>
                            <button type="button" onClick={() => handleRemoveIngredient(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {ingredientsList.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ padding: 18, textAlign: 'center', color: 'var(--text-muted)', italic: true } as any}>No ingredients bound yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Slide Action Footer */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, background: 'rgba(0,0,0,0.1)' }}>
              {selectedRecipe && (
                <button type="button" onClick={() => {
                  if (confirm('Delete this recipe structure permanently?')) deleteMutation.mutate(selectedRecipe.id);
                }}
                  style={{ height: 36, padding: '0 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: '#ef4444', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  Delete
                </button>
              )}
              <button type="button" onClick={() => { setSelectedRecipe(null); setCreateOpen(false); }}
                style={{ flex: 1, height: 36, background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                Cancel
              </button>
              <button type="button" onClick={handleSaveRecipe}
                style={{ flex: 1, height: 36, background: '#7c3aed', border: 'none', borderRadius: 6, color: 'var(--text)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                Save Recipe
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
