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
  restaurant?: { id: number; name: string; slug: string };
  branch?: { id: number; name: string };
}

interface ImpersonationBackup {
  token: string;
  user: User;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  login: (data: { token: string; user: User }, impersonate?: boolean) => void;
  logout: () => void;
  setToken: (token: string) => void;
  updateUser: (data: Partial<User>) => void;
  restoreSuperadmin: () => boolean;
}

const IMPO_BACKUP_KEY = 'impersonation-backup';

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      login: ({ token, user }, impersonate = false) => {
        if (impersonate && typeof window !== 'undefined' && user) {
          const current = (get() as AuthState);
          if (current.token && current.user && current.user.role === 'superadmin') {
            localStorage.setItem(IMPO_BACKUP_KEY, JSON.stringify({ token: current.token, user: current.user }));
          }
        }
        set({ token, user, isAuthenticated: true });
      },
      logout: () => {
        localStorage.removeItem('auth-token');
        localStorage.removeItem(IMPO_BACKUP_KEY);
        set({ token: null, user: null, isAuthenticated: false });
      },
      setToken: (token) => set({ token }),
      updateUser: (data) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...data } : null,
        })),
      restoreSuperadmin: () => {
        if (typeof window === 'undefined') return false;
        const backup = localStorage.getItem(IMPO_BACKUP_KEY);
        if (!backup) return false;
        try {
          const payload = JSON.parse(backup) as ImpersonationBackup;
          set({ token: payload.token, user: payload.user, isAuthenticated: true });
          localStorage.removeItem(IMPO_BACKUP_KEY);
          return true;
        } catch {
          localStorage.removeItem(IMPO_BACKUP_KEY);
          return false;
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token, user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);
