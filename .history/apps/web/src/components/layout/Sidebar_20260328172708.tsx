import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Store, Package, CreditCard, FileText, Users, Settings,
  ChevronLeft, ChevronRight, ChevronDown, UtensilsCrossed, ClipboardList,
  Grid3X3, ShoppingCart, Users2, UserCog, Receipt, BarChart3, Wallet,
  ChefHat, Warehouse, Calendar, Truck, Bell, Brain, Building,
  DollarSign, ExternalLink, Globe,
  BedDouble, Bed, ClipboardCheck, LogIn, LogOut, Tags, Sparkles, SlidersHorizontal,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { usePermission } from '@/hooks/usePermission';
import { useEnabledModules } from '@/hooks/useEnabledModules';
import { useTranslation } from 'react-i18next';
import { useLayoutStore } from '@/stores/layoutStore';
import toast from 'react-hot-toast';

interface NavItem {
  id: string;
  label: string;
  icon: any;
  path: string;
  children?: { label: string; path: string; icon?: any }[];
  badge?: string;
  module?: string;
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
  { id: 'menu', label: 'Menu', icon: UtensilsCrossed, path: '/admin/menu', module: 'restaurant', children: [
    { label: 'Menus', path: '/admin/menu/menus' },
    { label: 'Menu Items', path: '/admin/menu/items' },
    { label: 'Categories', path: '/admin/menu/categories' },
    { label: 'Modifier Groups', path: '/admin/menu/modifiers' },
  ]},
  { id: 'tables', label: 'Tables', icon: Grid3X3, path: '/admin/tables', module: 'restaurant', children: [
    { label: 'Areas', path: '/admin/tables/areas' },
    { label: 'Tables', path: '/admin/tables/list' },
    { label: 'QR Codes', path: '/admin/tables/qr' },
  ]},
  { id: 'pos', label: 'POS', icon: ShoppingCart, path: '/admin/pos', module: 'restaurant' },
  { id: 'orders', label: 'Orders', icon: ClipboardList, path: '/admin/orders', module: 'restaurant' },
  { id: 'waiter_requests', label: 'Waiter Requests', icon: Bell, path: '/admin/waiter-requests', module: 'restaurant' },
  { id: 'reservations', label: 'Reservations', icon: Calendar, path: '/admin/reservations', module: 'restaurant' },
  { id: 'customers', label: 'Customers', icon: Users2, path: '/admin/customers', module: 'restaurant' },
  { id: 'staff', label: 'Staff', icon: UserCog, path: '/admin/staff', module: 'restaurant' },
  { id: 'delivery', label: 'Delivery', icon: Truck, path: '/admin/delivery', module: 'restaurant' },
  { id: 'expenses', label: 'Expenses', icon: Receipt, path: '/admin/expenses', module: 'restaurant' },
  { id: 'payments', label: 'Payments', icon: Wallet, path: '/admin/payments', module: 'restaurant' },
  { id: 'reports', label: 'Reports', icon: BarChart3, path: '/admin/reports', module: 'restaurant', children: [
    { label: 'Sales Report', path: '/admin/reports/sales' },
    { label: 'Item Report', path: '/admin/reports/items' },
    { label: 'Category Report', path: '/admin/reports/categories' },
    { label: 'Tax Report', path: '/admin/reports/tax' },
    { label: 'Expense Report', path: '/admin/reports/expenses' },
    { label: 'Delivery App Report', path: '/admin/reports/delivery-app' },
    { label: 'Cancelled Orders', path: '/admin/reports/cancelled-orders' },
    { label: 'Removed KOT Items', path: '/admin/reports/removed-kot' },
    { label: 'Refund Report', path: '/admin/reports/refunds' },
    { label: 'Loyalty Reports', path: '/admin/reports/loyalty' },
    { label: 'Due Payments Received', path: '/admin/reports/due-payments-received' },
  ]},
  { id: 'hotel', label: 'Hotel', icon: Building, path: '/admin/hotel', module: 'hotel', badge: 'Addon', children: [
    { label: 'Front Desk Dashboard', path: '/admin/hotel/dashboard', icon: LayoutDashboard },
    { label: 'Room Types', path: '/admin/hotel/room-types', icon: Tags },
    { label: 'Rooms', path: '/admin/hotel/rooms', icon: BedDouble },
    { label: 'Room Status Board', path: '/admin/hotel/room-status-board', icon: ClipboardCheck },
    { label: 'Guests', path: '/admin/hotel/guests', icon: Users2 },
    { label: 'Reservations', path: '/admin/hotel/reservations', icon: Calendar },
    { label: 'Check-In', path: '/admin/hotel/check-in', icon: LogIn },
    { label: 'Check-Out', path: '/admin/hotel/check-out', icon: LogOut },
    { label: 'Rate Plans', path: '/admin/hotel/rate-plans', icon: DollarSign },
    { label: 'Housekeeping', path: '/admin/hotel/housekeeping', icon: Sparkles },
    { label: 'Room Service', path: '/admin/hotel/room-service', icon: Bed },
    { label: 'Stay History', path: '/admin/hotel/stay-history', icon: FileText },
    { label: 'Banquet & Events', path: '/admin/hotel/banquet-events', icon: Building },
  ]},
  { id: 'kitchens', label: 'Kitchen', icon: ChefHat, path: '/admin/kitchen', module: 'restaurant', badge: 'Addon' },
  { id: 'cash_register', label: 'Cash Register', icon: DollarSign, path: '/admin/cash-register', module: 'cash_register', badge: 'Addon' },
  { id: 'inventory', label: 'Inventory', icon: Warehouse, path: '/admin/inventory', module: 'inventory', badge: 'Addon' },
  { id: 'ai', label: 'AI Insights', icon: Brain, path: '/admin/ai-insights', badge: 'AI' },
  { id: 'settings', label: 'Settings', icon: Settings, path: '/admin/settings' },
];

