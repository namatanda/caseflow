import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../config/environment';
import type { Config } from '../../config/environment';

describe('Environment Configuration', () => {
  const originalEnv = { ...process.env };
  let envConfig: Config;

  beforeEach(() => {
    // Ensure test environment variables are set
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3001';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/courtflow_test';
    process.env.REDIS_URL = 'redis://localhost:6379/1';
    process.env.JWT_SECRET = 'test-jwt-secret-key-that-is-long-enough-for-testing-purposes';
    process.env.JWT_EXPIRES_IN = '1h';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.ALLOWED_ORIGINS = 'http://localhost:3000,http://localhost:9002';
    process.env.RATE_LIMIT_MAX_REQUESTS = '100';
    process.env.LOG_LEVEL = 'error';
    process.env.MAX_FILE_SIZE = '10485760';
    process.env.API_VERSION = 'v1';

    envConfig = loadConfig(true);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should load configuration from environment variables', () => {
    expect(envConfig.env).toBe('test');
    expect(envConfig.port).toBe(3001);
    expect(envConfig.database.url).toBe('postgresql://test:test@localhost:5432/courtflow_test');
    expect(envConfig.redis.url).toBe('redis://localhost:6379/1');
    expect(envConfig.jwt.secret).toBe('test-jwt-secret-key-that-is-long-enough-for-testing-purposes');
  });

  it('should have proper default values', () => {
    expect(envConfig.jwt.expiresIn).toBe('1h');
    expect(envConfig.jwt.refreshExpiresIn).toBe('7d');
    expect(envConfig.rateLimit.maxRequests).toBe(100);
    expect(envConfig.logging.level).toBe('error');
    expect(envConfig.api.version).toBe('v1');
  });

  it('should have CORS configuration', () => {
    expect(envConfig.cors.allowedOrigins).toBeInstanceOf(Array);
    expect(envConfig.cors.allowedOrigins).toContain('http://localhost:3000');
  });

  it('should validate required environment variables', () => {
    expect(envConfig.database.url).toBeDefined();
    expect(envConfig.redis.url).toBeDefined();
    expect(envConfig.jwt.secret).toBeDefined();
    expect(envConfig.jwt.secret.length).toBeGreaterThanOrEqual(32);
  });
});