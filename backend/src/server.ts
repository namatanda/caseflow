import express, { type Express } from 'express';
import compression from 'compression';
import morgan from 'morgan';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { register } from 'prom-client';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';
import {
  errorHandler,
  notFoundHandler,
  requestLogger,
  devCorsMiddleware,
  generalRateLimit,
  applySecurity,
  metricsMiddleware,
} from '@/middleware';

// Global error handlers for debugging
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

import { apiRoutes } from '@/routes';
// Import worker to initialize it
import '@/workers/csvImportWorker';
import { closeQueues } from '@/config/queue';
import { websocketService } from '@/services/websocketService';
import { initializeMetrics } from '@/config/metrics';

// Initialize Prometheus metrics collection
initializeMetrics();

const app: Express = express();

// Trust proxy for rate limiting and IP detection
app.set('trust proxy', 1);

// Apply security middleware (helmet, sanitization, etc.)
app.use(applySecurity);

// CORS configuration (environment-aware)
// TODO: Revert to getCorsMiddleware() for production
app.use(devCorsMiddleware);

// Rate limiting (general API rate limiting)
app.use(generalRateLimit);

// Body parsing middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Prometheus metrics middleware (track HTTP requests)
app.use(metricsMiddleware);

// Logging middleware
if (config.env !== 'test') {
  app.use(morgan('combined', {
    stream: {
      write: (message: string) => logger.info(message.trim())
    }
  }));
}
app.use(requestLogger);

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'CourtFlow Backend API',
      version: '1.0.0',
      description: 'Backend API for CourtFlow - Court Case Management System',
      contact: {
        name: 'CourtFlow Development Team',
        email: 'dev@courtflow.go.ke'
      },
    },
    servers: [
      {
        url: `http://localhost:${config.port}/api/v1`,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Error message',
            },
            code: {
              type: 'string',
              description: 'Error code',
            },
            statusCode: {
              type: 'number',
              description: 'HTTP status code',
            },
          },
        },
        AuthTokens: {
          type: 'object',
          properties: {
            accessToken: {
              type: 'string',
              description: 'JWT access token',
            },
            refreshToken: {
              type: 'string',
              description: 'JWT refresh token',
            },
            user: {
              $ref: '#/components/schemas/User',
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'User ID',
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email',
            },
            name: {
              type: 'string',
              description: 'User full name',
            },
            role: {
              type: 'string',
              enum: ['ADMIN', 'DATA_ENTRY', 'VIEWER'],
              description: 'User role',
            },
          },
        },
        ImportBatch: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Batch ID',
            },
            importDate: {
              type: 'string',
              format: 'date-time',
              description: 'Date of import',
            },
            filename: {
              type: 'string',
              description: 'Original CSV filename',
            },
            status: {
              type: 'string',
              enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
              description: 'Import batch status',
            },
            totalRecords: {
              type: 'integer',
              description: 'Total number of records in the CSV',
            },
            successfulRecords: {
              type: 'integer',
              description: 'Number of successfully imported records',
            },
            failedRecords: {
              type: 'integer',
              description: 'Number of failed records',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        ImportJob: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Job ID',
            },
            batchId: {
              type: 'string',
              description: 'Associated batch ID',
            },
            status: {
              type: 'string',
              enum: ['waiting', 'active', 'completed', 'failed', 'delayed'],
              description: 'Job status',
            },
            progress: {
              type: 'integer',
              minimum: 0,
              maximum: 100,
              description: 'Job progress percentage',
            },
            data: {
              type: 'object',
              description: 'Job data',
            },
            returnvalue: {
              type: 'object',
              description: 'Job return value',
            },
            failedReason: {
              type: 'string',
              description: 'Failure reason if job failed',
            },
          },
        },
        HealthCheckResponse: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['healthy', 'degraded', 'unhealthy'],
              description: 'Overall system health status',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
            },
            uptime: {
              type: 'number',
              description: 'System uptime in seconds',
            },
            environment: {
              type: 'string',
              description: 'Environment name',
            },
            version: {
              type: 'string',
              description: 'API version',
            },
            checks: {
              type: 'object',
              properties: {
                database: {
                  $ref: '#/components/schemas/HealthCheckItem',
                },
                redis: {
                  $ref: '#/components/schemas/HealthCheckItem',
                },
                memory: {
                  $ref: '#/components/schemas/HealthCheckItem',
                },
                disk: {
                  $ref: '#/components/schemas/HealthCheckItem',
                },
              },
            },
          },
        },
        HealthCheckItem: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['healthy', 'unhealthy'],
            },
            responseTime: {
              type: 'number',
              description: 'Response time in milliseconds',
            },
            message: {
              type: 'string',
              description: 'Status message',
            },
            details: {
              type: 'object',
              description: 'Additional details',
            },
          },
        },
        VersionResponse: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              example: 'CourtFlow Backend API',
            },
            version: {
              type: 'string',
              example: '1.0.0',
            },
            apiVersion: {
              type: 'string',
              example: 'v1',
            },
            nodeVersion: {
              type: 'string',
              example: 'v18.17.0',
            },
            environment: {
              type: 'string',
            },
            uptime: {
              type: 'number',
            },
            buildDate: {
              type: 'string',
              format: 'date-time',
            },
            platform: {
              type: 'string',
            },
            arch: {
              type: 'string',
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Health check endpoint (before other routes)
app.get('/health', (_req: express.Request, res: express.Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.env
  });
});

