import { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn, openNewTab } from '@/lib/utils';
import {
  LayoutDashboard, Store, Package, CreditCard, FileText, Users, Settings,
  ChevronLeft, ChevronRight, ChevronDown, UtensilsCrossed, ClipboardList,
  Grid3X3, ShoppingCart, Users2, UserCog, Receipt, BarChart3, Wallet,
  ChefHat, Warehouse, Calendar, Truck, Bell, Brain, Building,
  DollarSign, ExternalLink, Globe, MonitorSmartphone,
  BedDouble, Bed, ClipboardCheck, LogIn, LogOut, Tags, Sparkles, SlidersHorizontal,
  Activity,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { usePermission } from '@/hooks/usePermission';
import { useEnabledModules } from '@/hooks/useEnabledModules';
import { useTranslation } from 'react-i18next';
import { useLayoutStore } from '@/stores/layoutStore';
import toast from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

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
  { id: 'live_reports', label: 'Live Reports', icon: BarChart3, path: '/superadmin/reports' },
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
    { label: 'Groups', path: '/admin/menu/groups' },
    { label: 'Menus', path: '/admin/menu/menus' },
    { label: 'Categories', path: '/admin/menu/categories' },
    { label: 'Menu Items', path: '/admin/menu/items' },
    { label: 'Modifier Groups', path: '/admin/menu/modifiers' },
  ]},
  { id: 'tables', label: 'Tables', icon: Grid3X3, path: '/admin/tables', module: 'restaurant', children: [
    { label: 'Areas', path: '/admin/tables/areas' },
    { label: 'Tables', path: '/admin/tables/list' },
    { label: 'QR Codes', path: '/admin/tables/qr' },
  ]},
  { id: 'pos', label: 'POS & Billing', icon: ShoppingCart, path: '/admin/pos', module: 'restaurant', children: [
    { label: 'POS Terminals', path: '/admin/pos-terminals' },
  ]},
  { id: 'orders', label: 'Orders', icon: ClipboardList, path: '/admin/orders', module: 'restaurant' },
  { id: 'reservations', label: 'Reservations', icon: Calendar, path: '/admin/reservations', module: 'restaurant' },
  { id: 'branches', label: 'Branches', icon: Store, path: '/admin/branches' },
  { id: 'customers', label: 'Customers', icon: Users2, path: '/admin/customers', module: 'restaurant' },
  { id: 'staff', label: 'Staff', icon: UserCog, path: '/admin/staff', module: 'restaurant' },
  { id: 'delivery', label: 'Delivery', icon: Truck, path: '/admin/delivery', module: 'restaurant' },
  { id: 'expenses', label: 'Expenses', icon: Receipt, path: '/admin/expenses', module: 'restaurant' },
  { id: 'payments', label: 'Payments', icon: Wallet, path: '/admin/payments', module: 'restaurant' },
  { id: 'reports', label: 'Reports', icon: BarChart3, path: '/admin/reports', module: 'restaurant', children: [
    { label: 'Sales Report', path: '/admin/reports/sales' },
    { label: 'Order Report', path: '/admin/reports/orders' },
    { label: 'Payment Report', path: '/admin/reports/payments' },
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
    { label: 'Production Reports', path: '/admin/reports/production' },
    { label: 'KOT Report', path: '/admin/reports/kot' },
    { label: 'Staff Performance', path: '/admin/reports/staff-performance' },
    { label: 'Customer Report', path: '/admin/reports/customers' },
    { label: 'Table Report', path: '/admin/reports/tables' },
    { label: 'Cash Register Report', path: '/admin/reports/cash-register' },
    { label: 'Discount Report', path: '/admin/reports/discounts' },
    { label: 'Purchase Report', path: '/admin/reports/purchases' },
    { label: 'Stock Report', path: '/admin/reports/stock' },
    { label: 'Profit & Loss', path: '/admin/reports/profit-loss' },
    { label: 'Audit Log', path: '/admin/reports/audit' },
  ]},
  { id: 'kitchens', label: 'Kitchen', icon: ChefHat, path: '/admin/kitchen', module: 'restaurant', badge: 'Addon' },
  { id: 'cash_register', label: 'Cash Register', icon: DollarSign, path: '/admin/cash-register', module: 'cash_register', badge: 'Addon' },
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
  { id: 'inventory', label: 'Inventory', icon: Warehouse, path: '/admin/inventory', module: 'inventory', badge: 'Addon' },
  // { id: 'ai', label: 'AI Insights', icon: Brain, path: '/admin/ai-insights', badge: 'AI' },
  { id: 'launch_terminals', label: 'Launch Terminals', icon: MonitorSmartphone, path: '#', children: [
    { label: 'Sub POS Kiosk', path: '/subpos' },
    { label: 'Main POS Billing', path: '/mainpos' },
    { label: 'Waiter Terminal', path: '/waiter' }
  ] },
  { id: 'settings', label: 'Settings', icon: Settings, path: '/admin/settings', module: 'settings', children: [
    { label: 'General Settings', path: '/admin/settings' },
    { label: 'Role Permissions', path: '/admin/settings/roles' },
    { label: 'Bill Settings', path: '/admin/settings/bill' },
  ]},
];

