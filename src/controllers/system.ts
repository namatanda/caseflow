import { Request, Response, NextFunction } from 'express';
import { healthChecker } from '@/utils/health-check';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';
import { register } from 'prom-client';

class SystemController {
  async healthCheck(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const quickHealth = await healthChecker.performQuickHealthCheck();
      
      const health = {
        status: quickHealth.status === 'healthy' ? 'ok' : 'error',
        timestamp: new Date().toISOString(),
        uptime: healthChecker.getUptime(),
        environment: healthChecker.getEnvironment(),
        version: healthChecker.getVersion(),
        responseTime: quickHealth.responseTime,
      };

      const statusCode = quickHealth.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error) {
      next(error);
    }
  }

  async detailedHealthCheck(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const healthResult = await healthChecker.performHealthCheck();
      
      const statusCode = healthResult.status === 'healthy' ? 200 : 
                        healthResult.status === 'degraded' ? 200 : 503;
      
      res.status(statusCode).json(healthResult);
    } catch (error) {
      logger.error('Detailed health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
        uptime: healthChecker.getUptime(),
        version: healthChecker.getVersion(),
        environment: healthChecker.getEnvironment(),
      });
    }
  }

  async metrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Get Prometheus metrics
      const prometheusMetrics = await register.metrics();
      
      // Get system metrics
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      const systemMetrics = {
        memory: {
          rss: memoryUsage.rss,
          heapTotal: memoryUsage.heapTotal,
          heapUsed: memoryUsage.heapUsed,
          external: memoryUsage.external,
          arrayBuffers: memoryUsage.arrayBuffers,
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
        },
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        loadAverage: require('os').loadavg(),
        freeMemory: require('os').freemem(),
        totalMemory: require('os').totalmem(),
      };

      // Return Prometheus format if requested
      if (req.headers.accept?.includes('text/plain')) {
        res.set('Content-Type', register.contentType);
        res.send(prometheusMetrics);
      } else {
        res.json({
          system: systemMetrics,
          prometheus: prometheusMetrics,
        });
      }
    } catch (error) {
      next(error);
    }
  }

  async version(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const version = {
        name: 'CourtFlow Backend API',
        version: healthChecker.getVersion(),
        apiVersion: config.api.version,
        nodeVersion: process.version,
        environment: healthChecker.getEnvironment(),
        uptime: healthChecker.getUptime(),
        buildDate: new Date().toISOString(),
        platform: process.platform,
        arch: process.arch,
      };

      res.status(200).json(version);
    } catch (error) {
      next(error);
    }
  }
}

export const systemController = new SystemController();