import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SubPOSTerminalInfo {
  id: number;
  name: string;
  branchId: number;
  groupIds: number[];
}

interface SubPOSState {
  token: string | null;
  terminal: SubPOSTerminalInfo | null;
  isAuthenticated: boolean;
    kotPopupEnabled?: boolean;
  login: (data: { token: string; terminal: SubPOSTerminalInfo }) => void;
    logout: () => void;
    setKotPopupEnabled?: (v: boolean) => void;
}

export const useSubposStore = create<SubPOSState>()(
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
      name: 'subpos-auth',
      partialize: (s) => ({ token: s.token, terminal: s.terminal, isAuthenticated: s.isAuthenticated, kotPopupEnabled: s.kotPopupEnabled }),
    },
  ),
);
