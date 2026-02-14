import { apiClient } from './client';

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<any>('/auth/login', { email, password }),

  register: (name: string, email: string, password: string) =>
    apiClient.post<any>('/auth/register', { name, email, password }),

  refreshToken: (refreshToken: string) =>
    apiClient.post<any>('/auth/refresh', { refreshToken }),

  getMe: () => apiClient.get<any>('/auth/me'),
};

export const projectApi = {
  list: (params?: Record<string, string>) =>
    apiClient.get<any>('/projects', params),

  get: (id: string) =>
    apiClient.get<any>(`/projects/${id}`),

  create: (data: { name: string; description: string; framework: string; visibility?: string; prompt?: string }) =>
    apiClient.post<any>('/projects', data),

  update: (id: string, data: { name?: string; description?: string; visibility?: string }) =>
    apiClient.patch<any>(`/projects/${id}`, data),

  delete: (id: string) =>
    apiClient.delete<any>(`/projects/${id}`),

  generate: (id: string, prompt: string, options?: { model?: string; temperature?: number; stream?: boolean }) =>
    apiClient.post<any>(`/projects/${id}/generate`, { prompt, options }),

  deploy: (id: string) =>
    apiClient.post<any>(`/projects/${id}/deploy`),

  getDeployments: (id: string) =>
    apiClient.get<any>(`/projects/${id}/deployments`),
};

export { apiClient, ApiError } from './client';
