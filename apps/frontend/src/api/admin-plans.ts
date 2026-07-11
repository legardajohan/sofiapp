import { apiClient } from './apiClient.js';
import type {
  IPlan,
  CreatePlanPayload,
  UpdatePlanPayload,
  IExchangeRateVigente,
} from '../features/admin-plans/types/index.js';

export const getAdminPlans = async (): Promise<IPlan[]> => {
  const res = await apiClient.get<IPlan[]>('/admin/plans');
  return res.data;
};

export const createAdminPlan = async (payload: CreatePlanPayload): Promise<IPlan> => {
  const res = await apiClient.post<IPlan>('/admin/plans', payload);
  return res.data;
};

export const updateAdminPlan = async (
  id: string,
  payload: UpdatePlanPayload
): Promise<IPlan> => {
  const res = await apiClient.patch<IPlan>(`/admin/plans/${id}`, payload);
  return res.data;
};

export const deleteAdminPlan = async (id: string): Promise<void> => {
  await apiClient.delete(`/admin/plans/${id}`);
};

export const getExchangeRateVigente = async (): Promise<IExchangeRateVigente> => {
  const res = await apiClient.get<IExchangeRateVigente>('/admin/exchange-rate/vigente');
  return res.data;
};
