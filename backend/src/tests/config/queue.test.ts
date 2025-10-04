import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
let mockQueueInstance;

vi.mock('bullmq', () => {
  const Queue = vi.fn();
  Queue.mockImplementation(() => {
    if (!mockQueueInstance) {
      mockQueueInstance = {
        getWaiting: vi.fn(),
        getActive: vi.fn(),
        getCompleted: vi.fn(),
        getFailed: vi.fn(),
        getDelayed: vi.fn(),
        close: vi.fn(),
      };
    }
    return mockQueueInstance;
  });
  return { Queue };
});

vi.mock('../../config/redis', () => ({
  redis: { host: 'localhost', port: 6379 },
}));

vi.mock('../../config/environment', () => ({
  config: { redis: { url: 'redis://localhost:6379' } },
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { Queue } from 'bullmq';
import { QUEUE_NAMES, csvImportQueue, checkQueueHealth, closeQueues, queues } from '../../config/queue';
import { logger } from '../../utils/logger';

describe('Queue Configuration', () => {
  const mockQueue = mockQueueInstance; // Will be set when Queue is called

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Queue Names', () => {
    it('should export correct queue names', () => {
      expect(QUEUE_NAMES.CSV_IMPORT).toBe('csv-import');
    });
  });

  describe('Queue Creation', () => {

    it('should export the created queue', () => {
      expect(csvImportQueue).toBe(mockQueue);
    });

    it('should include queue in queues object', () => {
      expect(queues[QUEUE_NAMES.CSV_IMPORT]).toBe(mockQueue);
    });
  });

  describe('checkQueueHealth', () => {
    it('should return healthy status when all queue operations succeed', async () => {
      const mockJobs = [{ id: '1' }, { id: '2' }];

      mockQueue.getWaiting.mockResolvedValue(mockJobs);
      mockQueue.getActive.mockResolvedValue([mockJobs[0]]);
      mockQueue.getCompleted.mockResolvedValue([mockJobs[1]]);
      mockQueue.getFailed.mockResolvedValue([]);
      mockQueue.getDelayed.mockResolvedValue([]);

      const result = await checkQueueHealth();

      expect(result.isHealthy).toBe(true);
      expect(result.details).toEqual({
        csvImportQueue: true,
        waiting: 2,
        active: 1,
        completed: 1,
        failed: 0,
        delayed: 0,
      });

      expect(mockQueue.getWaiting).toHaveBeenCalled();
      expect(mockQueue.getActive).toHaveBeenCalled();
      expect(mockQueue.getCompleted).toHaveBeenCalled();
      expect(mockQueue.getFailed).toHaveBeenCalled();
      expect(mockQueue.getDelayed).toHaveBeenCalled();
    });

    it('should return unhealthy status when queue operations fail', async () => {
      const error = new Error('Redis connection failed');
      mockQueue.getWaiting.mockRejectedValue(error);

      const result = await checkQueueHealth();

      expect(result.isHealthy).toBe(false);
      expect(result.details).toEqual({
        csvImportQueue: false,
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      });

      expect(logger.error).toHaveBeenCalledWith('Queue health check failed:', error);
    });

    it('should handle partial failures gracefully', async () => {
      mockQueue.getWaiting.mockResolvedValue([]);
      mockQueue.getActive.mockRejectedValue(new Error('Active jobs error'));
      mockQueue.getCompleted.mockResolvedValue([]);
      mockQueue.getFailed.mockResolvedValue([]);
      mockQueue.getDelayed.mockResolvedValue([]);

      const result = await checkQueueHealth();

      expect(result.isHealthy).toBe(false);
      expect(result.details.csvImportQueue).toBe(false);
      expect(logger.error).toHaveBeenCalledWith('Queue health check failed:', expect.any(Error));
    });

    it('should return correct job counts', async () => {
      const waitingJobs = [{ id: '1' }, { id: '2' }, { id: '3' }];
      const activeJobs = [{ id: '4' }];
      const completedJobs = [{ id: '5' }, { id: '6' }];
      const failedJobs = [{ id: '7' }];
      const delayedJobs = [{ id: '8' }, { id: '9' }];

      mockQueue.getWaiting.mockResolvedValue(waitingJobs);
      mockQueue.getActive.mockResolvedValue(activeJobs);
      mockQueue.getCompleted.mockResolvedValue(completedJobs);
      mockQueue.getFailed.mockResolvedValue(failedJobs);
      mockQueue.getDelayed.mockResolvedValue(delayedJobs);

      const result = await checkQueueHealth();

      expect(result.details.waiting).toBe(3);
      expect(result.details.active).toBe(1);
      expect(result.details.completed).toBe(2);
      expect(result.details.failed).toBe(1);
      expect(result.details.delayed).toBe(2);
    });
  });

  describe('closeQueues', () => {
    it('should close all queues successfully', async () => {
      mockQueue.close.mockResolvedValue(undefined);

      await closeQueues();

      expect(mockQueue.close).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Queues closed successfully');
    });

    it('should handle close errors gracefully', async () => {
      const error = new Error('Close failed');
      mockQueue.close.mockRejectedValue(error);

      await closeQueues();

      expect(mockQueue.close).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith('Error closing queues:', error);
    });
  });
});