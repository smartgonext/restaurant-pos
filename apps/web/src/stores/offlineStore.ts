import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import toast from 'react-hot-toast';

export interface OfflineOrder {
  id: string;
  tokenNumber: number;
  items: Array<{
    menuItemId: number;
    menuItemName: string;
    quantity: number;
    price: number;
    total: number;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod?: string;
  paymentAmount?: number;
  createdAt: string;
  status: 'pending' | 'synced' | 'failed';
}

export interface OfflineStore {
  // State
  isOnline: boolean;
  pendingOrders: OfflineOrder[];
  lastSyncTime: number | null;
  syncInProgress: boolean;
  failedOrders: OfflineOrder[];

  // Actions
  setOnline: (online: boolean) => void;
  addPendingOrder: (order: OfflineOrder) => void;
  removePendingOrder: (orderId: string) => void;
  updateOrderStatus: (orderId: string, status: 'pending' | 'synced' | 'failed') => void;
  setSyncInProgress: (inProgress: boolean) => void;
  setLastSyncTime: (time: number) => void;
  clearSyncedOrders: () => void;
  getFailedOrders: () => OfflineOrder[];
  getPendingOrdersCount: () => number;
}

/**
 * Offline support store for bakery POS
 * Bakery can't lose internet connection mid-service
 * Stores orders locally when offline, syncs when back online
 * Uses localStorage for persistence across app restarts
 */
export const useOfflineStore = create<OfflineStore>()(
  persist(
    (set, get) => ({
      // Initial state
      isOnline: navigator.onLine,
      pendingOrders: [],
      lastSyncTime: null,
      syncInProgress: false,
      failedOrders: [],

      // Actions
      setOnline: (online: boolean) => {
        const wasOnline = get().isOnline;
        set({ isOnline: online });

        if (!wasOnline && online) {
          toast.success('📡 Back online - syncing orders...');
          console.log('[OfflineStore] Connection restored');
        } else if (wasOnline && !online) {
          toast('📴 Offline mode - orders will sync when online');
          console.log('[OfflineStore] Connection lost');
        }
      },

      addPendingOrder: (order: OfflineOrder) => {
        set(state => ({
          pendingOrders: [...state.pendingOrders, order]
        }));
        console.log('[OfflineStore] Added pending order:', order.id);
      },

      removePendingOrder: (orderId: string) => {
        set(state => ({
          pendingOrders: state.pendingOrders.filter(o => o.id !== orderId)
        }));
      },

      updateOrderStatus: (orderId: string, status: 'pending' | 'synced' | 'failed') => {
        set(state => {
          const updated = state.pendingOrders.map(o =>
            o.id === orderId ? { ...o, status } : o
          );
          const failed = updated.filter(o => o.status === 'failed');
          return {
            pendingOrders: updated,
            failedOrders: failed
          };
        });
      },

      setSyncInProgress: (inProgress: boolean) => {
        set({ syncInProgress: inProgress });
      },

      setLastSyncTime: (time: number) => {
        set({ lastSyncTime: time });
      },

      clearSyncedOrders: () => {
        set(state => ({
          pendingOrders: state.pendingOrders.filter(o => o.status !== 'synced')
        }));
      },

      getFailedOrders: () => get().failedOrders,

      getPendingOrdersCount: () => {
        const orders = get().pendingOrders;
        return orders.filter(o => o.status === 'pending').length;
      },
    }),
    {
      name: 'offline-store',
      version: 1,
    }
  )
);

/**
 * Hook to monitor online/offline status
 */
export function useOnlineStatus() {
  const { isOnline, setOnline } = useOfflineStore();

  // Monitor browser online/offline events
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => setOnline(true));
    window.addEventListener('offline', () => setOnline(false));
  }

  return { isOnline };
}