// Favicon - return 204 No Content to avoid 404 warnings
app.get('/favicon.ico', (_req: express.Request, res: express.Response) => {
  res.status(204).end();
});

// Root route - API information
app.get('/', (_req: express.Request, res: express.Response) => {
  res.status(200).json({
    name: 'CourtFlow Backend API',
    version: config.api.version,
    environment: config.env,
    endpoints: {
      health: '/health',
      api: '/api/v1',
      docs: '/api-docs',
      metrics: '/api/system/metrics'
    },
    timestamp: new Date().toISOString()
  });
});

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// API Routes
app.use('/api/v1', apiRoutes);

// Direct monitoring endpoints (for backward compatibility)
app.get('/api/system/health', (_req: express.Request, res: express.Response) => {
  // Simple health check without detailed diagnostics for monitoring
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'courtflow-backend'
  });
});

app.get('/api/system/metrics', (_req: express.Request, res: express.Response, next: express.NextFunction) => {
  register
    .metrics()
    .then((metrics) => {
      res.set('Content-Type', register.contentType);
      res.send(metrics);
    })
    .catch((error) => {
      const capturedError = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to collect Prometheus metrics', { error: capturedError.message });
      next(capturedError);
    });
});

// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

const server = app.listen(config.port, () => {
  logger.info(`🚀 CourtFlow Backend API Server running on port ${config.port}`);
  logger.info(`📝 Environment: ${config.env}`);
  logger.info(`🔗 API Base URL: http://localhost:${config.port}/api/v1`);
  logger.info(`📚 API Documentation: http://localhost:${config.port}/api-docs`);
  logger.info(`❤️  Health Check: http://localhost:${config.port}/health`);
  
  // Initialize WebSocket service
  websocketService.initialize(server);
  logger.info(`🔌 WebSocket service initialized at /ws`);
});

// Graceful shutdown
const gracefulShutdown = async (signal: NodeJS.Signals) => {
  logger.info(`${signal} received, shutting down gracefully`);

  try {
    // Close WebSocket connections
    await websocketService.close();
    logger.info('WebSocket service closed successfully');
  } catch (error) {
    logger.error('Error closing WebSocket service during shutdown:', error);
  }

  try {
    // Close queues
    await closeQueues();
    logger.info('Queues closed successfully');
  } catch (error) {
    logger.error('Error closing queues during shutdown:', error);
  }

  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
};

process.on('SIGTERM', () => {
  gracefulShutdown('SIGTERM');
});

process.on('SIGINT', () => {
  gracefulShutdown('SIGINT');
});

export default app;