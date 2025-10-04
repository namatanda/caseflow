import { z } from 'zod';

/**
 * Health Check Response Schema
 */
export const healthCheckResponseSchema = z.object({
  status: z.enum(['healthy', 'unhealthy', 'degraded']),
  timestamp: z.string(),
  uptime: z.number(),
  version: z.string(),
  environment: z.string(),
  checks: z.object({
    database: z.object({
      status: z.enum(['healthy', 'unhealthy']),
      responseTime: z.number(),
      details: z.object({
        canConnect: z.boolean(),
        canQuery: z.boolean(),
        responseTime: z.number(),
        error: z.string().optional(),
      }),
    }),
    redis: z.object({
      status: z.enum(['healthy', 'unhealthy']),
      responseTime: z.number(),
      details: z.object({
        mainClient: z.boolean(),
        sessionClient: z.boolean(),
        cacheClient: z.boolean(),
        responseTime: z.number(),
        error: z.string().optional(),
      }),
    }),
    queues: z.object({
      status: z.enum(['healthy', 'unhealthy']),
      responseTime: z.number(),
      details: z.object({
        csvImportQueue: z.boolean(),
        waiting: z.number(),
        active: z.number(),
        completed: z.number(),
        failed: z.number(),
        delayed: z.number(),
      }),
    }),
    memory: z.object({
      status: z.enum(['healthy', 'unhealthy']),
      usage: z.object({
        used: z.number(),
        total: z.number(),
        percentage: z.number(),
      }),
    }),
    disk: z.object({
      status: z.enum(['healthy', 'unhealthy']),
      usage: z.object({
        used: z.number(),
        total: z.number(),
        percentage: z.number(),
      }).optional(),
    }),
  }),
  errors: z.array(z.string()),
});

export type HealthCheckResponse = z.infer<typeof healthCheckResponseSchema>;

/**
 * Version Response Schema
 */
export const versionResponseSchema = z.object({
  version: z.string(),
  apiVersion: z.string(),
  environment: z.string(),
  buildDate: z.string().optional(),
  gitCommit: z.string().optional(),
  buildNumber: z.string().optional(),
  dependencies: z.object({
    node: z.string(),
    prisma: z.string().optional(),
    express: z.string().optional(),
    bullmq: z.string().optional(),
    redis: z.string().optional(),
  }).optional(),
});

export type VersionResponse = z.infer<typeof versionResponseSchema>;

/**
 * Performance Metrics Query Schema
 */
export const performanceMetricsQuerySchema = z.object({
  query: z.object({
    period: z.enum(['hour', 'day', 'week']).optional().default('hour'),
    endpoint: z.string().optional(),
  }).optional(),
});

export type PerformanceMetricsQuery = z.infer<typeof performanceMetricsQuerySchema>;

/**
 * Performance Metrics Response Schema
 */
export const performanceMetricsResponseSchema = z.object({
  period: z.string(),
  endpoints: z.array(z.object({
    path: z.string(),
    method: z.string(),
    avgResponseTime: z.number(),
    minResponseTime: z.number(),
    maxResponseTime: z.number(),
    requestCount: z.number(),
    errorCount: z.number(),
    errorRate: z.number(),
  })),
  database: z.object({
    avgQueryTime: z.number(),
    slowQueries: z.number(),
    connectionPoolUsage: z.number(),
  }).optional(),
  redis: z.object({
    avgOperationTime: z.number(),
    hitRate: z.number(),
    missRate: z.number(),
  }).optional(),
});

export type PerformanceMetricsResponse = z.infer<typeof performanceMetricsResponseSchema>;

/**
 * Error Summary Query Schema
 */
export const errorSummaryQuerySchema = z.object({
  query: z.object({
    period: z.enum(['hour', 'day', 'week']).optional().default('hour'),
    severity: z.enum(['error', 'warning', 'critical']).optional(),
    limit: z.string().transform(val => parseInt(val, 10)).refine(val => val > 0 && val <= 100).optional().default('50'),
  }).optional(),
});

export type ErrorSummaryQuery = z.infer<typeof errorSummaryQuerySchema>;

/**
 * Error Summary Response Schema
 */
export const errorSummaryResponseSchema = z.object({
  period: z.string(),
  totalErrors: z.number(),
  errorRate: z.number(),
  errors: z.array(z.object({
    timestamp: z.string(),
    message: z.string(),
    endpoint: z.string().optional(),
    method: z.string().optional(),
    statusCode: z.number().optional(),
    count: z.number(),
    lastOccurrence: z.string(),
  })),
  errorsByType: z.record(z.number()),
  errorsByEndpoint: z.record(z.number()),
});

export type ErrorSummaryResponse = z.infer<typeof errorSummaryResponseSchema>;

/**
 * Resource Usage Response Schema
 */
export const resourceUsageResponseSchema = z.object({
  timestamp: z.string(),
  cpu: z.object({
    usage: z.number(),
    loadAverage: z.array(z.number()),
  }),
  memory: z.object({
    used: z.number(),
    total: z.number(),
    percentage: z.number(),
    heapUsed: z.number(),
    heapTotal: z.number(),
  }),
  disk: z.object({
    used: z.number(),
    total: z.number(),
    percentage: z.number(),
  }).optional(),
  network: z.object({
    bytesReceived: z.number(),
    bytesSent: z.number(),
  }).optional(),
});

export type ResourceUsageResponse = z.infer<typeof resourceUsageResponseSchema>;
