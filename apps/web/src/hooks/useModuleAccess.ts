import { useAuthStore } from '@/stores/authStore';

export function useModuleAccess(moduleName: string): boolean {
  const { user } = useAuthStore();

  if (!user) return false;

  // SuperAdmins bypass all module restrictions
  if (user.role === 'superadmin') return true;

  // In a real application, the user's restaurant object would contain the subscription data
  // e.g., user.restaurant.subscription.package.modules
  // For the purpose of this scope we will assume all modules are enabled if it is not explicitly configured
  // Alternatively, we could default to true for development. 
  
  // Example of mocked response parsing:
  // const subscription = (user.restaurant as any)?.subscription;
  // if (subscription?.status !== 'active' && subscription?.status !== 'trial') return false;
  // const allowedModules = subscription?.package?.modules || [];
  // return allowedModules.includes(moduleName);

  return true;
}
