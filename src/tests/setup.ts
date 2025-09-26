import { beforeAll, afterAll } from 'vitest';

// Set test environment variables immediately (before any imports)
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/courtflow_test';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.JWT_SECRET = 'test-jwt-secret-key-that-is-long-enough-for-testing-purposes';
process.env.JWT_EXPIRES_IN = '1h';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000,http://localhost:9002';
process.env.RATE_LIMIT_MAX_REQUESTS = '100';
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests
process.env.MAX_FILE_SIZE = '10485760';
process.env.API_VERSION = 'v1';

// Test setup configuration
beforeAll(() => {
  // Additional setup if needed
});

afterAll(() => {
  // Cleanup after tests
});