import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/authStore';
import { useMainposStore } from '@/stores/mainposStore';
import { useSubposStore } from '@/stores/subposStore';
import { useThemeStore } from '@/stores/themeStore';
import { processQueue } from '@/lib/offlineQueue';
import { SOCKET_BASE_URL } from '@/lib/config';

let socketInstance: Socket | null = null;

function tryParseJwt(token?: string | null) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    let b = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b.length % 4;
    if (pad) b += '='.repeat(4 - pad);
    const decoded = atob(b);
    const json = decodeURIComponent(
      Array.prototype.map
        .call(decoded, (c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export const useSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(socketInstance);
  const [isConnected, setIsConnected] = useState(socketInstance?.connected || false);
  const { user } = useAuthStore();
  const mainposToken = useMainposStore((s) => s.token);
  const subposToken = useSubposStore((s) => s.token);

  useEffect(() => {
    // Connect if authenticated OR if on a standalone display page (Customer Display, Order Board, Kiosk, Menu)
    const isStandalonePage = typeof window !== 'undefined' && (
      window.location.href.includes('customer-display') ||
      window.location.href.includes('order-board') ||
      window.location.href.includes('kiosk') ||
      window.location.href.includes('menu')
    );

    if (!user && !mainposToken && !subposToken && !isStandalonePage) return;

    if (!socketInstance) {
      socketInstance = io(SOCKET_BASE_URL, {
        // Use polling as primary — works reliably even when WebSocket upgrades fail
        transports: ['polling', 'websocket'],
        // Auto-reconnect settings — exponential backoff, capped at 10s
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        reconnectionAttempts: Infinity,
        // Silence noisy connection errors after first failure (reconnect silently)
        timeout: 20000,
      });

      socketInstance.on('connect', () => {
        setIsConnected(true);
        console.log('[socket] connected', socketInstance?.id);

        // Join restaurant and kitchen rooms for logged-in users
        if (user?.restaurant?.id) {
          socketInstance?.emit('join_restaurant', user.restaurant.id);
          if (user.role === 'chef') socketInstance?.emit('join_kitchen', user.restaurant.id);
        }

        // Decode POS terminal token to get restaurantId
        const mp = tryParseJwt(mainposToken);
        const sp = tryParseJwt(subposToken);
        const rid = mp?.restaurantId ?? sp?.restaurantId ?? null;
        if (rid) {
          socketInstance?.emit('join_restaurant', rid);
        }

        // Flush offline queue on reconnect
        try { processQueue().catch(() => {}); } catch { /**/ }
      });

      socketInstance.on('disconnect', (reason) => {
        setIsConnected(false);
        console.log('[socket] disconnected', reason);
      });

      // Suppress verbose connection error logs — reconnection is automatic
      socketInstance.on('connect_error', (err) => {
        // Only log in dev; in production silently retry
        if (import.meta.env.DEV) {
          console.warn('[socket] connect_error (will retry):', err.message);
        }
      });

      ['tables_updated', 'areas_updated', 'categories_updated', 'menu_updated', 'inventory_updated'].forEach((evt) => {
        socketInstance?.on(evt, (payload: any) => {
          window.dispatchEvent(new CustomEvent(evt, { detail: payload }));
        });
      });

      socketInstance.on('settings_updated', (payload: any) => {
        const settings = payload?.settings;
        if (!settings) return;
        try {
          (globalThis as any).__RESTAURANT_SETTINGS__ = settings;
          const mode = settings?.theme?.mode;
          if (mode === 'light' || mode === 'dark') {
            useThemeStore.getState().setTheme(mode);
          }
          window.dispatchEvent(new CustomEvent('settings_updated', { detail: settings }));
        } catch {
          // no-op
        }
      });
    }

    // If socket exists and we have auth, join restaurant room immediately
    if (socketInstance) {
      const mp = tryParseJwt(mainposToken);
      const sp = tryParseJwt(subposToken);
      const rid = mp?.restaurantId ?? sp?.restaurantId ?? user?.restaurant?.id ?? null;
      if (rid && socketInstance.connected) {
        try {
          socketInstance.emit('join_restaurant', rid);
          if (user?.role === 'chef') socketInstance.emit('join_kitchen', rid);
        } catch { /**/ }
      }
      setSocket(socketInstance);
      setIsConnected(socketInstance.connected);
    }

    return () => {
      // Keep socket alive across component mounts
    };
  }, [user, mainposToken, subposToken]);

  return { socket, isConnected };
};