export function Sidebar() {
  const { sidebarCollapsed: collapsed, toggleSidebar: setCollapsed, setSidebarCollapsed } = useLayoutStore();
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
  const [flyoutMenu, setFlyoutMenu] = useState<string | null>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const { user } = useAuthStore();
  const { hasPermission } = usePermission();
  const { isModuleEnabled } = useEnabledModules();
  const location = useLocation();
  const { t } = useTranslation();

  // Close flyout on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target as Node) &&
          navRef.current && !navRef.current.contains(e.target as Node)) {
        setFlyoutMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close flyout on route change
  useEffect(() => {
    setFlyoutMenu(null);
  }, [location.pathname]);

  // Responsive Sidebar auto-collapse hook
  useEffect(() => {
    let prevWidth = window.innerWidth;
    
    const handleResize = () => {
      const currentWidth = window.innerWidth;
      if (currentWidth < 1024 && prevWidth >= 1024) {
        setSidebarCollapsed(true);
      }
      prevWidth = currentWidth;
    };
    
    if (window.innerWidth < 1024) {
      setSidebarCollapsed(true);
    }
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setSidebarCollapsed]);
  const isSuperAdmin = user?.role === 'superadmin' || user?.role === 'support';
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleSettingsUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-settings'] });
    };
    window.addEventListener('settings_updated', handleSettingsUpdated);
    return () => window.removeEventListener('settings_updated', handleSettingsUpdated);
  }, [queryClient]);

  const { data: uiSettings } = useQuery({
    queryKey: ['restaurant-settings'],
    enabled: !isSuperAdmin,
    queryFn: () => api.get('/restaurant/settings').then((r) => r.data.data),
    staleTime: 60_000,
  });

  const navVisibility = uiSettings?.theme?.navVisibility || {};
  const isNavVisible = (id: string) => {
    if (isSuperAdmin) return true;
    if (id === 'settings') return true;
    if (id in navVisibility) return Boolean(navVisibility[id]);
    if (id === 'kitchens' && 'kitchen' in navVisibility) return Boolean(navVisibility['kitchen']);
    return true;
  };

  const isHotelOnlyMode = !isSuperAdmin && isModuleEnabled('hotel') && !isModuleEnabled('restaurant');

  const navItems = isSuperAdmin
    ? superAdminNav
    : restaurantNav
        .filter((item) => {
          const isElectron = typeof window !== 'undefined' && (!!(window as any).electron || /electron/i.test(navigator.userAgent || ''));
          if (isElectron && item.id === 'admin_report_site') return false;

          if (!isNavVisible(item.id)) return false;
          if (isHotelOnlyMode) return item.id === 'hotel';

          const coreModules = ['restaurant', 'settings', 'orders', 'pos', 'customers', 'staff'];
          if (item.module && !coreModules.includes(item.module)) {
            if (!isModuleEnabled(item.module)) return false;
          }

          const permissionKey = item.module === 'restaurant' ? item.id : (item.module || item.id);
          return hasPermission(permissionKey);
        })
        .map((item) => {
          if (item.id === 'hotel' && isHotelOnlyMode) {
            const hotelChildren = item.children || [];
            return {
              ...item,
              children: [
                ...hotelChildren,
                // { label: 'AI Insights', path: '/admin/ai-insights', icon: Brain },
                { label: 'Settings', path: '/admin/settings', icon: SlidersHorizontal },
              ],
            };
          }
          return item;
        });

  // Auto expand parent group based on current URL path
  useEffect(() => {
    const currentPath = location.pathname;
    const matchedItem = navItems.find(item =>
      item.children?.some(child => currentPath === child.path || (child.path !== '#' && currentPath.startsWith(child.path)))
    );
    if (matchedItem && !expandedMenus.includes(matchedItem.label)) {
      setExpandedMenus([matchedItem.label]);
    }
  }, [location.pathname]);

  const toggleExpand = (label: string) => {
    if (collapsed && navItems.find(i => i.label === label)?.children) {
      // In collapsed mode, toggle flyout
      setFlyoutMenu(prev => prev === label ? null : label);
      return;
    }
    // Single Accordion behavior: close other groups when opening a new group for a clean, clutter-free sidebar
    setExpandedMenus((prev) => (prev.includes(label) ? [] : [label]));
  };

  const handleCustomerSiteClick = () => {
    const slug = user?.restaurant?.slug;
    if (!slug) {
      toast.error('No restaurant slug configured. Set it in Settings > General.');
      return;
    }
    openNewTab(`/menu/${slug}/preview`);
  };

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen bg-gradient-sidebar border-r border-border z-40 flex flex-col transition-all duration-300',
        collapsed ? 'w-[var(--sidebar-collapsed)]' : 'w-[var(--sidebar-width)]'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-[var(--topbar-height)] border-b border-border/50 shrink-0">
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
      <nav ref={navRef} className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5 custom-scrollbar">
        {navItems.map((item) => {
          const isHotelScopedPath =
            isHotelOnlyMode &&
            item.id === 'hotel' &&
            (location.pathname.startsWith('/admin/hotel') || location.pathname === '/admin/ai-insights' || location.pathname === '/admin/settings');
          const isActive = isHotelScopedPath || location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          const isExpanded = expandedMenus.includes(item.label) || isHotelScopedPath;
          const hasChildren = item.children && item.children.length > 0;

          return (
            <div key={item.label} className="relative">
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

              {/* Expanded sub-items (when NOT collapsed) */}
              {hasChildren && isExpanded && !collapsed && (
                <div className="ml-6 mt-0.5 space-y-0.5 border-l border-border/50 pl-3">
                  {item.children!.map((child) => {
                    const isTerminal = ['/subpos', '/mainpos', '/waiter'].includes(child.path);
                    const isActive = location.pathname === child.path;
                    
                    if (isTerminal) {
                      return (
                        <button
                          key={child.path}
                          onClick={() => openNewTab(child.path)}
                          className="flex items-center gap-2 text-sm py-2 px-2.5 rounded-md transition-colors w-full text-text-muted hover:text-text-secondary hover:bg-bg-hover"
                        >
                          {child.icon && <child.icon className="w-3.5 h-3.5 shrink-0" />}
                          {child.label}
                        </button>
                      );
                    }

                    return (
                      <NavLink
                        key={child.path}
                        to={child.path}
                        end={child.path === '/admin/inventory'}
                        className={({ isActive: active }) =>
                          cn('flex items-center gap-2 text-sm py-2 px-2.5 rounded-md transition-colors',
                            active ? 'text-blue-400 bg-blue-500/10' : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover')
                        }
                      >
                        {child.icon && <child.icon className="w-3.5 h-3.5 shrink-0" />}
                        {child.label}
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Flyout Submenu (Collapsed Mode) */}
      {collapsed && flyoutMenu && (
        <div
          ref={flyoutRef}
          className="fixed left-[var(--sidebar-collapsed)] top-0 h-screen bg-bg-secondary border-r border-border shadow-2xl shadow-black/40 z-50 w-56 py-3 px-2 overflow-y-auto animate-in slide-in-from-left-2 duration-150 sidebar-flyout"
        >
          <div className="px-3 pb-2 mb-2 border-b border-border/50">
            <span className="text-[11px] font-bold uppercase tracking-widest text-blue-400">
              {flyoutMenu}
            </span>
          </div>
          <div className="space-y-0.5">
            {navItems
              .find(i => i.label === flyoutMenu)
              ?.children?.map((child) => {
                const isTerminal = ['/subpos', '/mainpos', '/waiter'].includes(child.path);
                const isActive = location.pathname === child.path;

                if (isTerminal) {
                  return (
                    <button
                      key={child.path}
                      onClick={() => openNewTab(child.path)}
                      className="flex items-center gap-2.5 text-sm py-2.5 px-3 rounded-lg transition-colors w-full text-text-muted hover:text-text-secondary hover:bg-bg-hover"
                    >
                      {child.icon && <child.icon className="w-4 h-4" />}
                      {child.label}
                    </button>
                  );
                }

                return (
                  <NavLink
                    key={child.path}
                    to={child.path}
                    className={({ isActive: active }) =>
                      cn('flex items-center gap-2.5 text-sm py-2.5 px-3 rounded-lg transition-colors',
                        active
                          ? 'text-blue-400 bg-blue-500/10 font-semibold border-l-2 border-blue-400'
                          : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover')
                    }
                  >
                    {child.icon && <child.icon className="w-4 h-4" />}
                    {child.label}
                  </NavLink>
                );
              })}
          </div>
        </div>
      )}

      {/* Customer Site Link */}
      {!isSuperAdmin && !collapsed && !isHotelOnlyMode && (
        <div className="px-3 py-2 border-t border-border/50 shrink-0">
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
        className="flex items-center justify-center h-10 border-t border-border/50 text-text-muted hover:text-text-primary transition-colors shrink-0"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  );
}