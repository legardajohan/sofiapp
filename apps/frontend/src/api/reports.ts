import { apiClient } from './apiClient.js';
import type {
  AdvisorReport,
  AdvisorReportParams,
  HandoffRate,
  HandoffRateParams,
} from '../features/reports/types/index.js';

export const getAdvisorReport = async (params: AdvisorReportParams): Promise<AdvisorReport> => {
  const res = await apiClient.get<AdvisorReport>('/reports/by-advisor', { params });
  return res.data;
};

export const getHandoffRate = async (params: HandoffRateParams): Promise<HandoffRate> => {
  const res = await apiClient.get<HandoffRate>('/reports/handoff-rate', { params });
  return res.data;
};
