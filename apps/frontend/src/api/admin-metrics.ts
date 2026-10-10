import { apiClient } from './apiClient.js';
import type { GlobalMetrics, GlobalMetricsParams } from '../features/admin-metrics/types/index.js';

export const getGlobalMetrics = async (params: GlobalMetricsParams): Promise<GlobalMetrics> => {
  const res = await apiClient.get<GlobalMetrics>('/admin/metrics/global', { params });
  return res.data;
};
