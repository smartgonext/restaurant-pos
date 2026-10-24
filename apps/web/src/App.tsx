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
import { setupElectronPrintNotifications } from '@/lib/electronPrint';
import { startOfflineSync } from '@/lib/offlineQueue';

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

  // Handle global Enter key navigation for inputs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;

      const target = e.target as HTMLElement;
      if (!target) return;

      // Only intercept for text-like inputs and select elements
      const isInput = target.tagName === 'INPUT' && !['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'hidden'].includes((target as HTMLInputElement).type);
      const isSelect = target.tagName === 'SELECT';

      if (!isInput && !isSelect) return;

      // Find the closest logical container (e.g. form, modal, card, or dialog)
      const container = target.closest('form, [role="dialog"], .modal, .card, [class*="modal"], [class*="card"]') || document.body;

      // Find all potential focusable elements
      const selector = 'input, select, textarea, button, [tabindex]';
      const allElements = Array.from(container.querySelectorAll(selector)) as HTMLElement[];

      // Helper to check if element is secondary or cancel button
      const isSecondaryOrCancel = (el: HTMLElement) => {
        if (el.tagName !== 'BUTTON' && !(el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'button')) {
          return false;
        }
        const text = el.textContent?.trim().toLowerCase() || '';
        const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
        const className = el.className.toLowerCase();
        
        const skipWords = ['cancel', 'close', 'reset', 'back', 'no', 'dismiss', 'exit'];
        const matchesText = skipWords.some(word => text.includes(word) || ariaLabel.includes(word));
        const matchesClass = className.includes('secondary') || className.includes('cancel') || className.includes('close');
        
        return matchesText || matchesClass;
      };

      // Helper to check visibility
      const isVisible = (el: HTMLElement) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const hasSize = rect.width > 0 && rect.height > 0;
        const isNotHidden = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        return hasSize && isNotHidden;
      };

      // Filter list of active focusable elements
      const focusable = allElements.filter(el => {
        if (!isVisible(el) || (el as any).disabled) return false;

        const tagName = el.tagName;
        if (tagName === 'INPUT') {
          const inputType = (el as HTMLInputElement).type;
          if (['hidden', 'checkbox', 'radio', 'file', 'image', 'submit', 'button', 'reset'].includes(inputType)) {
            return false;
          }
          return true;
        }
        if (tagName === 'SELECT' || tagName === 'TEXTAREA') {
          return true;
        }
        if (tagName === 'BUTTON') {
          return !isSecondaryOrCancel(el);
        }
        const tabIndex = el.getAttribute('tabindex');
        if (tabIndex && tabIndex !== '-1') {
          return !isSecondaryOrCancel(el);
        }
        return false;
      });

      const index = focusable.indexOf(target);
      if (index !== -1 && index < focusable.length - 1) {
        // Prevent default browser behavior (e.g. immediate submission)
        e.preventDefault();
        // Shift focus to the next element
        focusable[index + 1].focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);


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
