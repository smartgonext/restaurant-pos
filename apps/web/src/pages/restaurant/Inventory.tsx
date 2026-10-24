import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import InventorySidebar, { InvView } from '@/components/inventory/InventorySidebar';
import InventoryTopBar from '@/components/inventory/InventoryTopBar';
import { ToastProvider } from '@/components/inventory/ToastProvider';

// Views
import InventoryDashboard from './inventory/InventoryDashboard';
import RawMaterialsPage from './inventory/RawMaterialsPage';
import QuickStockEntry from './inventory/QuickStockEntry';
import BranchStockPage from './inventory/BranchStockPage';
import StockMovementsPage from './inventory/StockMovementsPage';
import PurchaseOrdersPage from './inventory/PurchaseOrdersPage';
import SuppliersPage from './inventory/SuppliersPage';
// import RecipesPage from './inventory/RecipesPage';
import InventorySettingsPage from './inventory/InventorySettingsPage';
import ErpStoreDashboard from './inventory/ErpStoreDashboard';

function InventoryInner() {
  const [activeView, setActiveView] = useState<InvView>('dashboard');
  const [quickAction, setQuickAction] = useState<string | null>(null);

  // Fetch metrics dynamically to calculate badge counts
  const { data: items = [] } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: () => api.get('/restaurant/inventory/items').then(r => r.data.data).catch(() => [])
  });

  const { data: pos = [] } = useQuery({
    queryKey: ['inventory-pos'],
    queryFn: () => api.get('/restaurant/inventory/purchase-orders').then(r => r.data.data).catch(() => [])
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['inventory-suppliers'],
    queryFn: () => api.get('/restaurant/inventory/suppliers').then(r => r.data.data).catch(() => [])
  });

  // Calculate live badges
  const badges = useMemo(() => {
    const lowStock = items.filter((i: any) => Number(i.currentStock || 0) <= Number(i.thresholdQty || 0)).length;
    const pendingPOs = pos.filter((p: any) => p.status === 'ordered').length;
    
    // Count suppliers exceeding credit limits as a custom badge
    const overduePayments = suppliers.filter((s: any) => {
      const balance = Number(s.outstandingBalance || 0);
      const limit = Number(s.creditLimit || 0);
      return limit > 0 && balance > limit;
    }).length;

    return { lowStock, pendingPOs, overduePayments };
  }, [items, pos, suppliers]);

  const handleQuickAction = (action: string) => {
    setQuickAction(action);
    if (action === 'add-item') {
      setActiveView('raw-materials');
    } else if (action === 'new-po') {
      setActiveView('purchase-orders');
    } else if (action === 'add-movement') {
      setActiveView('movements');
    } else if (action === 'add-supplier') {
      setActiveView('suppliers');
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Integrated Collapsible Sub-Sidebar */}
      <InventorySidebar
        activeView={activeView}
        onNavigate={setActiveView}
        badges={badges}
      />

      {/* Main Workspace Frame */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Unified Topbar quick action navigation panel */}
        <InventoryTopBar onNavigate={setActiveView} onQuickAction={handleQuickAction} />

        {/* View Routing Body */}
        <main style={{ flex: 1, overflowY: 'auto' }}>
          {activeView === 'dashboard' && (
            <InventoryDashboard 
              onNavigate={setActiveView} 
              onQuickAction={handleQuickAction} 
            />
          )}
          {activeView === 'raw-materials' && (
            <RawMaterialsPage 
              quickAction={quickAction} 
              onClearQuickAction={() => setQuickAction(null)} 
            />
          )}
          {activeView === 'quick-stock' && <QuickStockEntry />}
          {activeView === 'branch-stock' && <BranchStockPage />}
          {activeView === 'movements' && (
            <StockMovementsPage 
              quickAction={quickAction} 
              onClearQuickAction={() => setQuickAction(null)} 
            />
          )}
          {activeView === 'purchase-orders' && (
            <PurchaseOrdersPage 
              quickAction={quickAction} 
              onClearQuickAction={() => setQuickAction(null)} 
            />
          )}
          {activeView === 'suppliers' && (
            <SuppliersPage 
              quickAction={quickAction} 
              onClearQuickAction={() => setQuickAction(null)} 
            />
          )}
          {/* {activeView === 'recipes' && <RecipesPage />} */}
          {activeView === 'settings' && <InventorySettingsPage />}
          {activeView === 'erp-store' && <ErpStoreDashboard />}
        </main>
      </div>
    </div>
  );
}

export default function Inventory() {
  return (
    <ToastProvider>
      <InventoryInner />
    </ToastProvider>
  );
}
