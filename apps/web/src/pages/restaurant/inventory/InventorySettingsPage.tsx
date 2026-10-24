import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Settings, Plus, Edit, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/components/inventory/ToastProvider';

export default function InventorySettingsPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();

  // Inline inputs categories
  const [newCatName, setNewCatName] = useState('');
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editingCatName, setEditingCatName] = useState('');

  // Inline inputs units
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitSymbol, setNewUnitSymbol] = useState('');
  const [editingUnitId, setEditingUnitId] = useState<number | null>(null);
  const [editingUnitName, setEditingUnitName] = useState('');
  const [editingUnitSymbol, setEditingUnitSymbol] = useState('');

  // Queries
  const { data: categories = [], isLoading: loadingCats } = useQuery({ queryKey: ['inventory-categories'], queryFn: () => api.get('/restaurant/inventory/categories').then(r => r.data.data) });
  const { data: units = [], isLoading: loadingUnits } = useQuery({ queryKey: ['inventory-units'], queryFn: () => api.get('/restaurant/inventory/units').then(r => r.data.data) });
  const { data: items = [] } = useQuery({ queryKey: ['inventory-items'], queryFn: () => api.get('/restaurant/inventory/items').then(r => r.data.data).catch(() => []) });

  // Category Mutations
  const createCatMutation = useMutation({
    mutationFn: (name: string) => api.post('/restaurant/inventory/categories', { name }),
    onSuccess: () => {
      showToast('success', 'Category Created', 'New raw item category registered successfully.');
      setNewCatName('');
      qc.invalidateQueries({ queryKey: ['inventory-categories'] });
    },
    onError: (err: any) => {
      showToast('error', 'Registration Failed', err?.response?.data?.error || 'Failed to create category.');
    }
  });

  const updateCatMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => api.put(`/restaurant/inventory/categories/${id}`, payload),
    onSuccess: () => {
      showToast('success', 'Category Saved', 'Category configuration updated.');
      setEditingCatId(null);
      qc.invalidateQueries({ queryKey: ['inventory-categories'] });
      qc.invalidateQueries({ queryKey: ['inventory-items'] });
    },
    onError: (err: any) => {
      showToast('error', 'Update Failed', err?.response?.data?.error || 'Failed to save category.');
    }
  });

  // Unit Mutations
  const createUnitMutation = useMutation({
    mutationFn: (payload: any) => api.post('/restaurant/inventory/units', payload),
    onSuccess: () => {
      showToast('success', 'Unit Registered', 'New unit of measure successfully bound.');
      setNewUnitName('');
      setNewUnitSymbol('');
      qc.invalidateQueries({ queryKey: ['inventory-units'] });
    },
    onError: (err: any) => {
      showToast('error', 'Registration Failed', err?.response?.data?.error || 'Failed to create unit.');
    }
  });

  const updateUnitMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => api.put(`/restaurant/inventory/units/${id}`, payload),
    onSuccess: () => {
      showToast('success', 'Unit Saved', 'Unit metrics updated.');
      setEditingUnitId(null);
      qc.invalidateQueries({ queryKey: ['inventory-units'] });
      qc.invalidateQueries({ queryKey: ['inventory-items'] });
    },
    onError: (err: any) => {
      showToast('error', 'Update Failed', err?.response?.data?.error || 'Failed to save unit.');
    }
  });

  const handleAddCat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    createCatMutation.mutate(newCatName);
  };

  const handleAddUnit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnitName.trim() || !newUnitSymbol.trim()) return;
    createUnitMutation.mutate({ name: newUnitName, symbol: newUnitSymbol });
  };

  const getItemCountInCat = (catId: number) => {
    return items.filter((it: any) => it.categoryId === catId).length;
  };

  const getItemCountInUnit = (unitId: number) => {
    return items.filter((it: any) => it.unitId === unitId).length;
  };

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      
      {/* Title Header */}
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Inventory Configuration & Settings</h1>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>Configure global raw material categories and standardized measurement symbols</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        
        {/* LEFT COLUMN: ITEM CATEGORIES */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'rgba(var(--bg-secondary-rgb), 0.3)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
            <Settings size={14} style={{ color: '#a78bfa' }} />
            <span>Item Categories</span>
          </h2>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.1)' }}>
                  {['Category Name', 'Linked SKUs', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 650, color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.map((c: any) => {
                  const itemCount = getItemCountInCat(c.id);
                  const isEditing = editingCatId === c.id;

                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '8px 10px' }}>
                        {isEditing ? (
                          <input value={editingCatName} onChange={e => setEditingCatName(e.target.value)}
                            style={{ height: 24, width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 6px', color: 'var(--text)', fontSize: 10, outline: 'none' }} />
                        ) : (
                          <span style={{ fontWeight: 700, color: 'var(--text)' }}>{c.name}</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{itemCount} item(s)</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{
                          display: 'inline-flex', padding: '1px 6px', borderRadius: 12, fontSize: 8, fontWeight: 800,
                          background: c.isActive ? 'rgba(16,185,129,0.1)' : 'rgba(156,163,175,0.1)',
                          color: c.isActive ? '#10b981' : '#9ca3af'
                        }}>{c.isActive ? 'Active' : 'Offline'}</span>
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {isEditing ? (
                            <button onClick={() => updateCatMutation.mutate({ id: c.id, payload: { name: editingCatName } })}
                              style={{ height: 20, padding: '0 6px', background: '#10b981', border: 'none', borderRadius: 4, color: 'var(--text)', fontSize: 8, cursor: 'pointer', fontWeight: 700 }}>Save</button>
                          ) : (
                            <button onClick={() => { setEditingCatId(c.id); setEditingCatName(c.name); }}
                              style={{ height: 20, padding: '0 6px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 8, cursor: 'pointer' }}><Edit size={10} /></button>
                          )}
                          <button onClick={() => {
                            if (itemCount > 0 && c.isActive) {
                              showToast('error', 'Cannot Disable', `Disable failed. There are ${itemCount} items utilizing "${c.name}".`);
                              return;
                            }
                            updateCatMutation.mutate({ id: c.id, payload: { isActive: !c.isActive } });
                          }}
                            style={{ height: 20, padding: '0 6px', background: c.isActive ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', border: 'none', borderRadius: 4, color: c.isActive ? '#ef4444' : '#10b981', fontSize: 8, cursor: 'pointer' }}>
                            {c.isActive ? <EyeOff size={10} /> : <Eye size={10} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add Category Form */}
          <form onSubmit={handleAddCat} style={{ display: 'flex', gap: 6, marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Enter new category label..."
              style={{ flex: 1, height: 28, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 10px', color: 'var(--text)', fontSize: 10, outline: 'none' }} />
            <button type="submit" style={{ height: 28, padding: '0 10px', background: '#7c3aed', border: 'none', borderRadius: 6, color: 'var(--text)', fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Plus size={12} /> Add
            </button>
          </form>
        </div>

        {/* RIGHT COLUMN: UNITS OF MEASURE */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'rgba(var(--bg-secondary-rgb), 0.3)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
            <Settings size={14} style={{ color: '#a78bfa' }} />
            <span>Units of Measure</span>
          </h2>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.1)' }}>
                  {['Unit Title', 'Symbol', 'Linked SKUs', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 650, color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {units.map((u: any) => {
                  const itemCount = getItemCountInUnit(u.id);
                  const isEditing = editingUnitId === u.id;

                  return (
                    <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '8px 10px' }}>
                        {isEditing ? (
                          <input value={editingUnitName} onChange={e => setEditingUnitName(e.target.value)}
                            style={{ height: 24, width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 6px', color: 'var(--text)', fontSize: 10, outline: 'none' }} />
                        ) : (
                          <span style={{ fontWeight: 700, color: 'var(--text)' }}>{u.name}</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        {isEditing ? (
                          <input value={editingUnitSymbol} onChange={e => setEditingUnitSymbol(e.target.value)}
                            style={{ height: 24, width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 6px', color: 'var(--text)', fontSize: 10, outline: 'none' }} />
                        ) : (
                          <span style={{ color: 'var(--text-secondary)' }}>{u.symbol}</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{itemCount} item(s)</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{
                          display: 'inline-flex', padding: '1px 6px', borderRadius: 12, fontSize: 8, fontWeight: 800,
                          background: u.isActive ? 'rgba(16,185,129,0.1)' : 'rgba(156,163,175,0.1)',
                          color: u.isActive ? '#10b981' : '#9ca3af'
                        }}>{u.isActive ? 'Active' : 'Offline'}</span>
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {isEditing ? (
                            <button onClick={() => updateUnitMutation.mutate({ id: u.id, payload: { name: editingUnitName, symbol: editingUnitSymbol } })}
                              style={{ height: 20, padding: '0 6px', background: '#10b981', border: 'none', borderRadius: 4, color: 'var(--text)', fontSize: 8, cursor: 'pointer', fontWeight: 700 }}>Save</button>
                          ) : (
                            <button onClick={() => { setEditingUnitId(u.id); setEditingUnitName(u.name); setEditingUnitSymbol(u.symbol); }}
                              style={{ height: 20, padding: '0 6px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 8, cursor: 'pointer' }}><Edit size={10} /></button>
                          )}
                          <button onClick={() => {
                            if (itemCount > 0 && u.isActive) {
                              showToast('error', 'Cannot Disable', `Disable failed. There are ${itemCount} items utilizing symbol "${u.symbol}".`);
                              return;
                            }
                            updateUnitMutation.mutate({ id: u.id, payload: { isActive: !u.isActive } });
                          }}
                            style={{ height: 20, padding: '0 6px', background: u.isActive ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', border: 'none', borderRadius: 4, color: u.isActive ? '#ef4444' : '#10b981', fontSize: 8, cursor: 'pointer' }}>
                            {u.isActive ? <EyeOff size={10} /> : <Eye size={10} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add Unit Form */}
          <form onSubmit={handleAddUnit} style={{ display: 'flex', gap: 6, marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <input value={newUnitName} onChange={e => setNewUnitName(e.target.value)} required placeholder="Unit Name (e.g. Gram)"
              style={{ flex: 1.2, height: 28, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 8px', color: 'var(--text)', fontSize: 10, outline: 'none' }} />
            <input value={newUnitSymbol} onChange={e => setNewUnitSymbol(e.target.value)} required placeholder="Symbol (g)"
              style={{ flex: 0.8, height: 28, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 8px', color: 'var(--text)', fontSize: 10, outline: 'none' }} />
            <button type="submit" style={{ height: 28, padding: '0 10px', background: '#7c3aed', border: 'none', borderRadius: 6, color: 'var(--text)', fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Plus size={12} /> Add
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
