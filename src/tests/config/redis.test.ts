import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { 
  redis, 
  sessionRedis, 
  cacheRedis, 
  checkRedisConnection, 
  connectRedisWithRetry,
  cacheManager,
  sessionManager 
} from '../../config/redis';
import { logger } from '../../utils/logger';

// Mock logger to avoid console output during tests
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Redis Configuration', () => {
  beforeAll(async () => {
    // Ensure Redis connections are established
    await connectRedisWithRetry(3, 500);
  });

  afterAll(async () => {
    // Clean up test data
    await redis.flushdb();
    await sessionRedis.flushdb();
    await cacheRedis.flushdb();
    
    // Disconnect clients
    await redis.quit();
    await sessionRedis.quit();
    await cacheRedis.quit();
  });

  beforeEach(async () => {
    // Clear test data before each test
    await redis.flushdb();
    await sessionRedis.flushdb();
    await cacheRedis.flushdb();
  });

  describe('checkRedisConnection', () => {
    it('should return healthy status when Redis is available', async () => {
      const result = await checkRedisConnection();
      
      expect(result.isHealthy).toBe(true);
      expect(result.details.mainClient).toBe(true);
      expect(result.details.sessionClient).toBe(true);
      expect(result.details.cacheClient).toBe(true);
      expect(result.details.responseTime).toBeGreaterThan(0);
      expect(result.details.error).toBeUndefined();
    });

    it('should include response time in health check', async () => {
      const result = await checkRedisConnection();
      
      expect(result.details.responseTime).toBeTypeOf('number');
      expect(result.details.responseTime).toBeGreaterThan(0);
    });
  });

  describe('connectRedisWithRetry', () => {
    it('should successfully connect to Redis', async () => {
      const result = await connectRedisWithRetry(3, 100);
      
      expect(result).toBe(true);
    });
  });

  describe('CacheManager', () => {
    it('should set and get cache values', async () => {
      const key = 'test:key';
      const value = { message: 'Hello, World!', timestamp: Date.now() };
      
      const setResult = await cacheManager.set(key, value, 60);
      expect(setResult).toBe(true);
      
      const getValue = await cacheManager.get(key);
      expect(getValue).toEqual(value);
    });

    it('should return null for non-existent keys', async () => {
      const value = await cacheManager.get('non:existent:key');
      expect(value).toBeNull();
    });

    it('should delete cache values', async () => {
      const key = 'test:delete:key';
      const value = 'test value';
      
      await cacheManager.set(key, value);
      const deleteResult = await cacheManager.del(key);
      expect(deleteResult).toBe(true);
      
      const getValue = await cacheManager.get(key);
      expect(getValue).toBeNull();
    });

    it('should check if key exists', async () => {
      const key = 'test:exists:key';
      const value = 'test value';
      
      let exists = await cacheManager.exists(key);
      expect(exists).toBe(false);
      
      await cacheManager.set(key, value);
      exists = await cacheManager.exists(key);
      expect(exists).toBe(true);
    });

    it('should invalidate keys by pattern', async () => {
      const keys = ['user:1:profile', 'user:2:profile', 'user:1:settings'];
      const value = 'test data';
      
      // Set multiple keys
      for (const key of keys) {
        await cacheManager.set(key, value);
      }
      
      // Invalidate user:1:* pattern
      const invalidateResult = await cacheManager.invalidatePattern('user:1:*');
      expect(invalidateResult).toBe(true);
      
      // Check that user:1 keys are gone but user:2 remains
      expect(await cacheManager.get('user:1:profile')).toBeNull();
      expect(await cacheManager.get('user:1:settings')).toBeNull();
      expect(await cacheManager.get('user:2:profile')).toEqual(value);
    });

    it('should handle multiple get operations', async () => {
      const keys = ['key1', 'key2', 'key3'];
      const values = ['value1', 'value2', 'value3'];
      
      // Set values
      for (let i = 0; i < keys.length; i++) {
        await cacheManager.set(keys[i], values[i]);
      }
      
      const results = await cacheManager.mget(keys);
      expect(results).toEqual(values);
    });

    it('should handle multiple set operations', async () => {
      const keyValuePairs = [
        { key: 'batch:key1', value: 'value1', ttl: 60 },
        { key: 'batch:key2', value: 'value2', ttl: 120 },
        { key: 'batch:key3', value: 'value3' },
      ];
      
      const setResult = await cacheManager.mset(keyValuePairs);
      expect(setResult).toBe(true);
      
      // Verify all values were set
      for (const { key, value } of keyValuePairs) {
        const storedValue = await cacheManager.get(key);
        expect(storedValue).toEqual(value);
      }
    });

    it('should increment numeric values', async () => {
      const key = 'counter:test';
      
      let result = await cacheManager.increment(key, 1, 60);
      expect(result).toBe(1);
      
      result = await cacheManager.increment(key, 5);
      expect(result).toBe(6);
      
      result = await cacheManager.increment(key);
      expect(result).toBe(7);
    });

    it('should get TTL for keys', async () => {
      const key = 'ttl:test';
      const ttl = 60;
      
      await cacheManager.set(key, 'test value', ttl);
      
      const remainingTTL = await cacheManager.getTTL(key);
      expect(remainingTTL).toBeGreaterThan(0);
      expect(remainingTTL).toBeLessThanOrEqual(ttl);
    });
  });

  describe('SessionManager', () => {
    it('should create and retrieve sessions', async () => {
      const sessionId = 'session:test:123';
      const userId = 'user:123';
      const sessionData = { role: 'admin', permissions: ['read', 'write'] };
      
      const createResult = await sessionManager.createSession(sessionId, userId, sessionData);
      expect(createResult).toBe(true);
      
      const retrievedSession = await sessionManager.getSession(sessionId);
      expect(retrievedSession).toMatchObject({
        userId,
        ...sessionData,
      });
      expect(retrievedSession.createdAt).toBeDefined();
      expect(retrievedSession.lastAccessed).toBeDefined();
    });

    it('should update session data', async () => {
      const sessionId = 'session:update:123';
      const userId = 'user:123';
      
      await sessionManager.createSession(sessionId, userId, { role: 'user' });
      
      const updateResult = await sessionManager.updateSession(sessionId, { 
        role: 'admin',
        newField: 'new value' 
      });
      expect(updateResult).toBe(true);
      
      const updatedSession = await sessionManager.getSession(sessionId);
      expect(updatedSession.role).toBe('admin');
      expect(updatedSession.newField).toBe('new value');
    });

    it('should delete sessions', async () => {
      const sessionId = 'session:delete:123';
      const userId = 'user:123';
      
      await sessionManager.createSession(sessionId, userId);
      
      const deleteResult = await sessionManager.deleteSession(sessionId);
      expect(deleteResult).toBe(true);
      
      const retrievedSession = await sessionManager.getSession(sessionId);
      expect(retrievedSession).toBeNull();
    });

    it('should delete all user sessions', async () => {
      const userId = 'user:multi:123';
      const sessionIds = [
        'session:multi:1',
        'session:multi:2',
        'session:multi:3',
      ];
      
      // Create multiple sessions for the same user
      for (const sessionId of sessionIds) {
        await sessionManager.createSession(sessionId, userId);
      }
      
      // Create a session for a different user
      await sessionManager.createSession('session:other:1', 'user:other:456');
      
      const deleteResult = await sessionManager.deleteUserSessions(userId);
      expect(deleteResult).toBe(true);
      
      // Check that user sessions are deleted
      for (const sessionId of sessionIds) {
        const session = await sessionManager.getSession(sessionId);
        expect(session).toBeNull();
      }
      
      // Check that other user's session remains
      const otherSession = await sessionManager.getSession('session:other:1');
      expect(otherSession).not.toBeNull();
    });

    it('should extend session TTL', async () => {
      const sessionId = 'session:extend:123';
      const userId = 'user:123';
      
      await sessionManager.createSession(sessionId, userId);
      
      const extendResult = await sessionManager.extendSession(sessionId, 3600);
      expect(extendResult).toBe(true);
    });

    it('should return null for non-existent sessions', async () => {
      const session = await sessionManager.getSession('non:existent:session');
      expect(session).toBeNull();
    });

    it('should update lastAccessed when retrieving session', async () => {
      const sessionId = 'session:access:123';
      const userId = 'user:123';
      
      await sessionManager.createSession(sessionId, userId);
      
      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const session1 = await sessionManager.getSession(sessionId);
      const firstAccess = session1.lastAccessed;
      
      // Wait a bit more
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const session2 = await sessionManager.getSession(sessionId);
      const secondAccess = session2.lastAccessed;
      
      expect(new Date(secondAccess).getTime()).toBeGreaterThan(new Date(firstAccess).getTime());
    });
  });
});