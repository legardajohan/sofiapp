import { create } from 'zustand';
import type { ITenant } from './types/index.js';

interface AdminTenantsState {
  searchTerm: string;
  currentPage: number;
  isModalOpen: boolean;
  tenantEditing: ITenant | null;
  openCreate: () => void;
  openEdit: (tenant: ITenant) => void;
  closeModal: () => void;
  setSearch: (term: string) => void;
  setPage: (page: number) => void;
}

export const useAdminTenantsStore = create<AdminTenantsState>((set) => ({
  searchTerm: '',
  currentPage: 1,
  isModalOpen: false,
  tenantEditing: null,

  openCreate: () => set({ isModalOpen: true, tenantEditing: null }),
  openEdit: (tenant) => set({ isModalOpen: true, tenantEditing: tenant }),
  closeModal: () => set({ isModalOpen: false, tenantEditing: null }),
  setSearch: (term) => set({ searchTerm: term, currentPage: 1 }),
  setPage: (page) => set({ currentPage: page }),
}));
