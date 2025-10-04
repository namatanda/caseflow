import { apiClient } from '../client';

export const systemAPI = {
  getHealth: () => apiClient.get('/system/health'),

  getDetailedHealth: () => apiClient.get('/system/health/detailed'),

  getMetrics: () => apiClient.get('/system/metrics'),

  getVersion: () => apiClient.get('/system/version'),
};