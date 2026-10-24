import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { SuperAdminLayout } from '@/components/layout/SuperAdminLayout';
import { RestaurantLayout } from '@/components/layout/RestaurantLayout';
import { usePermission } from '@/hooks/usePermission';

// Auth
import Login from '@/pages/auth/Login';
import Unauthorized from '@/pages/auth/Unauthorized';
import AdminErrorBoundary from '@/pages/auth/AdminErrorBoundary';

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
import ReportsIndex from '@/pages/restaurant/Reports';
import SalesReport from '@/pages/restaurant/reports/SalesReport';
import ItemReport from '@/pages/restaurant/reports/ItemReport';
import CategoryReport from '@/pages/restaurant/reports/CategoryReport';
import TaxReport from '@/pages/restaurant/reports/TaxReport';
import ExpenseReport from '@/pages/restaurant/reports/ExpenseReport';
import DeliveryAppReport from '@/pages/restaurant/reports/DeliveryAppReport';
import CancelledOrdersReport from '@/pages/restaurant/reports/CancelledOrdersReport';
import RefundReport from '@/pages/restaurant/reports/RefundReport';
import LoyaltyReport from '@/pages/restaurant/reports/LoyaltyReport';
import DuePaymentsReport from '@/pages/restaurant/reports/DuePaymentsReport';
import RemovedKOTReport from '@/pages/restaurant/reports/RemovedKOTReport';
import CashRegister from '@/pages/restaurant/CashRegister';
import Inventory from '@/pages/restaurant/Inventory';
import AIInsights from '@/pages/restaurant/AIInsights';
import Kiosk from '@/pages/restaurant/Kiosk';
import CustomerDisplay from '@/pages/restaurant/CustomerDisplay';
import CustomerOrderBoard from '@/pages/restaurant/CustomerOrderBoard';
import FrontDesk from '@/pages/hotel/FrontDesk';
import RoomTypes from '@/pages/hotel/RoomTypes';
import Rooms from '@/pages/hotel/Rooms';
import StatusBoard from '@/pages/hotel/StatusBoard';
import Guests from '@/pages/hotel/Guests';
import HotelReservations from '@/pages/hotel/Reservations';
import CheckIn from '@/pages/hotel/CheckIn';
import CheckOut from '@/pages/hotel/CheckOut';
import RatePlans from '@/pages/hotel/RatePlans';
import Housekeeping from '@/pages/hotel/Housekeeping';
import RoomService from '@/pages/hotel/RoomService';
import Stays from '@/pages/hotel/Stays';
import Banquets from '@/pages/hotel/Banquets';

// Customer QR Site
import { CustomerLayout } from '@/components/layout/CustomerLayout';
import MenuSite from '@/pages/customer/MenuSite';
import CustomerCart from '@/pages/customer/CustomerCart';
import OrderStatus from '@/pages/customer/OrderStatus';
import CustomerErrorBoundary from '@/pages/customer/CustomerErrorBoundary';
import { ComingSoon } from '@/components/ui/ComingSoon';

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
    errorElement: <AdminErrorBoundary />,
  },
  {
    path: '/forgot-password',
    element: <ComingSoon moduleName="Forgot Password" />,
    errorElement: <AdminErrorBoundary />,
  },
  {
    path: '/unauthorized',
    element: <Unauthorized />,
    errorElement: <AdminErrorBoundary />,
  },
  {
    path: '/superadmin',
    element: (
      <AuthGuard roles={['superadmin', 'support']}>
        <SuperAdminLayout />
      </AuthGuard>
    ),
    errorElement: <AdminErrorBoundary />,
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
    errorElement: <AdminErrorBoundary />,
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
      {
        path: 'reports',
        element: <PermissionGuard module="reports"><Outlet /></PermissionGuard>,
        children: [
          { index: true, element: <ReportsIndex /> },
          { path: 'sales', element: <SalesReport /> },
          { path: 'items', element: <ItemReport /> },
          { path: 'categories', element: <CategoryReport /> },
          { path: 'tax', element: <TaxReport /> },
          { path: 'expenses', element: <ExpenseReport /> },
          { path: 'delivery-app', element: <DeliveryAppReport /> },
          { path: 'cancelled-orders', element: <CancelledOrdersReport /> },
          { path: 'refunds', element: <RefundReport /> },
          { path: 'loyalty', element: <LoyaltyReport /> },
          { path: 'due-payments-received', element: <DuePaymentsReport /> },
          { path: 'removed-kot', element: <RemovedKOTReport /> },
        ]
      },
      { path: 'kitchen', element: <PermissionGuard module="kitchens"><KitchenKOT /></PermissionGuard> },
      { path: 'kitchens/all-kot', element: <PermissionGuard module="kitchens"><KitchenKOT /></PermissionGuard> },
      { path: 'cash-register', element: <PermissionGuard module="cash_register"><CashRegister /></PermissionGuard> },
      { path: 'inventory', element: <PermissionGuard module="inventory"><Inventory /></PermissionGuard> },
      // AI Insights - support both /admin/ai (old) and /admin/ai-insights (new spec)
      { path: 'ai', element: <PermissionGuard module="ai"><AIInsights /></PermissionGuard> },
      { path: 'ai-insights', element: <PermissionGuard module="ai"><AIInsights /></PermissionGuard> },
      { path: 'kiosk', element: <PermissionGuard module="kiosk"><Kiosk /></PermissionGuard> },
      { path: 'customer-display', element: <CustomerDisplay /> },
      { path: 'order-board', element: <CustomerOrderBoard /> },
      { path: 'hotel/dashboard', element: <PermissionGuard module="hotel"><FrontDesk /></PermissionGuard> },
      { path: 'hotel/room-types', element: <PermissionGuard module="hotel"><RoomTypes /></PermissionGuard> },
      { path: 'hotel/rooms', element: <PermissionGuard module="hotel"><Rooms /></PermissionGuard> },
      { path: 'hotel/room-status-board', element: <PermissionGuard module="hotel"><StatusBoard /></PermissionGuard> },
      { path: 'hotel/guests', element: <PermissionGuard module="hotel"><Guests /></PermissionGuard> },
      { path: 'hotel/reservations', element: <PermissionGuard module="hotel"><HotelReservations /></PermissionGuard> },
      { path: 'hotel/check-in', element: <PermissionGuard module="hotel"><CheckIn /></PermissionGuard> },
      { path: 'hotel/check-out', element: <PermissionGuard module="hotel"><CheckOut /></PermissionGuard> },
      { path: 'hotel/rate-plans', element: <PermissionGuard module="hotel"><RatePlans /></PermissionGuard> },
      { path: 'hotel/housekeeping', element: <PermissionGuard module="hotel"><Housekeeping /></PermissionGuard> },
      { path: 'hotel/room-service', element: <PermissionGuard module="hotel"><RoomService /></PermissionGuard> },
      { path: 'hotel/stay-history', element: <PermissionGuard module="hotel"><Stays /></PermissionGuard> },
      { path: 'hotel/banquet-events', element: <PermissionGuard module="hotel"><Banquets /></PermissionGuard> },
      { path: 'settings', element: <PermissionGuard module="settings"><Settings /></PermissionGuard> },
    ],
  },
  {
    path: '/menu/:restaurantSlug/:tableToken',
    element: <CustomerLayout />,
    errorElement: <CustomerErrorBoundary />,
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
  {
    path: '*',
    element: <Navigate to="/unauthorized" replace />,
    errorElement: <AdminErrorBoundary />,
  },
]);
