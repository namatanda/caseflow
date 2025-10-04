import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { config } from '@/config/environment';
import { logger, auditLogger } from '@/utils/logger';
import { RateLimitError } from './errorHandler';

/**
 * Rate limit configuration interface
 */
interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  skip?: (req: Request) => boolean;
}

/**
 * Create rate limit error response
 */
const createRateLimitError = (req: Request, res: Response): void => {
  const error = new RateLimitError('Too many requests from this IP, please try again later.');

  logger.warn('Rate limit exceeded', {
    correlationId: req.correlationId,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    url: req.url,
    method: req.method,
    userId: req.user?.id
  });

  // Emit audit event for rate limit violations
  auditLogger.rateLimitExceeded(
    req.ip || 'unknown',
    req.get('User-Agent') || undefined,
    req.url,
    req.correlationId
  );

  res.status(error.statusCode).json({
    success: false,
    error: error.message,
    errorId: error.errorId,
    retryAfter: res.get('Retry-After'),
    timestamp: new Date().toISOString()
  });
};

/**
 * General API rate limiter
 * 100 requests per 15 minutes per IP
 */
export const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.rateLimit.maxRequests,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  
  // Skip rate limiting for health checks and system endpoints
  skip: (req: Request) => {
    const skipPaths = [
      '/api/v1/system/health',
      '/health'
    ];
    return skipPaths.includes(req.path);
  },

  // Custom error handler
  handler: createRateLimitError,

  // Key generator (default uses IP)
  keyGenerator: (req: Request) => {
    // Use user ID if authenticated, otherwise use IP
    return req.user?.id || req.ip || 'unknown';
  }
});

/**
 * Strict rate limiter for authentication endpoints
 * 5 requests per 15 minutes per IP
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  handler: createRateLimitError,
  keyGenerator: (req: Request) => req.ip || 'unknown' // Always use IP for auth attempts
});

/**
 * File upload rate limiter
 * 10 uploads per hour per user/IP
 */
export const uploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: 'Too many file uploads, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitError,
  keyGenerator: (req: Request) => req.user?.id || req.ip || 'unknown'
});

/**
 * API creation/modification rate limiter
 * 30 requests per 10 minutes per user
 */
export const creationRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30,
  message: 'Too many creation requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitError,
  keyGenerator: (req: Request) => req.user?.id || req.ip || 'unknown'
});

/**
 * Search/query rate limiter
 * 200 requests per 15 minutes per user/IP
 */
export const searchRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: 'Too many search requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitError,
  keyGenerator: (req: Request) => req.user?.id || req.ip || 'unknown'
});

/**
 * Create custom rate limiter with specific configuration
 */
export const createCustomRateLimit = (customConfig: RateLimitConfig) => {
  const options = {
    windowMs: customConfig.windowMs,
    max: customConfig.max,
    message: customConfig.message || 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: customConfig.skipSuccessfulRequests ?? false,
    skipFailedRequests: customConfig.skipFailedRequests ?? false,
    handler: createRateLimitError,
    keyGenerator: (req: Request) => req.user?.id || req.ip || 'unknown',
  };

  if (customConfig.skip) {
    return rateLimit({ ...options, skip: customConfig.skip });
  }

  return rateLimit(options);
};

/**
 * Rate limit middleware factory for different endpoint types
 */
export const getRateLimit = (type: 'general' | 'auth' | 'upload' | 'create' | 'search') => {
  switch (type) {
    case 'auth':
      return authRateLimit;
    case 'upload':
      return uploadRateLimit;
    case 'create':
      return creationRateLimit;
    case 'search':
      return searchRateLimit;
    case 'general':
    default:
      return generalRateLimit;
  }
};