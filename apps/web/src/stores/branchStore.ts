import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface BranchState {
  currentBranchId: number | null;
  currentBranchName: string | null;
  setBranch: (id: number | null, name?: string | null) => void;
  clearBranch: () => void;
}

export const useBranchStore = create<BranchState>()(
  persist(
    (set) => ({
      currentBranchId: null,
      currentBranchName: null,
      setBranch: (id, name = null) => set({ currentBranchId: id, currentBranchName: name }),
      clearBranch: () => set({ currentBranchId: null, currentBranchName: null }),
    }),
    {
      name: 'branch-storage',
      partialize: (state) => ({
        currentBranchId: state.currentBranchId,
        currentBranchName: state.currentBranchName,
      }),
    },
  ),
);
