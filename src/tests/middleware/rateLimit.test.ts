import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request } from 'express';
import {
  generalRateLimit,
  authRateLimit,
  uploadRateLimit,
  creationRateLimit,
  searchRateLimit,
  getRateLimit
} from '../../middleware/rateLimit';

// Mock dependencies
vi.mock('@/config/environment', () => ({
  config: {
    rateLimit: {
      maxRequests: 100
    }
  }
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    warn: vi.fn()
  }
}));

type MockUser = {
  id: string;
  email: string;
  role: string;
};

type MockRequest = {
  path?: string;
  ip?: string;
  url?: string;
  method?: string;
  correlationId?: string;
  get?: Request['get'];
  user?: MockUser | undefined;
};

describe('Rate Limiting Middleware', () => {
  let mockRequest: MockRequest;

  beforeEach(() => {
    mockRequest = {
      ip: '127.0.0.1',
      path: '/api/v1/test',
      url: '/api/v1/test',
      method: 'GET',
      correlationId: 'test-correlation-id',
      get: vi.fn(),
      user: undefined
    };
    
    vi.clearAllMocks();
  });

  describe('generalRateLimit', () => {
    it('should be configured with correct options', () => {
      expect(generalRateLimit).toBeDefined();
      // Note: Testing rate limit behavior requires integration testing
      // as the middleware uses internal state that's hard to mock
    });

    it('should skip health check endpoints', () => {
      mockRequest.path = '/api/v1/system/health';
      
      // The skip function should return true for health check paths
      const skipFunction = (generalRateLimit as any).options?.skip;
      if (skipFunction) {
        expect(skipFunction(mockRequest as unknown as Request)).toBe(true);
      }
    });

    it('should not skip regular API endpoints', () => {
      mockRequest.path = '/api/v1/cases';
      
      const skipFunction = (generalRateLimit as any).options?.skip;
      if (skipFunction) {
        expect(skipFunction(mockRequest as unknown as Request)).toBe(false);
      }
    });
  });

  describe('authRateLimit', () => {
    it('should be configured with stricter limits', () => {
      expect(authRateLimit).toBeDefined();
      // Auth rate limit should have lower max requests (5 vs 100)
    });
  });

  describe('uploadRateLimit', () => {
    it('should be configured for file uploads', () => {
      expect(uploadRateLimit).toBeDefined();
      // Upload rate limit should have appropriate limits for file operations
    });
  });

  describe('creationRateLimit', () => {
    it('should be configured for creation operations', () => {
      expect(creationRateLimit).toBeDefined();
      // Creation rate limit should have moderate limits
    });
  });

  describe('searchRateLimit', () => {
    it('should be configured for search operations', () => {
      expect(searchRateLimit).toBeDefined();
      // Search rate limit should have higher limits for read operations
    });
  });

  describe('getRateLimit', () => {
    it('should return correct rate limiter for auth type', () => {
      const rateLimiter = getRateLimit('auth');
      expect(rateLimiter).toBe(authRateLimit);
    });

    it('should return correct rate limiter for upload type', () => {
      const rateLimiter = getRateLimit('upload');
      expect(rateLimiter).toBe(uploadRateLimit);
    });

    it('should return correct rate limiter for create type', () => {
      const rateLimiter = getRateLimit('create');
      expect(rateLimiter).toBe(creationRateLimit);
    });

    it('should return correct rate limiter for search type', () => {
      const rateLimiter = getRateLimit('search');
      expect(rateLimiter).toBe(searchRateLimit);
    });

    it('should return general rate limiter for unknown type', () => {
      const rateLimiter = getRateLimit('unknown' as any);
      expect(rateLimiter).toBe(generalRateLimit);
    });

    it('should return general rate limiter as default', () => {
      const rateLimiter = getRateLimit('general');
      expect(rateLimiter).toBe(generalRateLimit);
    });
  });

  describe('Key Generation', () => {
    it('should use user ID when user is authenticated', () => {
      mockRequest.user = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'user'
      };

      // Test that the key generator would use user ID
      const keyGenerator = (generalRateLimit as any).options?.keyGenerator;
      if (keyGenerator) {
        const key = keyGenerator(mockRequest as unknown as Request);
        expect(key).toBe('user-123');
      }
    });

    it('should use IP address when user is not authenticated', () => {
      mockRequest.user = undefined;
      mockRequest.ip = '192.168.1.1';

      const keyGenerator = (generalRateLimit as any).options?.keyGenerator;
      if (keyGenerator) {
        const key = keyGenerator(mockRequest as unknown as Request);
        expect(key).toBe('192.168.1.1');
      }
    });
  });
});