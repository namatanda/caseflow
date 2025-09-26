import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { systemController } from '@/controllers/system';

// Mock dependencies
vi.mock('@/config/database', () => ({
  checkDatabaseConnection: vi.fn(),
}));

vi.mock('@/config/redis', () => ({
  checkRedisConnection: vi.fn(),
}));

vi.mock('@/config/environment', () => ({
  config: {
    env: 'test',
    port: 3001,
    database: {
      url: 'postgresql://test:test@localhost:5432/courtflow_test',
    },
    redis: {
      url: 'redis://localhost:6379/1',
    },
    jwt: {
      secret: 'test-jwt-secret-key-that-is-long-enough-for-testing-purposes',
      expiresIn: '1h',
      refreshExpiresIn: '7d',
    },
    cors: {
      allowedOrigins: ['http://localhost:3000', 'http://localhost:9002'],
    },
    rateLimit: {
      maxRequests: 100,
    },
    logging: {
      level: 'error',
    },
    upload: {
      maxFileSize: 10485760,
    },
    api: {
      version: 'v1',
    },
  },
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('prom-client', () => ({
  register: {
    metrics: vi.fn().mockResolvedValue('# Prometheus metrics'),
    contentType: 'text/plain; version=0.0.4; charset=utf-8',
  },
}));

describe('System Controller', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
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

  describe('healthCheck', () => {
    it('should return basic health status', async () => {
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
          environment: 'test',
          version: expect.any(String),
        })
      );
    });

    it('should handle errors and call next', async () => {
      const error = new Error('Test error');
      vi.spyOn(process, 'uptime').mockImplementation(() => {
        throw error;
      });

      await systemController.healthCheck(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('detailedHealthCheck', () => {

    it('should return detailed health status when all services are healthy', async () => {
      const { checkDatabaseConnection } = await import('@/config/database');
      const { checkRedisConnection } = await import('@/config/redis');
      
      vi.mocked(checkDatabaseConnection).mockResolvedValue(true);
      vi.mocked(checkRedisConnection).mockResolvedValue(true);

      await systemController.detailedHealthCheck(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Check if next was called with an error
      if (mockNext.mock.calls.length > 0) {
        console.log('Next was called with:', mockNext.mock.calls[0][0]);
      }

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          healthy: true,
          timestamp: expect.any(String),
          uptime: expect.any(Number),
          environment: 'test',
          version: expect.any(String),
          checks: {
            database: true,
            redis: true,
            memory: true,
            disk: true,
          },
          system: expect.objectContaining({
            memory: expect.objectContaining({
              rss: expect.any(Number),
              heapTotal: expect.any(Number),
              heapUsed: expect.any(Number),
              external: expect.any(Number),
            }),
            nodeVersion: expect.any(String),
            platform: expect.any(String),
            arch: expect.any(String),
          }),
        })
      );
    });

    it('should return unhealthy status when database is down', async () => {
      const { checkDatabaseConnection } = await import('@/config/database');
      const { checkRedisConnection } = await import('@/config/redis');
      
      vi.mocked(checkDatabaseConnection).mockResolvedValue(false);
      vi.mocked(checkRedisConnection).mockResolvedValue(true);

      await systemController.detailedHealthCheck(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Check if next was called with an error
      if (mockNext.mock.calls.length > 0) {
        console.log('Next was called with:', mockNext.mock.calls[0][0]);
      }

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          healthy: false,
          checks: expect.objectContaining({
            database: false,
            redis: true,
          }),
        })
      );
    });

    it('should return unhealthy status when redis is down', async () => {
      const { checkDatabaseConnection } = await import('@/config/database');
      const { checkRedisConnection } = await import('@/config/redis');
      
      vi.mocked(checkDatabaseConnection).mockResolvedValue(true);
      vi.mocked(checkRedisConnection).mockResolvedValue(false);

      await systemController.detailedHealthCheck(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Check if next was called with an error
      if (mockNext.mock.calls.length > 0) {
        console.log('Next was called with:', mockNext.mock.calls[0][0]);
      }

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          healthy: false,
          checks: expect.objectContaining({
            database: true,
            redis: false,
          }),
        })
      );
    });

    it('should handle errors and call next', async () => {
      const error = new Error('Test error');
      
      // Mock res.status to throw an error
      mockResponse.status = vi.fn().mockImplementation(() => {
        throw error;
      });

      await systemController.detailedHealthCheck(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('metrics', () => {
    it('should return Prometheus metrics', async () => {
      const { register } = await import('prom-client');
      vi.mocked(register.metrics).mockResolvedValue('# Prometheus metrics');

      await systemController.metrics(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.set).toHaveBeenCalledWith(
        'Content-Type',
        'text/plain; version=0.0.4; charset=utf-8'
      );
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.send).toHaveBeenCalledWith('# Prometheus metrics');
    });

    it('should handle errors and call next', async () => {
      const error = new Error('Metrics error');
      const { register } = await import('prom-client');
      
      vi.mocked(register.metrics).mockRejectedValue(error);

      await systemController.metrics(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('version', () => {
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
          environment: 'test',
          buildDate: expect.any(String),
        })
      );
    });

    it('should handle errors and call next', async () => {
      const error = new Error('Version error');
      vi.spyOn(process, 'version', 'get').mockImplementation(() => {
        throw error;
      });

      await systemController.version(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});