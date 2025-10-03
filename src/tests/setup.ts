import { beforeAll, afterAll, vi } from 'vitest';

// Mock ioredis for all tests
vi.mock('ioredis', () => {
  const globalStore = new Map<string, string>();
  const globalExpirations = new Map<string, number>();

  const MockRedis = vi.fn().mockImplementation((_url?: string, options?: any) => {
    const keyPrefix = options?.keyPrefix || '';
    const store = globalStore;
    const expirations = globalExpirations;

    // Clean expired keys
    const cleanExpired = () => {
      const now = Date.now();
      for (const [key, expiry] of expirations) {
        if (now > expiry) {
          store.delete(key);
          expirations.delete(key);
        }
      }
    };

    const prefixedKey = (key: string) => keyPrefix + key;

    return {
      ping: vi.fn().mockImplementation(async () => {
        // Simulate some delay
        await new Promise(resolve => setTimeout(resolve, 1));
        return 'PONG';
      }),
      setex: vi.fn().mockImplementation(async (key: string, ttl: number, value: string) => {
        const fullKey = prefixedKey(key);
        store.set(fullKey, value);
        expirations.set(fullKey, Date.now() + ttl * 1000);
        return 'OK';
      }),
      get: vi.fn().mockImplementation(async (key: string) => {
        cleanExpired();
        return store.get(prefixedKey(key)) || null;
      }),
      del: vi.fn().mockImplementation(async (...keys: string[]) => {
        let deleted = 0;
        for (const key of keys) {
          const fullKey = prefixedKey(key);
          if (store.has(fullKey)) {
            store.delete(fullKey);
            expirations.delete(fullKey);
            deleted++;
          }
        }
        return deleted;
      }),
      exists: vi.fn().mockImplementation(async (key: string) => {
        cleanExpired();
        return store.has(prefixedKey(key)) ? 1 : 0;
      }),
      keys: vi.fn().mockImplementation(async (pattern: string) => {
        cleanExpired();
        const fullPattern = keyPrefix + pattern;
        const regex = new RegExp(fullPattern.replace('*', '.*'));
        return Array.from(store.keys()).filter(key => regex.test(key));
      }),
      incrby: vi.fn().mockImplementation(async (key: string, by: number) => {
        cleanExpired();
        const fullKey = prefixedKey(key);
        const current = parseInt(store.get(fullKey) || '0', 10);
        const newValue = current + by;
        store.set(fullKey, newValue.toString());
        return newValue;
      }),
      expire: vi.fn().mockImplementation(async (key: string, ttl: number) => {
        const fullKey = prefixedKey(key);
        if (store.has(fullKey)) {
          expirations.set(fullKey, Date.now() + ttl * 1000);
          return 1;
        }
        return 0;
      }),
      ttl: vi.fn().mockImplementation(async (key: string) => {
        const fullKey = prefixedKey(key);
        if (!store.has(fullKey)) return -2;
        const expiry = expirations.get(fullKey);
        if (!expiry) return -1;
        const remaining = Math.ceil((expiry - Date.now()) / 1000);
        return remaining > 0 ? remaining : -1;
      }),
      mget: vi.fn().mockImplementation(async (...keys: string[]) => {
        cleanExpired();
        return keys.map(key => store.get(prefixedKey(key)) || null);
      }),
      mset: vi.fn().mockImplementation(async (...keyValuePairs: string[]) => {
        for (let i = 0; i < keyValuePairs.length; i += 2) {
          const key = keyValuePairs[i];
          const value = keyValuePairs[i + 1];
          if (key && value) {
            store.set(prefixedKey(key), value);
          }
        }
        return 'OK';
      }),
      pipeline: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
      quit: vi.fn().mockResolvedValue('OK'),
      flushdb: vi.fn().mockImplementation(async () => {
        // Only clear keys with this prefix
        for (const key of store.keys()) {
          if (key.startsWith(keyPrefix)) {
            store.delete(key);
            expirations.delete(key);
          }
        }
        return 'OK';
      }),
      on: vi.fn(),
      connect: vi.fn(),
      ready: vi.fn(),
      error: vi.fn(),
      close: vi.fn(),
      reconnecting: vi.fn(),
    };
  });

  return { default: MockRedis };
});

// Set test environment variables immediately (before any imports)
process.env['NODE_ENV'] = 'test';
process.env['PORT'] = '3001';
// For testing, we'll skip database tests that require real DB connection
// and focus on fixing other test issues first
process.env['DATABASE_URL'] = 'postgresql://courtflow:password@localhost:5432/courtflow_db';
process.env['REDIS_URL'] = 'redis://localhost:6379/1';
process.env['JWT_SECRET'] = 'test-jwt-secret-key-that-is-long-enough-for-testing-purposes';
process.env['JWT_EXPIRES_IN'] = '1h';
process.env['JWT_REFRESH_EXPIRES_IN'] = '7d';
process.env['ALLOWED_ORIGINS'] = 'http://localhost:3000,http://localhost:9002';
process.env['RATE_LIMIT_MAX_REQUESTS'] = '100';
process.env['LOG_LEVEL'] = 'error'; // Reduce log noise in tests
process.env['MAX_FILE_SIZE'] = '10485760';
process.env['API_VERSION'] = 'v1';

// Test setup configuration
beforeAll(() => {
  // Additional setup if needed
});

afterAll(() => {
  // Cleanup after tests
});