// ── Shared Types ─────────────────────────────────────
export type UserRole = 'superadmin' | 'support' | 'admin' | 'branch_head' | 'waiter' | 'chef';

export type OrderType = 'dine_in' | 'delivery' | 'pickup';
export type OrderStatus = 'placed' | 'confirmed' | 'preparing' | 'served' | 'billed' | 'paid' | 'cancelled';
export type KOTStatus = 'pending' | 'in_kitchen' | 'ready' | 'cancelled';
export type KOTItemStatus = 'pending' | 'cooking' | 'ready' | 'removed';
export type TableStatus = 'available' | 'running' | 'reserved' | 'inactive';
export type SubscriptionStatus = 'trial' | 'active' | 'inactive' | 'expired';
export type PaymentStatus = 'success' | 'pending' | 'failed';
export type BillingCycle = 'trial' | 'monthly' | 'annual' | 'lifetime';
export type PaymentMethod = 'cash' | 'upi' | 'card' | 'bank_transfer' | 'due';
export type PaymentGateway = 'stripe' | 'razorpay' | 'paypal' | 'offline';
export type Theme = 'dark' | 'light';

export interface JwtPayload {
  id: number;
  role: UserRole;
  restaurantId?: number;
  branchId?: number;
  staffId?: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  avgOrderValue: number;
  revenueChange: number;
  ordersChange: number;
  customersChange: number;
  avgOrderChange: number;
}

export interface SuperAdminDashboardStats {
  totalRestaurants: number;
  activeSubscriptions: number;
  totalRevenue: number;
  newRestaurants: number;
  restaurantsChange: number;
  subscriptionsChange: number;
  revenueChange: number;
}
