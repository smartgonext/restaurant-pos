import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  theme: string;
  language: string;
  permissions?: Record<string, boolean>;
  restaurant?: { id: number; name: string; slug: string };
  branch?: { id: number; name: string };
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  login: (data: { token: string; user: User }) => void;
  logout: () => void;
  setToken: (token: string) => void;
  updateUser: (data: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      login: ({ token, user }) => set({ token, user, isAuthenticated: true }),
      logout: () => {
        // Clear the persisted auth store entry used by zustand/persist
        try {
          localStorage.removeItem('auth-storage');
        } catch (_) {
          // ignore if storage access fails
        }
        set({ token: null, user: null, isAuthenticated: false });
      },
      setToken: (token) => set({ token }),
      updateUser: (data) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...data } : null,
        })),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token, user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);
