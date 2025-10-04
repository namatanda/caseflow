import { apiClient } from '../client';

export const authAPI = {
  login: (email: string, password: string) =>
    apiClient.post('/auth/login', { email, password }),

  register: (data: { email: string; password: string; name: string }) =>
    apiClient.post('/auth/register', data),

  logout: () => apiClient.post('/auth/logout'),

  getProfile: () => apiClient.get('/auth/me'),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient.post('/auth/change-password', { currentPassword, newPassword }),

  refreshToken: (refreshToken: string) =>
    apiClient.post('/auth/refresh', { refreshToken }),
};