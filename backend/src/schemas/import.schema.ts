import { z } from 'zod';

// Import status values from Prisma schema
const ImportStatusEnum = z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']);

/**
 * CSV Upload Request Schema
 */
export const uploadCsvSchema = z.object({
  body: z.object({
    createdBy: z.string().optional(),
    importDate: z.string().datetime().or(z.string()).optional(),
    userConfig: z.record(z.any()).optional(),
  }).optional(),
});

export type UploadCsvRequest = z.infer<typeof uploadCsvSchema>;

/**
 * Batch Status Query Schema
 */
export const batchStatusParamsSchema = z.object({
  params: z.object({
    batchId: z.string().uuid('Invalid batch ID format'),
  }),
  query: z.object({
    includeErrorDetails: z.string().transform(val => val === 'true').optional(),
  }).optional(),
});

export type BatchStatusParams = z.infer<typeof batchStatusParamsSchema>;

/**
 * Job Status Params Schema
 */
export const jobStatusParamsSchema = z.object({
  params: z.object({
    jobId: z.string().min(1, 'Job ID is required'),
  }),
});

export type JobStatusParams = z.infer<typeof jobStatusParamsSchema>;

/**
 * Recent Batches Query Schema
 */
export const recentBatchesQuerySchema = z.object({
  query: z.object({
    limit: z.string().transform(val => parseInt(val, 10)).refine(val => val > 0 && val <= 100, {
      message: 'Limit must be between 1 and 100',
    }).optional().default('10'),
    status: ImportStatusEnum.optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    createdBy: z.string().optional(),
    sortBy: z.enum(['importDate', 'createdAt', 'filename', 'status']).optional().default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
    cursor: z.string().uuid().optional(),
  }).optional(),
});

export type RecentBatchesQuery = z.infer<typeof recentBatchesQuerySchema>;

/**
 * Batch Response Schema
 */
export const batchResponseSchema = z.object({
  id: z.string(),
  importDate: z.date(),
  filename: z.string(),
  fileSize: z.number(),
  fileChecksum: z.string(),
  totalRecords: z.number(),
  successfulRecords: z.number(),
  failedRecords: z.number(),
  status: ImportStatusEnum,
  createdBy: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  processingStartTime: z.date().nullable(),
  completedAt: z.date().nullable(),
  estimatedCompletionTime: z.date().nullable(),
  errorLogs: z.any(),
  userConfig: z.any().nullable(),
  validationWarnings: z.any().nullable(),
  emptyRowsSkipped: z.number(),
  errorDetails: z.array(z.any()).optional(),
});

export type BatchResponse = z.infer<typeof batchResponseSchema>;

/**
 * Job Status Response Schema
 */
export const jobStatusResponseSchema = z.object({
  jobId: z.string(),
  state: z.enum(['waiting', 'active', 'completed', 'failed', 'delayed', 'paused']),
  progress: z.number().or(z.object({}).passthrough()),
  data: z.object({
    batchId: z.string(),
  }).passthrough(),
  opts: z.object({}).passthrough().optional(),
  attemptsMade: z.number(),
  finishedOn: z.number().nullable(),
  processedOn: z.number().nullable(),
  failedReason: z.string().nullable(),
});

export type JobStatusResponse = z.infer<typeof jobStatusResponseSchema>;

/**
 * Import Statistics Schema
 */
export const importStatsQuerySchema = z.object({
  query: z.object({
    period: z.enum(['day', 'week', 'month', 'year']).optional().default('week'),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }).optional(),
});

export type ImportStatsQuery = z.infer<typeof importStatsQuerySchema>;

export const importStatsResponseSchema = z.object({
  period: z.string(),
  totalImports: z.number(),
  successfulImports: z.number(),
  failedImports: z.number(),
  successRate: z.number(),
  averageProcessingTime: z.number(),
  totalRecordsProcessed: z.number(),
  dailyBreakdown: z.array(z.object({
    date: z.string(),
    imports: z.number(),
    records: z.number(),
  })).optional(),
});

export type ImportStatsResponse = z.infer<typeof importStatsResponseSchema>;

/**
 * Error Response Schema
 */
export const errorResponseSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  statusCode: z.number().optional(),
  details: z.any().optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
