import { create } from 'zustand';

export interface NotificationItem {
  id: string;
  title?: string;
  message: string;
  type: 'order' | 'waiter' | 'kitchen' | 'system' | 'low_stock';
  timestamp: Date | string | number;
  read?: boolean;
  link?: string;
}

interface NotificationState {
  unreadCount: number;
  notifications: NotificationItem[];
  activeWaiterRequest: any | null;
  setActiveWaiterRequest: (request: any | null) => void;
  addNotification: (notification: Omit<NotificationItem, 'id' | 'timestamp'> & { id?: string; timestamp?: Date | string | number }) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  resetUnread: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,
  notifications: [],
  activeWaiterRequest: null,

  setActiveWaiterRequest: (request) => set({ activeWaiterRequest: request }),

  addNotification: (notif) => set((state) => {
    const id = notif.id || Math.random().toString(36).substr(2, 9);
    // Avoid duplicate notifications if id is provided
    if (notif.id && state.notifications.some(n => n.id === notif.id)) {
      return state;
    }
    const newItem: NotificationItem = {
      ...notif,
      id,
      timestamp: notif.timestamp || new Date(),
      read: false
    };
    return {
      unreadCount: state.unreadCount + 1,
      notifications: [newItem, ...state.notifications].slice(0, 50)
    };
  }),

  markAsRead: (id: string) => set((state) => {
    const target = state.notifications.find(n => n.id === id);
    if (!target || target.read) return state;
    return {
      unreadCount: Math.max(0, state.unreadCount - 1),
      notifications: state.notifications.map(n => n.id === id ? { ...n, read: true } : n)
    };
  }),

  markAllAsRead: () => set((state) => ({
    unreadCount: 0,
    notifications: state.notifications.map(n => ({ ...n, read: true }))
  })),

  clearAll: () => set({
    unreadCount: 0,
    notifications: []
  }),

  resetUnread: () => set({ unreadCount: 0 })
}));

