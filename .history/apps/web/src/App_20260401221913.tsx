import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { router } from '@/router';
import { queryClient } from '@/lib/queryClient';
import { useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';

export default function App() {
  const { theme } = useThemeStore();
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
    // On initial load, if we have a user from storage, attempt to refresh access token.
    if (!user) return;

    (async () => {
      try {
        const { data } = await api.post('/auth/refresh');
        login({ token: data.data.token, user });
      } catch {
        logout();
        window.location.href = '/login';
      }
    })();
  }, [login, logout, user]);

  useEffect(() => {
    // Load restaurant settings once after user is loaded and expose globally
    if (!user) return;
    (async () => {
      try {
        const { data } = await api.get('/restaurant/settings');
        (globalThis as any).__RESTAURANT_SETTINGS__ = data.data;
      } catch (err) {
        // non-fatal
        console.warn('Failed to fetch restaurant settings', err);
      }
    })();
  }, [user]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
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
