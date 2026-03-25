import { useAuthStore } from '@/stores/authStore';

export type UserRole = 'superadmin' | 'support' | 'admin' | 'branch_head' | 'waiter' | 'chef';

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  superadmin: ['all'],
  support: ['all'],
  admin: ['all'],
  branch_head: [
    'dashboard', 'menu', 'tables', 'waiter_requests', 'reservations',
    'pos', 'orders', 'customers', 'staff', 'expenses', 'payments',
    'reports', 'cash_register', 'inventory', 'kitchens'
  ],
  waiter: [
    'dashboard', 'tables', 'waiter_requests', 'pos', 'orders'
  ],
  chef: [
    'kitchens' // completely isolated
  ]
};

export function usePermission() {
  const { user } = useAuthStore();
  const role = (user?.role || 'waiter') as UserRole;

  const hasPermission = (module: string) => {
    if (!user) return false;
    if (ROLE_PERMISSIONS[role].includes('all')) return true;
    return ROLE_PERMISSIONS[role].includes(module);
  };

  return { hasPermission, role };
}
