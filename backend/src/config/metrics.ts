import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';
import { logger } from '@/utils/logger';

/**
 * Initialize Prometheus metrics collection
 * This should be called once when the application starts
 */
export function initializeMetrics(): void {
  try {
    // Collect default Node.js metrics (CPU, memory, event loop, etc.)
    collectDefaultMetrics({
      register,
      prefix: 'courtflow_',
      gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5], // Garbage collection duration buckets
      eventLoopMonitoringPrecision: 10, // Event loop monitoring precision in ms
    });

    logger.info('✅ Prometheus default metrics collector initialized');
  } catch (error) {
    logger.error('Failed to initialize Prometheus metrics', { error });
  }
}

// ============================================================================
// Custom Metrics for CourtFlow Backend
// ============================================================================

/**
 * HTTP Request Duration Histogram
 * Tracks the duration of HTTP requests by method, route, and status code
 */
export const httpRequestDuration = new Histogram({
  name: 'courtflow_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10], // Request duration buckets in seconds
  registers: [register],
});

/**
 * HTTP Request Counter
 * Counts total HTTP requests by method, route, and status code
 */
export const httpRequestTotal = new Counter({
  name: 'courtflow_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

/**
 * HTTP Request Errors Counter
 * Counts HTTP requests that resulted in errors (4xx, 5xx)
 */
export const httpRequestErrors = new Counter({
  name: 'courtflow_http_request_errors_total',
  help: 'Total number of HTTP request errors',
  labelNames: ['method', 'route', 'status_code', 'error_type'],
  registers: [register],
});

/**
 * CSV Import Jobs Counter
 * Tracks CSV import jobs by status
 */
export const csvImportJobsTotal = new Counter({
  name: 'courtflow_csv_import_jobs_total',
  help: 'Total number of CSV import jobs',
  labelNames: ['status'], // pending, processing, completed, failed
  registers: [register],
});

/**
 * CSV Import Duration Histogram
 * Tracks the duration of CSV import jobs
 */
export const csvImportDuration = new Histogram({
  name: 'courtflow_csv_import_duration_seconds',
  help: 'Duration of CSV import jobs in seconds',
  labelNames: ['status'],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800], // Import duration buckets in seconds
  registers: [register],
});

/**
 * CSV Import Records Counter
 * Tracks the number of records processed during CSV imports
 */
export const csvImportRecords = new Counter({
  name: 'courtflow_csv_import_records_total',
  help: 'Total number of records processed during CSV imports',
  labelNames: ['status'], // successful, failed
  registers: [register],
});

/**
 * CSV Import Batch Size Gauge
 * Tracks the current batch size being processed
 */
export const csvImportBatchSize = new Gauge({
  name: 'courtflow_csv_import_batch_size',
  help: 'Current CSV import batch size',
  registers: [register],
});

/**
 * CSV Import Row Processing Duration Histogram
 * Tracks the processing time per row/record
 */
export const csvImportRowProcessingDuration = new Histogram({
  name: 'courtflow_csv_import_row_processing_duration_seconds',
  help: 'Duration of processing per row/record in seconds',
  labelNames: ['status'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

/**
 * CSV Import Memory Usage Gauge
 * Tracks memory usage during processing
 */
export const csvImportMemoryUsage = new Gauge({
  name: 'courtflow_csv_import_memory_usage_bytes',
  help: 'Memory usage during CSV import processing in bytes',
  registers: [register],
});

/**
 * CSV Import Errors Counter
 * Tracks errors by type during CSV imports
 */
export const csvImportErrorsTotal = new Counter({
  name: 'courtflow_csv_import_errors_total',
  help: 'Total number of errors during CSV imports',
  labelNames: ['error_type'],
  registers: [register],
});

/**
 * CSV Import Throughput Gauge
 * Tracks records processed per second
 */
export const csvImportThroughput = new Gauge({
  name: 'courtflow_csv_import_throughput_records_per_second',
  help: 'Records processed per second during CSV imports',
  registers: [register],
});

/**
 * CSV Import Queue Wait Duration Histogram
 * Tracks time jobs wait in queue before processing
 */
export const csvImportQueueWaitDuration = new Histogram({
  name: 'courtflow_csv_import_queue_wait_duration_seconds',
  help: 'Duration jobs wait in queue before processing in seconds',
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300],
  registers: [register],
});

/**
 * CSV Import Batch Processing Duration Histogram
 * Tracks processing duration per batch
 */
export const csvImportBatchProcessingDuration = new Histogram({
  name: 'courtflow_csv_import_batch_processing_duration_seconds',
  help: 'Duration of processing per batch in seconds',
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300, 600],
  registers: [register],
});

/**
 * Database Connection Pool Gauge
 * Tracks active database connections
 */
export const dbConnectionsActive = new Gauge({
  name: 'courtflow_db_connections_active',
  help: 'Number of active database connections',
  registers: [register],
});

/**
 * Database Query Duration Histogram
 * Tracks database query execution time
 */
export const dbQueryDuration = new Histogram({
  name: 'courtflow_db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'model'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

/**
 * Redis Operations Counter
 * Tracks Redis operations by type
 */
export const redisOperationsTotal = new Counter({
  name: 'courtflow_redis_operations_total',
  help: 'Total number of Redis operations',
  labelNames: ['operation', 'status'], // get, set, del | success, error
  registers: [register],
});

/**
 * BullMQ Queue Size Gauge
 * Tracks the number of jobs in various BullMQ queues
 */
export const bullmqQueueSize = new Gauge({
  name: 'courtflow_bullmq_queue_size',
  help: 'Number of jobs in BullMQ queues',
  labelNames: ['queue', 'state'], // waiting, active, completed, failed, delayed
  registers: [register],
});

/**
 * BullMQ Job Processing Duration Histogram
 * Tracks job processing duration
 */
export const bullmqJobDuration = new Histogram({
  name: 'courtflow_bullmq_job_duration_seconds',
  help: 'Duration of BullMQ job processing in seconds',
  labelNames: ['queue', 'status'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300],
  registers: [register],
});

/**
 * WebSocket Connections Gauge
 * Tracks active WebSocket connections
 */
export const websocketConnectionsActive = new Gauge({
  name: 'courtflow_websocket_connections_active',
  help: 'Number of active WebSocket connections',
  registers: [register],
});

/**
 * WebSocket Messages Counter
 * Tracks WebSocket messages sent/received
 */
export const websocketMessagesTotal = new Counter({
  name: 'courtflow_websocket_messages_total',
  help: 'Total number of WebSocket messages',
  labelNames: ['direction', 'event_type'], // sent/received, event type
  registers: [register],
});

/**
 * Authentication Attempts Counter
 * Tracks authentication attempts by result
 */
export const authAttemptsTotal = new Counter({
  name: 'courtflow_auth_attempts_total',
  help: 'Total number of authentication attempts',
  labelNames: ['result', 'method'], // success/failed, login/refresh/logout
  registers: [register],
});

/**
 * API Rate Limit Hits Counter
 * Tracks rate limit hits by endpoint
 */
export const rateLimitHitsTotal = new Counter({
  name: 'courtflow_rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['endpoint', 'limit_type'], // general, upload, auth
  registers: [register],
});

// Export the registry for use in the metrics endpoint
export { register };
