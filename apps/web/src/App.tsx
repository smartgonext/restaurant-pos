import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { createAppRouter } from '@/router';
import { useMemo } from 'react';
import { queryClient } from '@/lib/queryClient';
import { useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import { setCachedMenuItems, setCachedCategories } from '@/lib/posCache';
import { setupElectronPrintNotifications } from '@/lib/electronPrint';
import { startOfflineSync } from '@/lib/offlineQueue';
import { useEnterKeyNavigation } from '@/hooks/useEnterKeyNavigation';

export default function App() {
  const { theme, setTheme } = useThemeStore();
  const { user, login, logout } = useAuthStore();

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
  }, [theme]);

  useEffect(() => {
    // Load restaurant settings once after user is loaded and expose globally
    if (!user) return;
    // Superadmin/support users do not have restaurant scope; avoid forbidden settings calls.
    if (user.role === 'superadmin' || user.role === 'support') return;
    (async () => {
      try {
        const { data } = await api.get('/restaurant/settings');
        (globalThis as any).__RESTAURANT_SETTINGS__ = data.data;
        const mode = data?.data?.theme?.mode;
        if (mode === 'light' || mode === 'dark') {
          setTheme(mode);
        }
      } catch (err) {
        // non-fatal
        console.warn('Failed to fetch restaurant settings', err);
      }

      // Background prefetch POS items and categories so MainPOS and SubPOS open with zero delay
      try {
        const authToken = useAuthStore.getState().token;
        if (authToken) {
          api.get('/mainpos/items').then((res) => {
            if (Array.isArray(res.data?.data) && res.data.data.length > 0) {
              setCachedMenuItems('main', res.data.data);
              queryClient.setQueryData(['mainpos-items', authToken], res.data.data);
            }
          }).catch(() => {});

          api.get('/mainpos/categories').then((res) => {
            if (Array.isArray(res.data?.data) && res.data.data.length > 0) {
              setCachedCategories('main', res.data.data);
              queryClient.setQueryData(['mainpos-categories', authToken], res.data.data);
            }
          }).catch(() => {});

          api.get('/subpos/items').then((res) => {
            if (Array.isArray(res.data?.data) && res.data.data.length > 0) {
              setCachedMenuItems('subpos', res.data.data);
              queryClient.setQueryData(['subpos-items', authToken], res.data.data);
            }
          }).catch(() => {});

          api.get('/subpos/categories').then((res) => {
            if (Array.isArray(res.data?.data) && res.data.data.length > 0) {
              setCachedCategories('subpos', res.data.data);
              queryClient.setQueryData(['subpos-categories', authToken], res.data.data);
            }
          }).catch(() => {});
        }
      } catch (prefetchErr) {
        // non-fatal background prefetch
      }
    })();
  }, [user, setTheme]);

  useEffect(() => {
    const cleanup = setupElectronPrintNotifications();
    const stop = startOfflineSync();
    return () => {
      cleanup?.();
      stop?.();
    };
  }, []);

  // Handle superadmin "view as restaurant" — picks up impersonation session from new tab
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('impersonate_session');
      if (raw) {
        sessionStorage.removeItem('impersonate_session');
        const { token, user: impUser } = JSON.parse(raw);
        if (token && impUser) {
          login({ token, user: impUser });
        }
      }
    } catch {
      // ignore
    }
  }, [login]);

  // Universal keyboard-friendly form, dropdown & button navigation across the entire application
  useEnterKeyNavigation();


  return (
    <QueryClientProvider client={queryClient}>
      {/* create router at runtime so we can pick hash vs browser router */}
      <RouterProvider router={useMemo(() => createAppRouter(), [])} />
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1e2235',
            color: '#ffffff',
            border: '1px solid #2a2d3e',
            borderRadius: '12px',
          },
          success: { duration: 3000, iconTheme: { primary: '#10b981', secondary: '#ffffff' } },
          error: { duration: 5000, iconTheme: { primary: '#ef4444', secondary: '#ffffff' } },
        }}
      />
    </QueryClientProvider>
  );
}
