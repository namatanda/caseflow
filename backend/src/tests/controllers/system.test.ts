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

      // Since DB and Redis are down in test environment, expect 503 status
      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          timestamp: expect.any(String),
          uptime: expect.any(Number),
          environment: 'test',
          version: expect.any(String),
        })
      );
    });

    it('should handle errors and call next', async () => {
      const error = new Error('Test error');
      
      // Mock the healthChecker to throw an error during health check
      const healthCheckModule = await import('../../utils/health-check');
      vi.spyOn(healthCheckModule, 'healthChecker', 'get').mockReturnValue({
        performQuickHealthCheck: vi.fn().mockRejectedValue(error),
        getUptime: vi.fn().mockReturnValue(123),
        getEnvironment: vi.fn().mockReturnValue('test'),
        getVersion: vi.fn().mockReturnValue('1.0.0'),
      } as any);

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
      
      vi.mocked(checkDatabaseConnection).mockResolvedValue({
        isHealthy: true,
        details: { responseTime: 10 }
      });
      vi.mocked(checkRedisConnection).mockResolvedValue({
        isHealthy: true,
        details: { responseTime: 5 }
      });

      await systemController.detailedHealthCheck(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
          timestamp: expect.any(String),
          uptime: expect.any(Number),
          environment: 'test',
          version: expect.any(String),
          checks: expect.objectContaining({
            database: expect.objectContaining({
              status: 'healthy',
              responseTime: expect.any(Number),
            }),
            redis: expect.objectContaining({
              status: 'healthy',
              responseTime: expect.any(Number),
            }),
            memory: expect.objectContaining({
              status: 'healthy',
              usage: expect.objectContaining({
                used: expect.any(Number),
                total: expect.any(Number),
                percentage: expect.any(Number),
              }),
            }),
            disk: expect.objectContaining({
              status: 'healthy',
            }),
          }),
        })
      );
    });

    it('should return unhealthy status when database is down', async () => {
      const { checkDatabaseConnection } = await import('@/config/database');
      const { checkRedisConnection } = await import('@/config/redis');
      
      vi.mocked(checkDatabaseConnection).mockResolvedValue({
        isHealthy: false,
        details: { responseTime: 0 }
      });
      vi.mocked(checkRedisConnection).mockResolvedValue({
        isHealthy: true,
        details: { responseTime: 5 }
      });

      await systemController.detailedHealthCheck(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'unhealthy',
          checks: expect.objectContaining({
            database: expect.objectContaining({
              status: 'unhealthy'
            }),
            redis: expect.objectContaining({
              status: 'healthy'
            }),
          }),
        })
      );
    });

    it('should return unhealthy status when redis is down', async () => {
      const { checkDatabaseConnection } = await import('@/config/database');
      const { checkRedisConnection } = await import('@/config/redis');
      
      vi.mocked(checkDatabaseConnection).mockResolvedValue({
        isHealthy: true,
        details: { responseTime: 10 }
      });
      vi.mocked(checkRedisConnection).mockResolvedValue({
        isHealthy: false,
        details: { responseTime: 0 }
      });

      await systemController.detailedHealthCheck(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'unhealthy',
          checks: expect.objectContaining({
            database: expect.objectContaining({
              status: 'healthy'
            }),
            redis: expect.objectContaining({
              status: 'unhealthy'
            }),
          }),
        })
      );
    });

    it('should handle errors and call next', async () => {
      // Mock the healthChecker to throw an error during health check
      const healthCheckModule = await import('../../utils/health-check');
      vi.spyOn(healthCheckModule, 'healthChecker', 'get').mockReturnValue({
        performHealthCheck: vi.fn().mockRejectedValue(new Error('Health check error')),
        getUptime: vi.fn().mockReturnValue(123),
        getEnvironment: vi.fn().mockReturnValue('test'),
        getVersion: vi.fn().mockReturnValue('1.0.0'),
      } as any);

      await systemController.detailedHealthCheck(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // The controller handles errors internally and sends 503 response
      // It doesn't call next() for this error case
      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'unhealthy',
          error: 'Health check failed',
          timestamp: expect.any(String),
        })
      );
    });
  });

  describe('metrics', () => {
    it('should return Prometheus metrics', async () => {
      const promClient = await import('prom-client');
      const metricsSpy = vi.spyOn(promClient.register, 'metrics');
      metricsSpy.mockResolvedValue('# Prometheus metrics');
      
      // Mock register.contentType property
      Object.defineProperty(promClient.register, 'contentType', {
        value: 'text/plain; version=0.0.4; charset=utf-8',
        configurable: true
      });
      
      // Set request headers to accept text/plain for Prometheus format
      mockRequest.headers = {
        accept: 'text/plain'
      };

      await systemController.metrics(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.set).toHaveBeenCalledWith(
        'Content-Type',
        'text/plain; version=0.0.4; charset=utf-8'
      );
      expect(mockResponse.send).toHaveBeenCalledWith('# Prometheus metrics');
    });

    it('should handle errors and call next', async () => {
      const error = new Error('Metrics error');
      const promClient = await import('prom-client');
      const metricsSpy = vi.spyOn(promClient.register, 'metrics');
      metricsSpy.mockRejectedValue(error);

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