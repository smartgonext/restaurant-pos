/**
 * Application Constants
 * Single source of truth for role names, statuses, and other enums
 */

export const ROLES = Object.freeze({
  WAITER: 'waiter',
  CHEF: 'chef',
  ADMIN: 'admin',
  MANAGER: 'manager',
  CASHIER: 'cashier',
  SUPERADMIN: 'superadmin',
  SUPPORT: 'support',
});

export const ORDER_STATUSES = Object.freeze({
  PLACED: 'placed',
  CONFIRMED: 'confirmed',
  PREPARING: 'preparing',
  SERVED: 'served',
  BILLED: 'billed',
  PAID: 'paid',
  CANCELLED: 'cancelled',
});

export const ORDER_TYPES = Object.freeze({
  DINE_IN: 'dine_in',
  DELIVERY: 'delivery',
  PICKUP: 'pickup',
});

export const ORDER_SOURCE = Object.freeze({
  POS: 'pos',
  ONLINE: 'online',
  PHONE: 'phone',
});

export const TERMINAL_TYPES = Object.freeze({
  MAIN_POS: 'mainpos',
  SUB_POS: 'subpos',
  KIOSK: 'kiosk',
});

export const PAYMENT_STATUSES = Object.freeze({
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
});

export const SUBSCRIPTION_STATUSES = Object.freeze({
  TRIAL: 'trial',
  ACTIVE: 'active',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
});

export const BUSINESS_TYPES = Object.freeze({
  BAKERY: 'bakery',
  RESTAURANT: 'restaurant',
  CAFE: 'cafe',
  HOTEL: 'hotel',
  QSR: 'qsr', // Quick service restaurant
});

export const HTTP_STATUS = Object.freeze({
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
});

export const ERROR_CODES = Object.freeze({
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  CSRF_TOKEN_INVALID: 'CSRF_TOKEN_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  RATE_LIMITED: 'RATE_LIMITED',
});

export const MODULES = Object.freeze({
  POS: 'pos',
  INVENTORY: 'inventory',
  HOTEL: 'hotel',
  BAKERY: 'bakery',
  REPORTS: 'reports',
  ANALYTICS: 'analytics',
  LOYALTY: 'loyalty',
});

export const PERMISSIONS = Object.freeze({
  DASHBOARD: 'dashboard',
  POS: 'pos',
  MENU: 'menu',
  ORDERS: 'orders',
  INVENTORY: 'inventory',
  STAFF: 'staff',
  CUSTOMERS: 'customers',
  REPORTS: 'reports',
  EXPENSES: 'expenses',
  HOTEL: 'hotel',
  SETTINGS: 'settings',
  TOKENS: 'tokens',
  PAYMENTS: 'payments',
});
