export interface UploadResponse {
  batchId: string;
  jobId: string;
  fileName: string;
  fileSize: number;
  checksum: {
    md5: string;
    sha256: string;
  };
  message: string;
}

export interface BatchStatusResponse {
  id: string;
  fileName: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  totalRecords: number;
  processedRecords: number;
  validRecords: number;
  invalidRecords: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  jobs: Array<{
    id: string;
    status: string;
    progress: number;
    startedAt?: string;
    completedAt?: string;
  }>;
}

export interface JobStatusResponse {
  id: string;
  batchId: string;
  status: 'waiting' | 'active' | 'completed' | 'failed';
  progress: number;
  data?: any;
  returnvalue?: any;
  failedReason?: string;
  processedOn?: number;
  finishedOn?: number;
}

export interface RecentBatchesResponse {
  batches: Array<{
    id: string;
    fileName: string;
    fileSize: number;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    totalRecords: number;
    processedRecords: number;
    validRecords: number;
    invalidRecords: number;
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
  }>;
  total: number;
}