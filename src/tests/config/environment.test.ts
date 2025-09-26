import { describe, it, expect, beforeEach } from 'vitest';
import { config } from '@/config/environment';

describe('Environment Configuration', () => {
  beforeEach(() => {
    // Ensure test environment variables are set
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long-for-testing';
  });

  it('should load configuration from environment variables', () => {
    expect(config.env).toBe('test');
    expect(config.port).toBe(3001);
    expect(config.database.url).toBe('postgresql://test:test@localhost:5432/courtflow_test');
    expect(config.redis.url).toBe('redis://localhost:6379/1');
    expect(config.jwt.secret).toBe('test-jwt-secret-key-that-is-long-enough-for-testing-purposes');
  });

  it('should have proper default values', () => {
    expect(config.jwt.expiresIn).toBe('1h');
    expect(config.jwt.refreshExpiresIn).toBe('7d');
    expect(config.rateLimit.maxRequests).toBe(100);
    expect(config.logging.level).toBe('error'); // Set in test setup
    expect(config.api.version).toBe('v1');
  });

  it('should have CORS configuration', () => {
    expect(config.cors.allowedOrigins).toBeInstanceOf(Array);
    expect(config.cors.allowedOrigins).toContain('http://localhost:3000');
  });

  it('should validate required environment variables', () => {
    expect(config.database.url).toBeDefined();
    expect(config.redis.url).toBeDefined();
    expect(config.jwt.secret).toBeDefined();
    expect(config.jwt.secret.length).toBeGreaterThanOrEqual(32);
  });
});