import { PrismaClient } from '@prisma/client';
import { config } from './environment';
import { logger } from '@/utils/logger';

let prismaInstance: PrismaClient | undefined;

// Create Prisma client instance with connection pooling
const createPrismaClient = () => new PrismaClient({
  log: config.env === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
  datasources: {
    db: {
      url: config.database.url,
    },
  },
  // Note: Connection pool settings are configured via DATABASE_URL query parameters
});

export const prisma = (() => {
  if (!prismaInstance) {
    prismaInstance = createPrismaClient();
  }
  return prismaInstance;
})();

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

  try {
    // Test basic connection
    await prisma.$connect();
    const canConnect = true;

    // Test query execution
    await prisma.$queryRaw`SELECT 1 as test`;
    const canQuery = true;

    const responseTime = Date.now() - startTime;
    
    logger.info('Database health check passed', {
      responseTime,
      canConnect,
      canQuery,
    });

    return {
      isHealthy: true,
      details: {
        canConnect,
        canQuery,
        responseTime,
      },
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logger.error('Database health check failed:', {
      error: errorMessage,
      responseTime,
    });

    return {
      isHealthy: false,
      details: {
        canConnect: false,
        canQuery: false,
        responseTime,
        error: errorMessage,
      },
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
  fn: (prisma: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>) => Promise<T>,
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
const gracefulExit = (exitCode?: number) => {
  void disconnectDatabase().finally(() => {
    if (typeof exitCode === 'number') {
      process.exit(exitCode);
    }
  });
};

process.on('beforeExit', () => {
  void disconnectDatabase();
});

process.on('SIGINT', () => {
  gracefulExit(0);
});

process.on('SIGTERM', () => {
  gracefulExit(0);
});