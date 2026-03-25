import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Store, Package, CreditCard, FileText, Users, Settings,
  ChevronLeft, ChevronRight, ChevronDown, UtensilsCrossed, ClipboardList,
  Grid3X3, ShoppingCart, Users2, UserCog, Receipt, BarChart3, Wallet,
  ChefHat, Warehouse, Calendar, Truck, Bell, BookOpen, Brain,
  DollarSign, PanelLeft, ExternalLink, Globe,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { usePermission } from '@/hooks/usePermission';
import { useTranslation } from 'react-i18next';

interface NavItem {
  id: string; // Add id for permission check
  label: string;
  icon: any;
  path: string;
  children?: { label: string; path: string }[];
  badge?: string;
}

const superAdminNav: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/superadmin' },
  { id: 'restaurants', label: 'Restaurants', icon: Store, path: '/superadmin/restaurants' },
  { id: 'packages', label: 'Packages', icon: Package, path: '/superadmin/packages' },
  { id: 'billing', label: 'Billing', icon: CreditCard, path: '/superadmin/billing' },
  { id: 'payments', label: 'Payments', icon: DollarSign, path: '/superadmin/payments' },
  { id: 'offline_requests', label: 'Offline Requests', icon: FileText, path: '/superadmin/offline-requests' },
  { id: 'landing_site', label: 'Landing Site', icon: Globe, path: '/superadmin/landing-site' },
  { id: 'members', label: 'Members', icon: Users, path: '/superadmin/members' },
  { id: 'settings', label: 'Settings', icon: Settings, path: '/superadmin/settings' },
];

const restaurantNav: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/admin' },
  { id: 'menu', label: 'Menu', icon: UtensilsCrossed, path: '/admin/menu', children: [
    { label: 'Menus', path: '/admin/menu/menus' },
    { label: 'Menu Items', path: '/admin/menu/items' },
    { label: 'Categories', path: '/admin/menu/categories' },
    { label: 'Modifier Groups', path: '/admin/menu/modifiers' },
  ]},
  { id: 'tables', label: 'Tables', icon: Grid3X3, path: '/admin/tables', children: [
    { label: 'Areas', path: '/admin/tables/areas' },
    { label: 'Tables', path: '/admin/tables/list' },
    { label: 'QR Codes', path: '/admin/tables/qr' },
  ]},
  { id: 'pos', label: 'POS', icon: ShoppingCart, path: '/admin/pos' },
  { id: 'orders', label: 'Orders', icon: ClipboardList, path: '/admin/orders' },
  { id: 'waiter_requests', label: 'Waiter Requests', icon: Bell, path: '/admin/waiter-requests' },
  { id: 'reservations', label: 'Reservations', icon: Calendar, path: '/admin/reservations' },
  { id: 'customers', label: 'Customers', icon: Users2, path: '/admin/customers' },
  { id: 'staff', label: 'Staff', icon: UserCog, path: '/admin/staff' },
  { id: 'delivery', label: 'Delivery', icon: Truck, path: '/admin/delivery' },
  { id: 'expenses', label: 'Expenses', icon: Receipt, path: '/admin/expenses' },
  { id: 'payments', label: 'Payments', icon: Wallet, path: '/admin/payments' },
  { id: 'reports', label: 'Reports', icon: BarChart3, path: '/admin/reports', children: [
    { label: 'Sales Report', path: '/admin/reports/sales' },
    { label: 'Item Report', path: '/admin/reports/items' },
    { label: 'Category Report', path: '/admin/reports/categories' },
    { label: 'Tax Report', path: '/admin/reports/tax' },
    { label: 'Expense Report', path: '/admin/reports/expenses' },
  ]},
  { id: 'kitchens', label: 'Kitchen', icon: ChefHat, path: '/admin/kitchen', badge: 'Addon' },
  { id: 'cash_register', label: 'Cash Register', icon: DollarSign, path: '/admin/cash-register', badge: 'Addon' },
  { id: 'inventory', label: 'Inventory', icon: Warehouse, path: '/admin/inventory', badge: 'Addon' },
  { id: 'ai', label: 'AI Insights', icon: Brain, path: '/admin/ai', badge: 'AI' },
  { id: 'settings', label: 'Settings', icon: Settings, path: '/admin/settings' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
  const { user } = useAuthStore();
  const { hasPermission } = usePermission();
  const location = useLocation();
  const { t } = useTranslation();

  const isSuperAdmin = user?.role === 'superadmin' || user?.role === 'support';
  const navItems = isSuperAdmin ? superAdminNav : restaurantNav.filter(item => hasPermission(item.id));

  const toggleExpand = (label: string) => {
    setExpandedMenus((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen bg-gradient-sidebar border-r border-border z-40 flex flex-col transition-all duration-300',
        collapsed ? 'w-[72px]' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-border/50 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center shrink-0">
          <UtensilsCrossed className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <span className="text-sm font-bold text-text-primary truncate">
            {isSuperAdmin ? 'RestaurantSaaS' : user?.restaurant?.name || 'Restaurant'}
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          const isExpanded = expandedMenus.includes(item.label);
          const hasChildren = item.children && item.children.length > 0;

          return (
            <div key={item.label}>
              {hasChildren ? (
                <button
                  onClick={() => toggleExpand(item.label)}
                  className={cn('sidebar-link w-full', isActive && 'active')}
                >
                  <item.icon className="w-4.5 h-4.5 shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.badge && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning font-medium">{item.badge}</span>
                      )}
                      <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', isExpanded && 'rotate-180')} />
                    </>
                  )}
                </button>
              ) : (
                <NavLink
                  to={item.path}
                  end={item.path === '/admin' || item.path === '/superadmin'}
                  className={({ isActive: active }) => cn('sidebar-link', active && 'active')}
                >
                  <item.icon className="w-4.5 h-4.5 shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1">{item.label}</span>
                      {item.badge && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning font-medium">{item.badge}</span>
                      )}
                    </>
                  )}
                </NavLink>
              )}

              {/* Sub-items */}
              {hasChildren && isExpanded && !collapsed && (
                <div className="ml-6 mt-0.5 space-y-0.5 border-l border-border/50 pl-3">
                  {item.children!.map((child) => (
                    <NavLink
                      key={child.path}
                      to={child.path}
                      className={({ isActive: active }) =>
                        cn('block text-sm py-1.5 px-2 rounded-md transition-colors',
                          active ? 'text-blue-400 bg-blue-500/10' : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover')
                      }
                    >
                      {child.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Customer Site Link */}
      {!isSuperAdmin && !collapsed && (
        <div className="px-3 py-2 border-t border-border/50">
          <a href={`/menu/${user?.restaurant?.slug}`} target="_blank" rel="noreferrer"
            className="sidebar-link text-blue-400 hover:text-blue-300">
            <ExternalLink className="w-4 h-4" />
            <span>Customer Site</span>
          </a>
        </div>
      )}

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center h-10 border-t border-border/50 text-text-muted hover:text-text-primary transition-colors"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  );
}
