import os from 'node:os';
import { statSync } from 'node:fs';
import { checkDatabaseConnection } from '../config/database';
import { checkRedisConnection } from '../config/redis';
import { logger } from './logger';

type DatabaseHealthDetails = Awaited<ReturnType<typeof checkDatabaseConnection>>['details'];
type RedisHealthDetails = Awaited<ReturnType<typeof checkRedisConnection>>['details'];

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  checks: {
    database: {
      status: 'healthy' | 'unhealthy';
      responseTime: number;
  details: DatabaseHealthDetails;
    };
    redis: {
      status: 'healthy' | 'unhealthy';
      responseTime: number;
  details: RedisHealthDetails;
    };
    memory: {
      status: 'healthy' | 'unhealthy';
      usage: {
        used: number;
        total: number;
        percentage: number;
      };
    };
    disk: {
      status: 'healthy' | 'unhealthy';
      usage?: {
        used: number;
        total: number;
        percentage: number;
      };
    };
  };
  errors: string[];
}

export class HealthChecker {
  private startTime: number;
  private version: string;
  private environment: string;

  constructor() {
    this.startTime = Date.now();
    this.version = process.env['npm_package_version'] || '1.0.0';
    this.environment = process.env['NODE_ENV'] || 'development';
  }

  async performHealthCheck(): Promise<HealthCheckResult> {
    const timestamp = new Date().toISOString();
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    const errors: string[] = [];

    logger.info('Performing comprehensive health check');

    // Initialize result structure
    const result: HealthCheckResult = {
      status: 'healthy',
      timestamp,
      uptime,
      version: this.version,
      environment: this.environment,
      checks: {
        database: {
          status: 'unhealthy',
          responseTime: 0,
          details: {
            canConnect: false,
            canQuery: false,
            responseTime: 0,
          },
        },
        redis: {
          status: 'unhealthy',
          responseTime: 0,
          details: {
            mainClient: false,
            sessionClient: false,
            cacheClient: false,
            responseTime: 0,
          },
        },
        memory: {
          status: 'healthy',
          usage: {
            used: 0,
            total: 0,
            percentage: 0,
          },
        },
        disk: {
          status: 'healthy',
        },
      },
      errors,
    };

    // Check database health
    try {
      const dbCheck = await checkDatabaseConnection();
      result.checks.database = {
        status: dbCheck.isHealthy ? 'healthy' : 'unhealthy',
        responseTime: dbCheck.details.responseTime,
        details: dbCheck.details,
      };

      if (!dbCheck.isHealthy) {
        errors.push(`Database check failed: ${dbCheck.details.error}`);
      }
    } catch (error) {
      result.checks.database.status = 'unhealthy';
      const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
      errors.push(`Database check error: ${errorMessage}`);
      logger.error('Database health check failed:', error);
    }

    // Check Redis health
    try {
      const redisCheck = await checkRedisConnection();
      result.checks.redis = {
        status: redisCheck.isHealthy ? 'healthy' : 'unhealthy',
        responseTime: redisCheck.details.responseTime,
        details: redisCheck.details,
      };

      if (!redisCheck.isHealthy) {
        errors.push(`Redis check failed: ${redisCheck.details.error}`);
      }
    } catch (error) {
      result.checks.redis.status = 'unhealthy';
      const errorMessage = error instanceof Error ? error.message : 'Unknown Redis error';
      errors.push(`Redis check error: ${errorMessage}`);
      logger.error('Redis health check failed:', error);
    }

    // Check memory usage
    try {
  const memoryUsage = process.memoryUsage();
  const totalMemory = os.totalmem();
      const usedMemory = memoryUsage.heapUsed;
      const memoryPercentage = (usedMemory / totalMemory) * 100;

      result.checks.memory = {
        status: memoryPercentage > 90 ? 'unhealthy' : 'healthy',
        usage: {
          used: usedMemory,
          total: totalMemory,
          percentage: Math.round(memoryPercentage * 100) / 100,
        },
      };

      if (memoryPercentage > 90) {
        errors.push(`High memory usage: ${memoryPercentage.toFixed(2)}%`);
      }
    } catch (error) {
      result.checks.memory.status = 'unhealthy';
      const errorMessage = error instanceof Error ? error.message : 'Unknown memory error';
      errors.push(`Memory check error: ${errorMessage}`);
      logger.error('Memory health check failed:', error);
    }

    // Check disk usage (if available)
    try {
  statSync(process.cwd()); // Just check if we can access the current directory
      
      // This is a basic check - in production you might want to use a more sophisticated disk usage check
      result.checks.disk.status = 'healthy';
    } catch (error) {
      result.checks.disk.status = 'unhealthy';
      const errorMessage = error instanceof Error ? error.message : 'Unknown disk error';
      errors.push(`Disk check error: ${errorMessage}`);
      logger.error('Disk health check failed:', error);
    }

    // Determine overall status
  const hasUnhealthyChecks = Object.values(result.checks).some((check) => check.status === 'unhealthy');
    const hasCriticalErrors = errors.some(error => 
      error.includes('Database') || error.includes('Redis')
    );

    if (hasCriticalErrors) {
      result.status = 'unhealthy';
    } else if (hasUnhealthyChecks) {
      result.status = 'degraded';
    } else {
      result.status = 'healthy';
    }

    logger.info('Health check completed', {
      status: result.status,
      errorCount: errors.length,
      responseTime: Date.now() - new Date(timestamp).getTime(),
    });

    return result;
  }

  async performQuickHealthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; responseTime: number }> {
    const startTime = Date.now();
    
    try {
      // Quick database ping
      const dbCheck = await checkDatabaseConnection();
      const redisCheck = await checkRedisConnection();
      
      const isHealthy = dbCheck.isHealthy && redisCheck.isHealthy;
      const responseTime = Date.now() - startTime;
      
      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        responseTime,
      };
    } catch (error) {
      logger.error('Quick health check failed:', error);
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
      };
    }
  }

  getUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  getVersion(): string {
    return this.version;
  }

  getEnvironment(): string {
    return this.environment;
  }
}

// Singleton instance
export const healthChecker = new HealthChecker();