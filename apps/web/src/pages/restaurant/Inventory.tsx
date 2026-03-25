import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui/Badge';
import { PackageSearch, AlertTriangle, ArrowUpRight, Search, UtensilsCrossed } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export default function Inventory() {
  const [activeTab, setActiveTab] = useState('raw-items');

  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'raw-items', label: 'Raw Materials' },
    { id: 'recipes', label: 'Recipes' },
    { id: 'purchase-orders', label: 'Orders' },
    { id: 'suppliers', label: 'Suppliers' },
  ];

  const { data: inventoryItems, isLoading: loadingItems } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: () => api.get('/restaurant/inventory/items').then(r => r.data.data)
  });

  const { data: suppliers, isLoading: loadingSuppliers } = useQuery({
    queryKey: ['inventory-suppliers'],
    queryFn: () => api.get('/restaurant/inventory/suppliers').then(r => r.data.data)
  });

  const { data: recipes, isLoading: loadingRecipes } = useQuery({
    queryKey: ['inventory-recipes'],
    queryFn: () => api.get('/restaurant/inventory/recipes').then(r => r.data.data)
  });

  if (loadingItems || loadingSuppliers || loadingRecipes) return <div className="p-8 text-center text-text-muted">Loading inventory...</div>;

  const items = inventoryItems || [];

  return (
    <div className="space-y-4 animate-in">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Inventory</h1>
          <p className="text-xs text-text-muted mt-1">Manage stock tracking and raw material recipes</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" icon={<ArrowUpRight className="w-4 h-4"/>}>Stock In</Button>
          <Button size="sm">Add Item</Button>
        </div>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'dashboard' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="flex flex-col gap-1">
            <span className="text-[10px] text-text-muted uppercase font-bold">Low Stock Alerts</span>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-danger">
                {items.filter((i: any) => Number(i.currentStock) <= Number(i.thresholdQty)).length}
              </span>
              <AlertTriangle className="w-6 h-6 text-danger/30" />
            </div>
          </Card>
          <Card className="flex flex-col gap-1">
            <span className="text-[10px] text-text-muted uppercase font-bold">Suppliers</span>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-warning">{(suppliers || []).length}</span>
              <PackageSearch className="w-6 h-6 text-warning/30" />
            </div>
          </Card>
          <Card className="flex flex-col gap-1">
            <span className="text-[10px] text-text-muted uppercase font-bold">Stock Value</span>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-success">
                {formatCurrency(items.reduce((sum: number, i: any) => sum + (Number(i.currentStock) * Number(i.costPerUnit)), 0))}
              </span>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'raw-items' && (
        <Card padding={false}>
          <div className="p-3 border-b border-border/50 flex items-center justify-between">
            <div className="relative w-72">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
               <input className="glass-input w-full pl-9 h-9 text-xs" placeholder="Search materials..." />
            </div>
          </div>
          <div className="overflow-x-auto text-[11px]">
            <table className="w-full">
              <thead>
                <tr className="bg-bg-tertiary/50 border-b border-border text-left">
                  <th className="py-2.5 px-4 font-medium text-text-secondary">Item Name</th>
                  <th className="py-2.5 px-4 font-medium text-text-secondary">Category</th>
                  <th className="py-2.5 px-4 font-medium text-text-secondary">In Stock</th>
                  <th className="py-2.5 px-4 font-medium text-text-secondary">Level</th>
                  <th className="py-2.5 px-4 font-medium text-text-secondary text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {items.map((item: any) => {
                   const isLow = Number(item.currentStock) <= Number(item.thresholdQty);
                   return (
                    <tr key={item.id} className="hover:bg-bg-hover/30 transition-colors">
                      <td className="py-3 px-4 font-medium text-text-primary">{item.name}</td>
                      <td className="py-3 px-4 text-text-secondary">{item.category?.name}</td>
                      <td className="py-3 px-4 font-mono text-text-primary font-medium">{item.currentStock} {item.unit?.symbol}</td>
                      <td className="py-3 px-4">
                        <Badge size="sm" variant={isLow ? 'danger' : 'success'}>
                          {isLow ? 'Low' : 'Good'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                         <button className="text-blue-400 hover:text-blue-300 text-[10px] font-bold uppercase">Edit</button>
                      </td>
                    </tr>
                   );
                })}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-text-muted italic">No items found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'recipes' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
           {(recipes || []).map((recipe: any) => (
             <Card key={recipe.id} padding={false} className="group overflow-hidden">
                <div className="h-20 bg-indigo-500/10 flex items-center justify-center border-b border-border/50">
                   <UtensilsCrossed size={24} className="text-indigo-400 opacity-40" />
                </div>
                <div className="p-3 space-y-2">
                   <div className="flex justify-between items-start">
                      <h3 className="font-bold text-sm text-text-primary">{recipe.menuItem?.name || 'Recipe'}</h3>
                   </div>
                   <p className="text-[10px] text-text-muted truncate">
                      {recipe.ingredients.length} Ingredients
                   </p>
                   <div className="pt-2 border-t border-border/50 flex justify-between items-center">
                      <span className="text-[10px] text-text-muted font-medium">Yield: {recipe.yield}</span>
                      <button className="text-[10px] font-bold text-blue-400 uppercase">View</button>
                   </div>
                </div>
             </Card>
           ))}
        </div>
      )}

      {activeTab === 'suppliers' && (
        <Card padding={false}>
           <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-bg-tertiary/50 border-b border-border text-left font-medium text-text-secondary">
                    <th className="p-3">Supplier Name</th>
                    <th className="p-3">Contact</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                   {(suppliers || []).map((supplier: any) => (
                     <tr key={supplier.id}>
                        <td className="p-3 font-bold text-text-primary">{supplier.name}</td>
                        <td className="p-3 text-text-muted">{supplier.phone}</td>
                        <td className="p-3"><Badge size="sm" variant={supplier.isActive ? 'success' : 'secondary'}>{supplier.isActive ? 'Active' : 'Offline'}</Badge></td>
                        <td className="p-3 text-right"><button className="text-blue-400 font-bold text-[10px] uppercase">Edit</button></td>
                     </tr>
                   ))}
                </tbody>
              </table>
           </div>
        </Card>
      )}
    </div>
  );
}
