import express from 'express';
import compression from 'compression';
import morgan from 'morgan';
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

// Health check endpoint (before other routes)
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.env
  });
});

// API Routes
app.use('/api/v1', apiRoutes);

// Direct monitoring endpoints (for backward compatibility)
app.get('/api/system/health', (_req, res) => {
  // Simple health check without detailed diagnostics for monitoring
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'courtflow-backend'
  });
});

app.get('/api/system/metrics', (_req, res, next) => {
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
  logger.info(`❤️  Health Check: http://localhost:${config.port}/health`);
});

// Graceful shutdown
const gracefulShutdown = (signal: NodeJS.Signals) => {
  logger.info(`${signal} received, shutting down gracefully`);
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