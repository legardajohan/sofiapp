import { create } from 'zustand';
import type { IPlan } from './types/index.js';

interface AdminPlansState {
  isModalOpen: boolean;
  planEditing: IPlan | null;
  openCreate: () => void;
  openEdit: (plan: IPlan) => void;
  closeModal: () => void;
}

export const useAdminPlansStore = create<AdminPlansState>((set) => ({
  isModalOpen: false,
  planEditing: null,
  openCreate: () => set({ isModalOpen: true, planEditing: null }),
  openEdit: (plan) => set({ isModalOpen: true, planEditing: plan }),
  closeModal: () => set({ isModalOpen: false, planEditing: null }),
}));
