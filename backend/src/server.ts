import express from 'express';
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
  getCorsMiddleware,
  generalRateLimit,
  applySecurity,
} from '@/middleware';
import { apiRoutes } from '@/routes';
// Import worker to initialize it
import '@/workers/csvImportWorker';
import { closeQueues } from '@/config/queue';
import { websocketService } from '@/services/websocketService';

const app = express();

// Trust proxy for rate limiting and IP detection
app.set('trust proxy', 1);

// Apply security middleware (helmet, sanitization, etc.)
app.use(applySecurity);

// CORS configuration (environment-aware)
app.use(getCorsMiddleware());

// Rate limiting (general API rate limiting)
app.use(generalRateLimit);

// Body parsing middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'], // Paths to files containing OpenAPI definitions
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