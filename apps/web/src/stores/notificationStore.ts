import { create } from 'zustand';

interface NotificationState {
  unreadCount: number;
  incrementUnread: () => void;
  resetUnread: () => void;
  notifications: Array<{ id: string; message: string; type: 'order' | 'waiter' | 'kitchen' | 'system'; timestamp: Date }>;
  addNotification: (notification: Omit<NotificationState['notifications'][0], 'id' | 'timestamp'>) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,
  notifications: [],
  incrementUnread: () => set((state) => ({ unreadCount: state.unreadCount + 1 })),
  resetUnread: () => set({ unreadCount: 0 }),
  addNotification: (notif) => set((state) => ({
    unreadCount: state.unreadCount + 1,
    notifications: [
      { ...notif, id: Math.random().toString(36).substr(2, 9), timestamp: new Date() },
      ...state.notifications
    ].slice(0, 50) // keep last 50
  }))
}));
