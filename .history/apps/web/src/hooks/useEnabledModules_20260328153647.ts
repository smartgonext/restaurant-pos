import { useAuthStore } from '@/stores/authStore';
import { useEffect, useState } from 'react';

export function useEnabledModules() {
  const { user, token } = useAuthStore();
  const [enabledModules, setEnabledModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchModules = async () => {
      try {
        if (!user?.restaurant?.id || !token) {
          setEnabledModules([]);
          setLoading(false);
          return;
        }

        const response = await fetch('/api/restaurant/modules', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setEnabledModules(Array.isArray(data.data) ? data.data : []);
        } else {
          console.warn('Failed loading enabled modules', response.status);
          setEnabledModules([]);
        }
      } catch (error) {
        console.error('Error fetching enabled modules:', error);
        setEnabledModules([]);
      } finally {
        setLoading(false);
      }
    };

    fetchModules();
  }, [user?.restaurant?.id, token]);

  const isModuleEnabled = (module: string) => enabledModules.includes(module);

  return { enabledModules, isModuleEnabled, loading };
}
