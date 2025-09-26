import express from 'express';
import compression from 'compression';
import morgan from 'morgan';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';
import { 
  errorHandler, 
  notFoundHandler, 
  requestLogger,
  getCorsMiddleware,
  generalRateLimit,
  applySecurity
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
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.env
  });
});

// API routes
app.use('/api/v1', apiRoutes);

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
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

export default app;