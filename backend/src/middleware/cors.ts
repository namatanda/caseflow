import cors from 'cors';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';

/**
 * CORS configuration with security best practices
 */
export const corsOptions: cors.CorsOptions = {
  // Allow specific origins based on environment
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is in allowed list
    if (config.cors.allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS: Origin not allowed', {
        origin,
        allowedOrigins: config.cors.allowedOrigins
      });
      callback(new Error('Not allowed by CORS'));
    }
  },

  // Allow credentials (cookies, authorization headers)
  credentials: true,

  // Allowed HTTP methods
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],

  // Allowed headers
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Correlation-ID',
    'Accept',
    'Origin',
    'Cache-Control',
    'X-File-Name'
  ],

  // Headers exposed to the client
  exposedHeaders: [
    'X-Total-Count',
    'X-Page-Count',
    'X-Correlation-ID',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset'
  ],

  // Preflight cache duration (24 hours)
  maxAge: 86400,

  // Handle preflight requests
  preflightContinue: false,
  optionsSuccessStatus: 204
};

/**
 * CORS middleware with enhanced security and logging
 */
export const corsMiddleware = cors(corsOptions);

/**
 * Development CORS middleware (more permissive for development)
 */
export const devCorsOptions: cors.CorsOptions = {
  origin: true, // Allow all origins in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Correlation-ID',
    'Accept',
    'Origin',
    'Cache-Control',
    'X-File-Name'
  ],
  exposedHeaders: [
    'X-Total-Count',
    'X-Page-Count',
    'X-Correlation-ID',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset'
  ],
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

export const devCorsMiddleware = cors(devCorsOptions);

/**
 * Get appropriate CORS middleware based on environment
 */
export const getCorsMiddleware = () => {
  if (config.env === 'development') {
    logger.info('Using development CORS configuration (permissive)');
    return devCorsMiddleware;
  } else {
    logger.info('Using production CORS configuration', {
      allowedOrigins: config.cors.allowedOrigins
    });
    return corsMiddleware;
  }
};