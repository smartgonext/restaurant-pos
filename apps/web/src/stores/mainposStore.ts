import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface MainPOSTerminalInfo {
  id: number;
  name: string;
  branchId: number;
  restaurantId?: number;
}

interface MainPOSState {
  token: string | null;
  terminal: MainPOSTerminalInfo | null;
  isAuthenticated: boolean;
    kotPopupEnabled?: boolean;
  login: (data: { token: string; terminal: MainPOSTerminalInfo }) => void;
    logout: () => void;
    setKotPopupEnabled?: (v: boolean) => void;
}

export const useMainposStore = create<MainPOSState>()(
  persist(
    (set) => ({
        token: null,
        terminal: null,
        isAuthenticated: false,
        kotPopupEnabled: true,
        login: ({ token, terminal }) => set({ token, terminal, isAuthenticated: true }),
        logout: () => set({ token: null, terminal: null, isAuthenticated: false }),
        setKotPopupEnabled: (v: boolean) => set({ kotPopupEnabled: v }),
    }),
    {
        name: 'mainpos-auth',
        partialize: (s) => ({ token: s.token, terminal: s.terminal, isAuthenticated: s.isAuthenticated, kotPopupEnabled: s.kotPopupEnabled }),
    },
  ),
);