export function Sidebar() {
  const { sidebarCollapsed: collapsed, toggleSidebar: setCollapsed } = useLayoutStore();
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
  const { user } = useAuthStore();
  const { hasPermission } = usePermission();
  const { isModuleEnabled } = useEnabledModules();
  const location = useLocation();
  const { t } = useTranslation();

  const isSuperAdmin = user?.role === 'superadmin' || user?.role === 'support';
  const isHotelOnlyMode = !isSuperAdmin && isModuleEnabled('hotel') && !isModuleEnabled('restaurant');

  const navItems = isSuperAdmin
    ? superAdminNav
    : restaurantNav
        .map((item) => {
          if (item.id !== 'hotel' || !isHotelOnlyMode) return item;

          const hotelChildren = item.children || [];
          return {
            ...item,
            children: [
              ...hotelChildren,
              { label: 'AI Insights', path: '/admin/ai-insights', icon: Brain },
              { label: 'Settings', path: '/admin/settings', icon: SlidersHorizontal },
            ],
          };
        })
        .filter((item) => {
          if (isHotelOnlyMode) {
            return item.id === 'hotel';
          }

          if (isHotelOnlyMode && ['dashboard', 'ai', 'settings'].includes(item.id)) {
            return false;
          }

          // Show if no module specified
          if (!item.module) return hasPermission(item.id);
          // Show if module is enabled
          return isModuleEnabled(item.module) && hasPermission(item.id);
        });

  const toggleExpand = (label: string) => {
    setExpandedMenus((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  const handleCustomerSiteClick = () => {
    const slug = user?.restaurant?.slug;
    if (!slug) {
      toast.error('No restaurant slug configured. Set it in Settings > General.');
      return;
    }
    window.open(`/menu/${slug}/preview`, '_blank');
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
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5 custom-scrollbar">
        {navItems.map((item) => {
          const isHotelScopedPath =
            isHotelOnlyMode &&
            item.id === 'hotel' &&
            (location.pathname.startsWith('/admin/hotel') || location.pathname === '/admin/ai-insights' || location.pathname === '/admin/settings');
          const isActive = isHotelScopedPath || location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          const isExpanded = expandedMenus.includes(item.label) || isHotelScopedPath;
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
                        cn('flex items-center gap-2 text-sm py-2 px-2.5 rounded-md transition-colors',
                          active ? 'text-blue-400 bg-blue-500/10' : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover')
                      }
                    >
                      {child.icon && <child.icon className="w-3.5 h-3.5 shrink-0" />}
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
      {!isSuperAdmin && !collapsed && !isHotelOnlyMode && (
        <div className="px-3 py-2 border-t border-border/50">
          <button
            onClick={handleCustomerSiteClick}
            className="sidebar-link text-blue-400 hover:text-blue-300 w-full"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Customer Site</span>
          </button>
        </div>
      )}

      {/* Collapse Toggle */}
      <button
        onClick={setCollapsed}
        className="flex items-center justify-center h-10 border-t border-border/50 text-text-muted hover:text-text-primary transition-colors"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  );
}
