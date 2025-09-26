import Redis, { Cluster } from 'ioredis';
import { config } from './environment';
import { logger } from '@/utils/logger';

// Redis connection configuration
const redisConfig = {
  retryDelayOnFailover: 100,
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  keepAlive: 30000,
  connectTimeout: 10000,
  commandTimeout: 5000,
  // Connection pool settings
  family: 4,
  db: 0,
  // Retry configuration
  retryDelayOnClusterDown: 300,
  retryDelayOnClusterFailover: 100,
  maxRetriesPerRequest: 3,
  // Health check interval
  enableOfflineQueue: false,
};

// Create Redis client
export const redis = new Redis(config.redis.url, redisConfig);

// Create separate Redis client for sessions
export const sessionRedis = new Redis(config.redis.url, {
  ...redisConfig,
  keyPrefix: 'session:',
});

// Create separate Redis client for caching
export const cacheRedis = new Redis(config.redis.url, {
  ...redisConfig,
  keyPrefix: 'cache:',
});

// Redis event handlers for main client
redis.on('connect', () => {
  logger.info('Redis client connected');
});

redis.on('ready', () => {
  logger.info('Redis client ready');
});

redis.on('error', (error) => {
  logger.error('Redis client error:', error);
});

redis.on('close', () => {
  logger.info('Redis client connection closed');
});

redis.on('reconnecting', (delay: number) => {
  logger.info(`Redis client reconnecting in ${delay}ms`);
});

// Session Redis event handlers
sessionRedis.on('connect', () => {
  logger.info('Session Redis client connected');
});

sessionRedis.on('error', (error) => {
  logger.error('Session Redis client error:', error);
});

// Cache Redis event handlers
cacheRedis.on('connect', () => {
  logger.info('Cache Redis client connected');
});

cacheRedis.on('error', (error) => {
  logger.error('Cache Redis client error:', error);
});

// Redis health check with detailed information
export async function checkRedisConnection(): Promise<{
  isHealthy: boolean;
  details: {
    mainClient: boolean;
    sessionClient: boolean;
    cacheClient: boolean;
    responseTime: number;
    error?: string;
  };
}> {
  const startTime = Date.now();
  const details = {
    mainClient: false,
    sessionClient: false,
    cacheClient: false,
    responseTime: 0,
    error: undefined as string | undefined,
  };

  try {
    // Test main Redis client
    const mainResult = await redis.ping();
    details.mainClient = mainResult === 'PONG';

    // Test session Redis client
    const sessionResult = await sessionRedis.ping();
    details.sessionClient = sessionResult === 'PONG';

    // Test cache Redis client
    const cacheResult = await cacheRedis.ping();
    details.cacheClient = cacheResult === 'PONG';

    details.responseTime = Date.now() - startTime;

    const isHealthy = details.mainClient && details.sessionClient && details.cacheClient;

    logger.info('Redis health check completed', {
      isHealthy,
      responseTime: details.responseTime,
      mainClient: details.mainClient,
      sessionClient: details.sessionClient,
      cacheClient: details.cacheClient,
    });

    return {
      isHealthy,
      details,
    };
  } catch (error) {
    details.responseTime = Date.now() - startTime;
    details.error = error instanceof Error ? error.message : 'Unknown error';
    
    logger.error('Redis health check failed:', {
      error: details.error,
      responseTime: details.responseTime,
    });

    return {
      isHealthy: false,
      details,
    };
  }
}

// Redis connection retry logic
export async function connectRedisWithRetry(maxRetries: number = 5, delay: number = 1000): Promise<boolean> {
  const clients = [
    { name: 'main', client: redis },
    { name: 'session', client: sessionRedis },
    { name: 'cache', client: cacheRedis },
  ];

  for (const { name, client } of clients) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await client.connect();
        logger.info(`${name} Redis client connected successfully on attempt ${attempt}`);
        break;
      } catch (error) {
        logger.warn(`${name} Redis connection attempt ${attempt} failed:`, error);
        
        if (attempt === maxRetries) {
          logger.error(`Max ${name} Redis connection retries exceeded`);
          return false;
        }
        
        // Exponential backoff
        const backoffDelay = delay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
  }
  
  return true;
}

// Cache utilities
export class CacheManager {
  private defaultTTL = 300; // 5 minutes
  private client: Redis;

