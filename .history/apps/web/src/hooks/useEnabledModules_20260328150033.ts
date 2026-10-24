import { useAuthStore } from '@/stores/authStore';
import { useEffect, useState } from 'react';

export function useEnabledModules() {
  const { user } = useAuthStore();
  const [enabledModules, setEnabledModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchModules = async () => {
      try {
        if (!user?.restaurant?.id) {
          setEnabledModules([]);
          setLoading(false);
          return;
        }

        const response = await fetch('/api/restaurant/modules');
        if (response.ok) {
          const data = await response.json();
          setEnabledModules(Array.isArray(data.data) ? data.data : []);
        }
      } catch (error) {
        console.error('Error fetching enabled modules:', error);
        setEnabledModules([]);
      } finally {
        setLoading(false);
      }
    };

    fetchModules();
  }, [user?.restaurant?.id]);

  const isModuleEnabled = (module: string) => enabledModules.includes(module);

  return { enabledModules, isModuleEnabled, loading };
}
