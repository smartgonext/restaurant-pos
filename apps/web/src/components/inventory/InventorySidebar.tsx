import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Package, GitBranch, ArrowLeftRight,
  ShoppingCart, Truck, ChefHat, Settings2, ChevronLeft, Link,
} from 'lucide-react';

export type InvView =
  | 'dashboard'
  | 'raw-materials'
  | 'branch-stock'
  | 'movements'
  | 'purchase-orders'
  | 'suppliers'
  | 'recipes'
  | 'settings'
  | 'quick-stock'
  | 'erp-store';

interface Badges {
  lowStock: number;
  pendingPOs: number;
  overduePayments: number;
}

interface Props {
  activeView: InvView;
  onNavigate: (view: InvView) => void;
  badges: Badges;
}

const NAV: {
  group: string;
  items: { id: InvView; label: string; icon: React.ReactNode; badgeKey?: keyof Badges }[];
}[] = [
  {
    group: 'OVERVIEW',
    items: [{ id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> }],
  },
  {
    group: 'STOCK',
    items: [
      { id: 'raw-materials', label: 'Raw Materials', icon: <Package size={16} />, badgeKey: 'lowStock' },
      { id: 'quick-stock', label: 'Quick Stock Entry', icon: <ShoppingCart size={16} /> },
      { id: 'branch-stock', label: 'Branch Stock', icon: <GitBranch size={16} /> },
      { id: 'movements', label: 'Stock Movements', icon: <ArrowLeftRight size={16} /> },
    ],
  },
  {
    group: 'PROCUREMENT',
    items: [
      { id: 'purchase-orders', label: 'Purchase Orders', icon: <ShoppingCart size={16} />, badgeKey: 'pendingPOs' },
      { id: 'suppliers', label: 'Suppliers', icon: <Truck size={16} />, badgeKey: 'overduePayments' },
    ],
  },
  /*
  {
    group: 'KITCHEN',
    items: [{ id: 'recipes', label: 'Recipes', icon: <ChefHat size={16} /> }],
  },
  */
  {
    group: 'INTEGRATIONS',
    items: [{ id: 'erp-store', label: 'ERP Store Connection', icon: <Link size={16} /> }],
  },
  {
    group: 'SETTINGS',
    items: [{ id: 'settings', label: 'Categories & Units', icon: <Settings2 size={16} /> }],
  },
];

export default function InventorySidebar({ activeView, onNavigate, badges }: Props) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('inv_sidebar_collapsed') === 'true'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem('inv_sidebar_collapsed', String(collapsed)); } catch { /* */ }
  }, [collapsed]);

  return (
    <aside
      style={{
        width: collapsed ? 64 : 240,
        transition: 'width 200ms ease',
        background: 'var(--bg-primary)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
        overflow: 'hidden',
        flexShrink: 0,
        zIndex: 20,
      }}
    >
      {/* Header */}
      <div style={{ padding: '14px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', gap: 8 }}>
        {!collapsed && (
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
            📦 INVENTORY
          </span>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', flexShrink: 0 }}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft size={16} style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 200ms ease' }} />
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {NAV.map(section => (
          <div key={section.group} style={{ marginBottom: 4 }}>
            {!collapsed && (
              <div style={{ padding: '8px 14px 4px', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
                {section.group}
              </div>
            )}
            {section.items.map(item => {
              const isActive = activeView === item.id;
              const badgeCount = item.badgeKey ? badges[item.badgeKey] : 0;
              return (
                <div key={item.id} style={{ position: 'relative' }} title={collapsed ? item.label : undefined}>
                  <button
                    onClick={() => onNavigate(item.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: collapsed ? 0 : 10,
                      width: '100%',
                      padding: collapsed ? '10px 0' : '8px 14px',
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      background: isActive ? 'rgba(124,58,237,0.12)' : 'none',
                      border: 'none',
                      borderLeft: isActive ? '3px solid #7c3aed' : '3px solid transparent',
                      cursor: 'pointer',
                      color: isActive ? '#a78bfa' : 'var(--text-muted)',
                      fontSize: 12,
                      fontWeight: isActive ? 600 : 400,
                      transition: 'all 150ms ease',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{ flexShrink: 0, position: 'relative' }}>
                      {item.icon}
                      {badgeCount > 0 && collapsed && (
                        <span style={{
                          position: 'absolute', top: -4, right: -4,
                          width: 8, height: 8, borderRadius: '50%',
                          background: '#ef4444', border: '1.5px solid var(--bg-primary)',
                        }} />
                      )}
                    </span>
                    {!collapsed && <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>}
                    {!collapsed && badgeCount > 0 && (
                      <span style={{
                        background: '#ef4444', color: 'var(--text)',
                        fontSize: 9, fontWeight: 700, borderRadius: 10,
                        padding: '1px 5px', minWidth: 16, textAlign: 'center',
                      }}>
                        {badgeCount > 99 ? '99+' : badgeCount}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
