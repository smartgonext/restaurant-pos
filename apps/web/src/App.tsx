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

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#0d1526',
            color: '#f1f5f9',
            border: '1px solid #1e3a5f',
            borderRadius: '12px',
          },
          success: { iconTheme: { primary: '#10b981', secondary: '#f1f5f9' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#f1f5f9' } },
        }}
      />
    </QueryClientProvider>
  );
}
