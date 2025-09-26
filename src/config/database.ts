import { PrismaClient } from '@prisma/client';
import { config } from './environment';
import { logger } from '@/utils/logger';

// Global variable to store Prisma client instance
declare global {
  var __prisma: PrismaClient | undefined;
}

// Create Prisma client instance with connection pooling
export const prisma = globalThis.__prisma || new PrismaClient({
  log: config.env === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
  datasources: {
    db: {
      url: config.database.url,
    },
  },
  // Connection pool configuration
  __internal: {
    engine: {
      // Connection pool settings
      connectionLimit: 10,
      poolTimeout: 10000,
      // Query timeout
      queryTimeout: 30000,
    },
  },
});

// Prevent multiple instances in development
if (config.env === 'development') {
  globalThis.__prisma = prisma;
}

// Database connection health check with detailed information
export async function checkDatabaseConnection(): Promise<{
  isHealthy: boolean;
  details: {
    canConnect: boolean;
    canQuery: boolean;
    responseTime: number;
    error?: string;
  };
}> {
  const startTime = Date.now();
  const details = {
    canConnect: false,
    canQuery: false,
    responseTime: 0,
    error: undefined as string | undefined,
  };

  try {
    // Test basic connection
    await prisma.$connect();
    details.canConnect = true;

    // Test query execution
    await prisma.$queryRaw`SELECT 1 as test`;
    details.canQuery = true;

    details.responseTime = Date.now() - startTime;
    
    logger.info('Database health check passed', {
      responseTime: details.responseTime,
      canConnect: details.canConnect,
      canQuery: details.canQuery,
    });

    return {
      isHealthy: true,
      details,
    };
  } catch (error) {
    details.responseTime = Date.now() - startTime;
    details.error = error instanceof Error ? error.message : 'Unknown error';
    
    logger.error('Database health check failed:', {
      error: details.error,
      responseTime: details.responseTime,
      canConnect: details.canConnect,
      canQuery: details.canQuery,
    });

    return {
      isHealthy: false,
      details,
    };
  }
}

// Database connection retry logic
export async function connectWithRetry(maxRetries: number = 5, delay: number = 1000): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await prisma.$connect();
      logger.info(`Database connected successfully on attempt ${attempt}`);
      return true;
    } catch (error) {
      logger.warn(`Database connection attempt ${attempt} failed:`, error);
      
      if (attempt === maxRetries) {
        logger.error('Max database connection retries exceeded');
        return false;
      }
      
      // Exponential backoff
      const backoffDelay = delay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }
  return false;
}

// Transaction wrapper with retry logic
export async function withTransaction<T>(
  fn: (prisma: PrismaClient) => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        maxWait: 5000, // 5 seconds
        timeout: 30000, // 30 seconds
      });
    } catch (error) {
      logger.warn(`Transaction attempt ${attempt} failed:`, error);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Short delay before retry
      await new Promise(resolve => setTimeout(resolve, 100 * attempt));
    }
  }
  throw new Error('Transaction failed after all retries');
}

// Graceful shutdown
export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error('Error closing database connection:', error);
  }
}

// Handle process termination
process.on('beforeExit', async () => {
  await disconnectDatabase();
});

process.on('SIGINT', async () => {
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectDatabase();
  process.exit(0);
});