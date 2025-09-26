import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { healthChecker, HealthChecker } from '../../utils/health-check';
import { logger } from '../../utils/logger';

// Mock logger to avoid console output during tests
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('HealthChecker', () => {
  let testHealthChecker: HealthChecker;

  beforeAll(() => {
    testHealthChecker = new HealthChecker();
  });

  describe('performHealthCheck', () => {
    it('should return comprehensive health check results', async () => {
      const result = await testHealthChecker.performHealthCheck();
      
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('uptime');
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('environment');
      expect(result).toHaveProperty('checks');
      expect(result).toHaveProperty('errors');
      
      expect(result.status).toMatch(/^(healthy|degraded|unhealthy)$/);
      expect(result.uptime).toBeTypeOf('number');
      expect(result.version).toBeTypeOf('string');
      expect(result.environment).toBeTypeOf('string');
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should include database health check', async () => {
      const result = await testHealthChecker.performHealthCheck();
      
      expect(result.checks).toHaveProperty('database');
      expect(result.checks.database).toHaveProperty('status');
      expect(result.checks.database).toHaveProperty('responseTime');
      expect(result.checks.database).toHaveProperty('details');
      
      expect(result.checks.database.status).toMatch(/^(healthy|unhealthy)$/);
      expect(result.checks.database.responseTime).toBeTypeOf('number');
    });

    it('should include Redis health check', async () => {
      const result = await testHealthChecker.performHealthCheck();
      
      expect(result.checks).toHaveProperty('redis');
      expect(result.checks.redis).toHaveProperty('status');
      expect(result.checks.redis).toHaveProperty('responseTime');
      expect(result.checks.redis).toHaveProperty('details');
      
      expect(result.checks.redis.status).toMatch(/^(healthy|unhealthy)$/);
      expect(result.checks.redis.responseTime).toBeTypeOf('number');
    });

    it('should include memory health check', async () => {
      const result = await testHealthChecker.performHealthCheck();
      
      expect(result.checks).toHaveProperty('memory');
      expect(result.checks.memory).toHaveProperty('status');
      expect(result.checks.memory).toHaveProperty('usage');
      
      expect(result.checks.memory.status).toMatch(/^(healthy|unhealthy)$/);
      expect(result.checks.memory.usage).toHaveProperty('used');
      expect(result.checks.memory.usage).toHaveProperty('total');
      expect(result.checks.memory.usage).toHaveProperty('percentage');
      
      expect(result.checks.memory.usage.used).toBeTypeOf('number');
      expect(result.checks.memory.usage.total).toBeTypeOf('number');
      expect(result.checks.memory.usage.percentage).toBeTypeOf('number');
    });

    it('should include disk health check', async () => {
      const result = await testHealthChecker.performHealthCheck();
      
      expect(result.checks).toHaveProperty('disk');
      expect(result.checks.disk).toHaveProperty('status');
      
      expect(result.checks.disk.status).toMatch(/^(healthy|unhealthy)$/);
    });

    it('should determine overall status correctly', async () => {
      const result = await testHealthChecker.performHealthCheck();
      
      // If database and Redis are healthy, overall should be healthy or degraded
      if (result.checks.database.status === 'healthy' && result.checks.redis.status === 'healthy') {
        expect(result.status).toMatch(/^(healthy|degraded)$/);
      }
      
      // If critical services are unhealthy, overall should be unhealthy
      if (result.checks.database.status === 'unhealthy' || result.checks.redis.status === 'unhealthy') {
        expect(result.status).toBe('unhealthy');
      }
    });

    it('should include errors when checks fail', async () => {
      const result = await testHealthChecker.performHealthCheck();
      
      // If there are unhealthy checks, there should be corresponding errors
      const unhealthyChecks = Object.entries(result.checks).filter(
        ([_, check]) => check.status === 'unhealthy'
      );
      
      if (unhealthyChecks.length > 0) {
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });
  });

  describe('performQuickHealthCheck', () => {
    it('should return quick health check results', async () => {
      const result = await testHealthChecker.performQuickHealthCheck();
      
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('responseTime');
      
      expect(result.status).toMatch(/^(healthy|unhealthy)$/);
      expect(result.responseTime).toBeTypeOf('number');
      expect(result.responseTime).toBeGreaterThan(0);
    });

    it('should be faster than comprehensive health check', async () => {
      const quickStart = Date.now();
      const quickResult = await testHealthChecker.performQuickHealthCheck();
      const quickTime = Date.now() - quickStart;
      
      const comprehensiveStart = Date.now();
      const comprehensiveResult = await testHealthChecker.performHealthCheck();
      const comprehensiveTime = Date.now() - comprehensiveStart;
      
      // Quick check should generally be faster
      expect(quickResult.responseTime).toBeLessThanOrEqual(comprehensiveTime);
    });
  });

  describe('utility methods', () => {
    it('should return uptime', () => {
      const uptime = testHealthChecker.getUptime();
      
      expect(uptime).toBeTypeOf('number');
      expect(uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return version', () => {
      const version = testHealthChecker.getVersion();
      
      expect(version).toBeTypeOf('string');
      expect(version.length).toBeGreaterThan(0);
    });

    it('should return environment', () => {
      const environment = testHealthChecker.getEnvironment();
      
      expect(environment).toBeTypeOf('string');
      expect(environment.length).toBeGreaterThan(0);
    });

    it('should track uptime correctly', async () => {
      const initialUptime = testHealthChecker.getUptime();
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const laterUptime = testHealthChecker.getUptime();
      
      expect(laterUptime).toBeGreaterThan(initialUptime);
    });
  });

  describe('singleton instance', () => {
    it('should provide a singleton health checker instance', () => {
      expect(healthChecker).toBeInstanceOf(HealthChecker);
    });

    it('should maintain state across calls', async () => {
      const uptime1 = healthChecker.getUptime();
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const uptime2 = healthChecker.getUptime();
      
      expect(uptime2).toBeGreaterThan(uptime1);
    });
  });

  describe('error handling', () => {
    it('should handle database connection errors gracefully', async () => {
      // This test assumes database might be unavailable in some test environments
      const result = await testHealthChecker.performHealthCheck();
      
      // Should not throw an error even if database is unavailable
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('checks');
      expect(result).toHaveProperty('errors');
    });

    it('should handle Redis connection errors gracefully', async () => {
      // This test assumes Redis might be unavailable in some test environments
      const result = await testHealthChecker.performHealthCheck();
      
      // Should not throw an error even if Redis is unavailable
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('checks');
      expect(result).toHaveProperty('errors');
    });

    it('should handle memory check errors gracefully', async () => {
      const result = await testHealthChecker.performHealthCheck();
      
      // Memory check should always work, but if it fails, it should be handled
      expect(result.checks.memory).toHaveProperty('status');
    });
  });
});