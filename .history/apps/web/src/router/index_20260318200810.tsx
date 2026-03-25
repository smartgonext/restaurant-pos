import { createBrowserRouter, Navigate } from 'react-router-dom';
import { SuperAdminLayout } from '@/components/layout/SuperAdminLayout';
import { RestaurantLayout } from '@/components/layout/RestaurantLayout';
import { usePermission } from '@/hooks/usePermission';

// Auth
import Login from '@/pages/auth/Login';
import Unauthorized from '@/pages/auth/Unauthorized';

// SuperAdmin
import SuperAdminDashboard from '@/pages/superadmin/Dashboard';
import Restaurants from '@/pages/superadmin/Restaurants';
import Packages from '@/pages/superadmin/Packages';
import Billing from '@/pages/superadmin/Billing';
import SuperAdminPayments from '@/pages/superadmin/Payments';
import OfflineRequests from '@/pages/superadmin/OfflineRequests';
import Members from '@/pages/superadmin/Members';
import LandingSite from '@/pages/superadmin/LandingSite';
import SuperAdminSettings from '@/pages/superadmin/Settings';

// Restaurant
import RestaurantDashboard from '@/pages/restaurant/Dashboard';
import Menus from '@/pages/restaurant/menu/Menus';
import MenuItems from '@/pages/restaurant/menu/MenuItems';
import ItemCategories from '@/pages/restaurant/menu/ItemCategories';
import Orders from '@/pages/restaurant/Orders';
import Tables from '@/pages/restaurant/tables/Tables';
import Staff from '@/pages/restaurant/Staff';
import Customers from '@/pages/restaurant/Customers';
import KitchenKOT from '@/pages/restaurant/kitchens/KitchenKOT';
import Settings from '@/pages/restaurant/settings/Settings';
import Modifiers from '@/pages/restaurant/menu/Modifiers';
import Areas from '@/pages/restaurant/tables/Areas';
import QRCodes from '@/pages/restaurant/tables/QRCodes';
import POS from '@/pages/restaurant/pos/POS';
import WaiterRequests from '@/pages/restaurant/WaiterRequests';
import Reservations from '@/pages/restaurant/Reservations';
import Delivery from '@/pages/restaurant/Delivery';
import Expenses from '@/pages/restaurant/Expenses';
import Payments from '@/pages/restaurant/Payments';
import Reports from '@/pages/restaurant/Reports';
import CashRegister from '@/pages/restaurant/CashRegister';
import Inventory from '@/pages/restaurant/Inventory';
import AIInsights from '@/pages/restaurant/AIInsights';
import Kiosk from '@/pages/restaurant/Kiosk';
import CustomerDisplay from '@/pages/restaurant/CustomerDisplay';
import CustomerOrderBoard from '@/pages/restaurant/CustomerOrderBoard';

// Customer QR Site
import { CustomerLayout } from '@/components/layout/CustomerLayout';
import MenuSite from '@/pages/customer/MenuSite';
import CustomerCart from '@/pages/customer/CustomerCart';
import OrderStatus from '@/pages/customer/OrderStatus';

// Auth Guard Component
import { useAuthStore } from '@/stores/authStore';

function AuthGuard({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}

// Permission Guard Component
function PermissionGuard({ children, module }: { children: React.ReactNode; module: string }) {
  const { hasPermission } = usePermission();

  if (!hasPermission(module)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/unauthorized',
    element: <Unauthorized />,
  },
  {
    path: '/superadmin',
    element: (
      <AuthGuard roles={['superadmin', 'support']}>
        <SuperAdminLayout />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <SuperAdminDashboard /> },
      { path: 'restaurants', element: <Restaurants /> },
      { path: 'packages', element: <Packages /> },
      { path: 'billing', element: <Billing /> },
      { path: 'payments', element: <SuperAdminPayments /> },
      { path: 'offline-requests', element: <OfflineRequests /> },
      { path: 'members', element: <Members /> },
      { path: 'landing-site', element: <LandingSite /> },
      { path: 'settings', element: <SuperAdminSettings /> },
    ],
  },
  {
    path: '/admin',
    element: (
      <AuthGuard roles={['admin', 'branch_head', 'waiter', 'chef']}>
        <RestaurantLayout />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <PermissionGuard module="dashboard"><RestaurantDashboard /></PermissionGuard> },
      { path: 'menu/menus', element: <PermissionGuard module="menu"><Menus /></PermissionGuard> },
      { path: 'menu/items', element: <PermissionGuard module="menu"><MenuItems /></PermissionGuard> },
      { path: 'menu/categories', element: <PermissionGuard module="menu"><ItemCategories /></PermissionGuard> },
      { path: 'menu/modifiers', element: <PermissionGuard module="menu"><Modifiers /></PermissionGuard> },
      { path: 'tables/areas', element: <PermissionGuard module="tables"><Areas /></PermissionGuard> },
      { path: 'tables/list', element: <PermissionGuard module="tables"><Tables /></PermissionGuard> },
      { path: 'tables/qr', element: <PermissionGuard module="tables"><QRCodes /></PermissionGuard> },
      { path: 'pos', element: <PermissionGuard module="pos"><POS /></PermissionGuard> },
      { path: 'orders', element: <PermissionGuard module="orders"><Orders /></PermissionGuard> },
      { path: 'waiter-requests', element: <PermissionGuard module="waiter_requests"><WaiterRequests /></PermissionGuard> },
      { path: 'reservations', element: <PermissionGuard module="reservations"><Reservations /></PermissionGuard> },
      { path: 'customers', element: <PermissionGuard module="customers"><Customers /></PermissionGuard> },
      { path: 'staff', element: <PermissionGuard module="staff"><Staff /></PermissionGuard> },
      { path: 'delivery', element: <PermissionGuard module="delivery"><Delivery /></PermissionGuard> },
      { path: 'expenses', element: <PermissionGuard module="expenses"><Expenses /></PermissionGuard> },
      { path: 'payments', element: <PermissionGuard module="payments"><Payments /></PermissionGuard> },
      { path: 'reports/*', element: <PermissionGuard module="reports"><Reports /></PermissionGuard> },
      { path: 'kitchen', element: <PermissionGuard module="kitchens"><KitchenKOT /></PermissionGuard> },
      { path: 'kitchens/all-kot', element: <PermissionGuard module="kitchens"><KitchenKOT /></PermissionGuard> },
      { path: 'cash-register', element: <PermissionGuard module="cash_register"><CashRegister /></PermissionGuard> },
      { path: 'inventory', element: <PermissionGuard module="inventory"><Inventory /></PermissionGuard> },
      { path: 'ai', element: <PermissionGuard module="ai"><AIInsights /></PermissionGuard> },
      { path: 'kiosk', element: <PermissionGuard module="kiosk"><Kiosk /></PermissionGuard> },
      { path: 'customer-display', element: <CustomerDisplay /> },
      { path: 'order-board', element: <CustomerOrderBoard /> },
      { path: 'settings', element: <PermissionGuard module="settings"><Settings /></PermissionGuard> },
    ],
  },
  {
    path: '/menu/:restaurantSlug/:tableToken',
    element: <CustomerLayout />,
    children: [
      { index: true, element: <MenuSite /> },
      { path: 'cart', element: <CustomerCart /> },
      { path: 'status', element: <OrderStatus /> },
    ],
  },
  {
    path: '/',
    element: <Navigate to="/login" replace />,
  },
]);
