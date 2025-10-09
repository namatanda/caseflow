import { Queue } from 'bullmq';
import { config } from './environment';
import { logger } from '@/utils/logger';

// Queue names
export const QUEUE_NAMES = {
  CSV_IMPORT: 'csv-import',
} as const;

// BullMQ connection configuration - must be a plain object, not a Redis instance
const bullMQConnection = {
  host: config.redis.url.includes('localhost') ? 'localhost' : config.redis.url.replace('redis://', '').split(':')[0],
  port: config.redis.url.includes(':') ? parseInt(config.redis.url.split(':').pop() || '6379') : 6379,
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
  enableOfflineQueue: true,
};

// Queue configurations
const queueConfigs = {
  [QUEUE_NAMES.CSV_IMPORT]: {
    defaultJobOptions: {
      removeOnComplete: 50, // Keep last 50 completed jobs
      removeOnFail: 100, // Keep last 100 failed jobs
      attempts: 3,
      backoff: {
        type: 'exponential' as const,
        delay: 2000,
      },
    },
  },
};

// Create queues with connection config
export const csvImportQueue = new Queue(QUEUE_NAMES.CSV_IMPORT, {
  connection: bullMQConnection,
  ...queueConfigs[QUEUE_NAMES.CSV_IMPORT],
});

// Note: QueueScheduler is not available in BullMQ v5. Using built-in delayed job handling

// Queue health check
export async function checkQueueHealth(): Promise<{
  isHealthy: boolean;
  details: {
    csvImportQueue: boolean;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
}> {
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      csvImportQueue.getWaiting(),
      csvImportQueue.getActive(),
      csvImportQueue.getCompleted(),
      csvImportQueue.getFailed(),
      csvImportQueue.getDelayed(),
    ]);

    const isHealthy = true; // Queues are always "healthy" if Redis is connected

    return {
      isHealthy,
      details: {
        csvImportQueue: true,
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
      },
    };
  } catch (error) {
    logger.error('Queue health check failed:', error);
    return {
      isHealthy: false,
      details: {
        csvImportQueue: false,
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      },
    };
  }
}

// Graceful shutdown
export async function closeQueues(): Promise<void> {
  try {
    await csvImportQueue.close();
    logger.info('Queues closed successfully');
  } catch (error) {
    logger.error('Error closing queues:', error);
  }
}

// Export all queues for easy access
export const queues = {
  [QUEUE_NAMES.CSV_IMPORT]: csvImportQueue,
} as const;