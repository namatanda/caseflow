import Redis from 'ioredis';
import { config } from './environment';
import { logger } from '@/utils/logger';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const parseJson = <T>(value: string): T | null => {
  try {
    return JSON.parse(value) as unknown as T;
  } catch (error) {
    logger.error('Failed to parse JSON value from Redis:', error);
    return null;
  }
};

// Redis connection configuration
const redisConfig = {
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: null, // Required for BullMQ
  keepAlive: 30000,
  connectTimeout: 10000,
  commandTimeout: 30000, // Increased from 5000 to prevent timeouts during queue operations
  // Connection pool settings
  family: 4,
  db: 0,
  // Retry configuration
  retryDelayOnClusterDown: 300,
  retryDelayOnClusterFailover: 100,
  // Health check interval
  enableOfflineQueue: true,
  lazyConnect: false, // Connect immediately
  retryStrategy(times: number) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
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
      details: {
        mainClient: details.mainClient,
        sessionClient: details.sessionClient,
        cacheClient: details.cacheClient,
        responseTime: details.responseTime,
        ...(details.error && { error: details.error }),
      },
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
      details: {
        mainClient: details.mainClient,
        sessionClient: details.sessionClient,
        cacheClient: details.cacheClient,
        responseTime: details.responseTime,
        ...(details.error && { error: details.error }),
      },
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
        // Try to ping the client to check connection
        const result = await client.ping();
        if (result === 'PONG') {
          logger.info(`${name} Redis client connected successfully on attempt ${attempt}`);
          break;
        }
        
        throw new Error('Ping did not return PONG');
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
  private readonly defaultTTL = 300; // 5 minutes
  private readonly client: Redis;

  constructor(client: Redis = cacheRedis) {
    this.client = client;
  }

  async get<T extends JsonValue>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (!value) {
        return null;
      }
      return parseJson<T>(value);
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  async set<T extends JsonValue>(key: string, value: T, ttl: number = this.defaultTTL): Promise<boolean> {
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
      const searchClient = new Redis(config.redis.url);
      const fullPattern = `cache:${pattern}`;
      const keys = await searchClient.keys(fullPattern);

      if (keys.length > 0) {
        const keysWithoutPrefix = keys.map((key) => key.replace('cache:', ''));
        await this.client.del(...keysWithoutPrefix);
      }

      await searchClient.quit();
      return true;
    } catch (error) {
      logger.error(`Cache invalidate pattern error for pattern ${pattern}:`, error);
      return false;
    }
  }

  async mget<T extends JsonValue>(keys: string[]): Promise<(T | null)[]> {
    try {
      const values = await this.client.mget(...keys);
      return values.map((value) => (value ? parseJson<T>(value) : null));
    } catch (error) {
      logger.error(`Cache mget error for keys ${keys.join(', ')}:`, error);
      return keys.map(() => null);
    }
  }

  async mset(pairs: Array<{ key: string; value: JsonValue; ttl?: number }>): Promise<boolean> {
    try {
      const pipeline = this.client.pipeline();

      for (const { key, value, ttl = this.defaultTTL } of pairs) {
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
interface SessionMetadata extends Record<string, JsonValue> {
  userId: string;
  createdAt: string;
  lastAccessed: string;
}

type PartialSessionUpdate = Record<string, JsonValue>;

export class SessionManager {
  private readonly client: Redis;
  private readonly defaultTTL = 86400; // 24 hours

  constructor(client: Redis = sessionRedis) {
    this.client = client;
  }

  async createSession(sessionId: string, userId: string, data: PartialSessionUpdate = {}): Promise<boolean> {
    try {
      const now = new Date().toISOString();
      const sessionData: SessionMetadata = {
        userId,
        createdAt: now,
        lastAccessed: now,
        ...data,
      };

      await this.client.setex(sessionId, this.defaultTTL, JSON.stringify(sessionData));
      return true;
    } catch (error) {
      logger.error(`Session create error for session ${sessionId}:`, error);
      return false;
    }
  }

  async getSession(sessionId: string): Promise<SessionMetadata | null> {
    try {
      const sessionValue = await this.client.get(sessionId);
      if (!sessionValue) {
        return null;
      }

      const parsed = parseJson<SessionMetadata>(sessionValue);
      if (!parsed) {
        return null;
      }

      const updated = {
        ...parsed,
        lastAccessed: new Date().toISOString(),
      } satisfies SessionMetadata;

      await this.client.setex(sessionId, this.defaultTTL, JSON.stringify(updated));
      return updated;
    } catch (error) {
      logger.error(`Session get error for session ${sessionId}:`, error);
      return null;
    }
  }

  async updateSession(sessionId: string, data: PartialSessionUpdate): Promise<boolean> {
    try {
      const existingSession = await this.client.get(sessionId);
      if (!existingSession) {
        return false;
      }

      const parsed = parseJson<SessionMetadata>(existingSession);
      if (!parsed) {
        return false;
      }

      const sessionData: SessionMetadata = {
        ...parsed,
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
      const searchClient = new Redis(config.redis.url);
      const allKeys = await searchClient.keys('session:*');

      const userSessions: string[] = [];
      for (const fullKey of allKeys) {
        const sessionValue = await searchClient.get(fullKey);
        if (!sessionValue) {
          continue;
        }

        const parsed = parseJson<SessionMetadata>(sessionValue);
        if (parsed?.userId === userId) {
          const keyWithoutPrefix = fullKey.replace('session:', '');
          userSessions.push(keyWithoutPrefix);
        }
      }

      if (userSessions.length > 0) {
        await this.client.del(...userSessions);
      }

      await searchClient.quit();
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
const disconnectAllClients = async () => {
  try {
    await Promise.all([
      redis.quit().catch((error) => logger.error('Error quitting main Redis client:', error)),
      sessionRedis.quit().catch((error) => logger.error('Error quitting session Redis client:', error)),
      cacheRedis.quit().catch((error) => logger.error('Error quitting cache Redis client:', error)),
    ]);
  } catch (error) {
    logger.error('Unexpected error when quitting Redis clients:', error);
  }
};

export async function disconnectRedis(): Promise<void> {
  await disconnectAllClients();
  logger.info('Redis connections closed');
}

const exitRedis = (exitCode?: number) => {
  void disconnectAllClients().finally(() => {
    if (typeof exitCode === 'number') {
      process.exit(exitCode);
    }
  });
};

process.on('beforeExit', () => {
  void disconnectAllClients();
});

process.on('SIGINT', () => {
  exitRedis(0);
});

process.on('SIGTERM', () => {
  exitRedis(0);
});