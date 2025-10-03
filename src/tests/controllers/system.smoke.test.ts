import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { systemController } from '../../controllers/system';

// Mock dependencies to simulate real service checks
vi.mock('../../config/database', () => ({
  checkDatabaseConnection: vi.fn(),
}));

vi.mock('../../config/redis', () => ({
  checkRedisConnection: vi.fn(),
}));

describe('System Health Endpoints Smoke Test', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = {};

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    mockNext = vi.fn();
  });

  describe('healthCheck endpoint (/api/v1/system/health)', () => {
    it('should return health status with database and Redis information', async () => {
      // Mock healthy database and Redis connections
      const { checkDatabaseConnection } = await import('../../config/database');
      const { checkRedisConnection } = await import('../../config/redis');

      vi.mocked(checkDatabaseConnection).mockResolvedValue({
        isHealthy: true,
        details: { responseTime: 10, canConnect: true, canQuery: true }
      });
      vi.mocked(checkRedisConnection).mockResolvedValue({
        isHealthy: true,
        details: { responseTime: 5, mainClient: true, sessionClient: true, cacheClient: true }
      });

      await systemController.healthCheck(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ok',
          timestamp: expect.any(String),
          uptime: expect.any(Number),
          environment: expect.any(String),
          version: expect.any(String),
          responseTime: expect.any(Number),
        })
      );

      // Verify timestamp is a valid ISO string
      const callArgs = (mockResponse.json as any).mock.calls[0][0];
      expect(() => new Date(callArgs.timestamp)).not.toThrow();
    });

    it('should return error status when database is unavailable', async () => {
      // Mock unhealthy database connection
      const { checkDatabaseConnection } = await import('../../config/database');
      const { checkRedisConnection } = await import('../../config/redis');

      vi.mocked(checkDatabaseConnection).mockResolvedValue({
        isHealthy: false,
        details: { responseTime: 0, canConnect: false, canQuery: false }
      });
      vi.mocked(checkRedisConnection).mockResolvedValue({
        isHealthy: true,
        details: { responseTime: 5, mainClient: true, sessionClient: true, cacheClient: true }
      });

      await systemController.healthCheck(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          timestamp: expect.any(String),
          uptime: expect.any(Number),
          environment: expect.any(String),
          version: expect.any(String),
          responseTime: expect.any(Number),
        })
      );
    });

    it('should return error status when Redis is unavailable', async () => {
      // Mock unhealthy Redis connection
      const { checkDatabaseConnection } = await import('../../config/database');
      const { checkRedisConnection } = await import('../../config/redis');

      vi.mocked(checkDatabaseConnection).mockResolvedValue({
        isHealthy: true,
        details: { responseTime: 10, canConnect: true, canQuery: true }
      });
      vi.mocked(checkRedisConnection).mockResolvedValue({
        isHealthy: false,
        details: { responseTime: 0, mainClient: false, sessionClient: false, cacheClient: false, error: 'Connection failed' }
      });

      await systemController.healthCheck(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          timestamp: expect.any(String),
          uptime: expect.any(Number),
          environment: expect.any(String),
          version: expect.any(String),
          responseTime: expect.any(Number),
        })
      );
    });
  });

  describe('detailedHealthCheck endpoint (/api/v1/system/health/detailed)', () => {
    it('should return detailed health status with database, Redis, memory, and disk checks', async () => {
      // Mock healthy services
      const { checkDatabaseConnection } = await import('../../config/database');
      const { checkRedisConnection } = await import('../../config/redis');

      vi.mocked(checkDatabaseConnection).mockResolvedValue({
        isHealthy: true,
        details: { responseTime: 10, canConnect: true, canQuery: true }
      });
      vi.mocked(checkRedisConnection).mockResolvedValue({
        isHealthy: true,
        details: { responseTime: 5, mainClient: true, sessionClient: true, cacheClient: true }
      });

      await systemController.detailedHealthCheck(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
          timestamp: expect.any(String),
          uptime: expect.any(Number),
          version: expect.any(String),
          environment: expect.any(String),
          checks: {
            database: {
              status: 'healthy',
              responseTime: expect.any(Number),
              details: expect.any(Object),
            },
            redis: {
              status: 'healthy',
              responseTime: expect.any(Number),
              details: expect.any(Object),
            },
            memory: {
              status: 'healthy',
              usage: {
                used: expect.any(Number),
                total: expect.any(Number),
                percentage: expect.any(Number),
              },
            },
            disk: {
              status: 'healthy',
            },
          },
          errors: expect.any(Array),
        })
      );

      // Verify database details structure
      const callArgs = (mockResponse.json as any).mock.calls[0][0];
      expect(callArgs.checks.database.details).toMatchObject({
        responseTime: expect.any(Number),
        canConnect: expect.any(Boolean),
        canQuery: expect.any(Boolean),
      });

      // Verify Redis details structure
      expect(callArgs.checks.redis.details).toMatchObject({
        responseTime: expect.any(Number),
        mainClient: expect.any(Boolean),
        sessionClient: expect.any(Boolean),
        cacheClient: expect.any(Boolean),
      });

      // Verify memory usage is reasonable
      expect(callArgs.checks.memory.usage.percentage).toBeGreaterThanOrEqual(0);
      expect(callArgs.checks.memory.usage.percentage).toBeLessThanOrEqual(100);

      // Verify errors array exists and is empty for healthy services
      expect(Array.isArray(callArgs.errors)).toBe(true);
    });

    it('should report unhealthy status when database is down', async () => {
      const { checkDatabaseConnection } = await import('../../config/database');
      const { checkRedisConnection } = await import('../../config/redis');

      vi.mocked(checkDatabaseConnection).mockResolvedValue({
        isHealthy: false,
        details: { responseTime: 0, canConnect: false, canQuery: false, error: 'Connection failed' }
      });
      vi.mocked(checkRedisConnection).mockResolvedValue({
        isHealthy: true,
        details: { responseTime: 5, mainClient: true, sessionClient: true, cacheClient: true }
      });

      await systemController.detailedHealthCheck(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(503);
      const callArgs = (mockResponse.json as any).mock.calls[0][0];
      expect(callArgs.status).toBe('unhealthy');
      expect(callArgs.checks.database.status).toBe('unhealthy');
      expect(callArgs.checks.redis.status).toBe('healthy');
      expect(callArgs.errors.length).toBeGreaterThan(0);
    });

    it('should report unhealthy status when Redis is down', async () => {
      const { checkDatabaseConnection } = await import('../../config/database');
      const { checkRedisConnection } = await import('../../config/redis');

      vi.mocked(checkDatabaseConnection).mockResolvedValue({
        isHealthy: true,
        details: { responseTime: 10, canConnect: true, canQuery: true }
      });
      vi.mocked(checkRedisConnection).mockResolvedValue({
        isHealthy: false,
        details: { responseTime: 0, mainClient: false, sessionClient: false, cacheClient: false, error: 'Connection failed' }
      });

      await systemController.detailedHealthCheck(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(503);
      const callArgs = (mockResponse.json as any).mock.calls[0][0];
      expect(callArgs.status).toBe('unhealthy');
      expect(callArgs.checks.database.status).toBe('healthy');
      expect(callArgs.checks.redis.status).toBe('unhealthy');
      expect(callArgs.errors.length).toBeGreaterThan(0);
    });

  });

  describe('version endpoint (/api/v1/system/version)', () => {
    it('should return version information', async () => {
      await systemController.version(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'CourtFlow Backend API',
          version: expect.any(String),
          apiVersion: 'v1',
          nodeVersion: expect.any(String),
          environment: expect.any(String),
          uptime: expect.any(Number),
          buildDate: expect.any(String),
          platform: expect.any(String),
          arch: expect.any(String),
        })
      );
    });
  });
});