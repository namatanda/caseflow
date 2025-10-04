import { apiClient } from '../client';
import type { AxiosResponse } from 'axios';
import type { BatchInfo } from '@/store/importStore';
import type {
  UploadResponse,
  BatchStatusResponse,
  JobStatusResponse,
  RecentBatchesResponse,
} from '../types/import.types';

export const importAPI = {
  uploadCsv: (
    file: File,
    metadata?: Record<string, unknown>
  ): Promise<AxiosResponse<UploadResponse>> => {
    const formData = new FormData();
    formData.append('file', file);
    if (metadata) {
      formData.append('metadata', JSON.stringify(metadata));
    }

    return apiClient.post('/import/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  getBatchStatus: (batchId: string): Promise<AxiosResponse<BatchStatusResponse>> =>
    apiClient.get(`/import/batch/${batchId}`),

  getJobStatus: (batchId: string, jobId: string): Promise<AxiosResponse<JobStatusResponse>> =>
    apiClient.get(`/import/batch/${batchId}/job/${jobId}`),

  getRecentBatches: (params?: {
    limit?: number;
    offset?: number;
    status?: string;
  }): Promise<AxiosResponse<RecentBatchesResponse>> =>
    apiClient.get('/import/batches/recent', { params }),

  exportBatch: (batchId: string): Promise<AxiosResponse<Blob>> =>
    apiClient.get(`/import/batch/${batchId}/export`, {
      responseType: 'blob',
    }),
};