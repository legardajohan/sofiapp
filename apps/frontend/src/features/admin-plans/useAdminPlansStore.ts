import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { IPlan } from './types/index.js';

export type PlanViewMode = 'table' | 'cards';

interface AdminPlansState {
  isModalOpen: boolean;
  planEditing: IPlan | null;
  planDeleting: IPlan | null;
  viewMode: PlanViewMode;
  openCreate: () => void;
  openEdit: (plan: IPlan) => void;
  closeModal: () => void;
  openDelete: (plan: IPlan) => void;
  closeDelete: () => void;
  setViewMode: (mode: PlanViewMode) => void;
}

// UI state (Zustand). El modo de vista se persiste para respetar la preferencia del superadmin.
export const useAdminPlansStore = create<AdminPlansState>()(
  persist(
    (set) => ({
      isModalOpen: false,
      planEditing: null,
      planDeleting: null,
      viewMode: 'table',
      openCreate: () => set({ isModalOpen: true, planEditing: null }),
      openEdit: (plan) => set({ isModalOpen: true, planEditing: plan }),
      closeModal: () => set({ isModalOpen: false, planEditing: null }),
      openDelete: (plan) => set({ planDeleting: plan }),
      closeDelete: () => set({ planDeleting: null }),
      setViewMode: (mode) => set({ viewMode: mode }),
    }),
    {
      name: 'admin-plans-ui',
      partialize: (state) => ({ viewMode: state.viewMode }),
    },
  ),
);
