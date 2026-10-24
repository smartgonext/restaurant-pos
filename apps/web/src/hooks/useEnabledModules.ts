import { useAuthStore } from '@/stores/authStore';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

function normalizeModules(value: unknown): string[] {
  let rawModules: unknown[] = [];

  if (Array.isArray(value)) {
    rawModules = value;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        rawModules = parsed;
      } else {
        rawModules = trimmed.split(',');
      }
    } catch {
      rawModules = trimmed.split(',');
    }
  }

  const aliasMap: Record<string, string> = {
    cashregister: 'cash_register',
    'cash-register': 'cash_register',
    kitchen: 'kitchens',
  };

  return rawModules
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean)
    .map((item) => aliasMap[item] ?? item);
}

export function useEnabledModules() {
  const { user, token } = useAuthStore();
  const [enabledModules, setEnabledModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchModules = async () => {
      try {
        const isSuperAdmin = user?.role === 'superadmin' || user?.role === 'support';
        if (isSuperAdmin) {
          setEnabledModules([]);
          setLoading(false);
          return;
        }

        if (!user?.restaurant?.id || !token) {
          setEnabledModules([]);
          setLoading(false);
          return;
        }

        const response = await api.get('/restaurant/modules');
        const normalized = normalizeModules(response.data.data);
        setEnabledModules(normalized.length > 0 ? normalized : ['restaurant']);
      } catch (error: any) {
        console.error('Error fetching enabled modules:', error?.response?.data || error?.message || error);
        // Keep a safe core fallback for non-superadmin users when fetch fails.
        setEnabledModules(['restaurant']);
      } finally {
        setLoading(false);
      }
    };

    fetchModules();
  }, [user?.restaurant?.id, user?.role, token]);

  const isModuleEnabled = (module: string) => {
    const normalized = (module || '').trim().toLowerCase();
    return enabledModules.includes(normalized);
  };

  return { enabledModules, isModuleEnabled, loading };
}
