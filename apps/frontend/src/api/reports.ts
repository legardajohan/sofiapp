import { apiClient } from './apiClient.js';
import type { AdvisorReport, AdvisorReportParams } from '../features/reports/types/index.js';

export const getAdvisorReport = async (params: AdvisorReportParams): Promise<AdvisorReport> => {
  const res = await apiClient.get<AdvisorReport>('/reports/by-advisor', { params });
  return res.data;
};