  constructor(client: Redis = cacheRedis) {
    this.client = client;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: any, ttl: number = this.defaultTTL): Promise<boolean> {
    try {
      await this.client.setex(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  async invalidatePattern(pattern: string): Promise<boolean> {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
      return true;
    } catch (error) {
      logger.error(`Cache invalidate pattern error for pattern ${pattern}:`, error);
      return false;
    }
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const values = await this.client.mget(...keys);
      return values.map(value => value ? JSON.parse(value) : null);
    } catch (error) {
      logger.error(`Cache mget error for keys ${keys.join(', ')}:`, error);
      return keys.map(() => null);
    }
  }

  async mset(keyValuePairs: Array<{ key: string; value: any; ttl?: number }>): Promise<boolean> {
    try {
      const pipeline = this.client.pipeline();
      
      for (const { key, value, ttl = this.defaultTTL } of keyValuePairs) {
        pipeline.setex(key, ttl, JSON.stringify(value));
      }
      
      await pipeline.exec();
      return true;
    } catch (error) {
      logger.error('Cache mset error:', error);
      return false;
    }
  }

  async increment(key: string, by: number = 1, ttl?: number): Promise<number | null> {
    try {
      const result = await this.client.incrby(key, by);
      if (ttl) {
        await this.client.expire(key, ttl);
      }
      return result;
    } catch (error) {
      logger.error(`Cache increment error for key ${key}:`, error);
      return null;
    }
  }

  async getTTL(key: string): Promise<number | null> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      logger.error(`Cache TTL error for key ${key}:`, error);
      return null;
    }
  }
}

// Session management utilities
export class SessionManager {
  private client: Redis;
  private defaultTTL = 86400; // 24 hours

  constructor(client: Redis = sessionRedis) {
    this.client = client;
  }

  async createSession(sessionId: string, userId: string, data: any = {}): Promise<boolean> {
    try {
      const sessionData = {
        userId,
        createdAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
        ...data,
      };
      
      await this.client.setex(sessionId, this.defaultTTL, JSON.stringify(sessionData));
      return true;
    } catch (error) {
      logger.error(`Session create error for session ${sessionId}:`, error);
      return false;
    }
  }

  async getSession(sessionId: string): Promise<any | null> {
    try {
      const sessionData = await this.client.get(sessionId);
      if (!sessionData) return null;

      const parsed = JSON.parse(sessionData);
      
      // Update last accessed time
      parsed.lastAccessed = new Date().toISOString();
      await this.client.setex(sessionId, this.defaultTTL, JSON.stringify(parsed));
      
      return parsed;
    } catch (error) {
      logger.error(`Session get error for session ${sessionId}:`, error);
      return null;
    }
  }

  async updateSession(sessionId: string, data: any): Promise<boolean> {
    try {
      const existingSession = await this.client.get(sessionId);
      if (!existingSession) return false;

      const sessionData = {
        ...JSON.parse(existingSession),
        ...data,
        lastAccessed: new Date().toISOString(),
      };
      
      await this.client.setex(sessionId, this.defaultTTL, JSON.stringify(sessionData));
      return true;
    } catch (error) {
      logger.error(`Session update error for session ${sessionId}:`, error);
      return false;
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      await this.client.del(sessionId);
      return true;
    } catch (error) {
      logger.error(`Session delete error for session ${sessionId}:`, error);
      return false;
    }
  }

  async deleteUserSessions(userId: string): Promise<boolean> {
    try {
      const pattern = `*`;
      const keys = await this.client.keys(pattern);
      
      const userSessions = [];
      for (const key of keys) {
        const sessionData = await this.client.get(key);
        if (sessionData) {
          const parsed = JSON.parse(sessionData);
          if (parsed.userId === userId) {
            userSessions.push(key);
          }
        }
      }
      
      if (userSessions.length > 0) {
        await this.client.del(...userSessions);
      }
      
      return true;
    } catch (error) {
      logger.error(`Delete user sessions error for user ${userId}:`, error);
      return false;
    }
  }

  async extendSession(sessionId: string, ttl: number = this.defaultTTL): Promise<boolean> {
    try {
      const result = await this.client.expire(sessionId, ttl);
      return result === 1;
    } catch (error) {
      logger.error(`Session extend error for session ${sessionId}:`, error);
      return false;
    }
  }
}

export const cacheManager = new CacheManager();
export const sessionManager = new SessionManager();

// Graceful shutdown
export async function disconnectRedis(): Promise<void> {
  try {
    await redis.quit();
    logger.info('Redis connection closed');
  } catch (error) {
    logger.error('Error closing Redis connection:', error);
  }
}

// Handle process termination
process.on('beforeExit', async () => {
  await disconnectRedis();
});

process.on('SIGINT', async () => {
  await disconnectRedis();
});

process.on('SIGTERM', async () => {
  await disconnectRedis();
});