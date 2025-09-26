import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';

/**
 * Security headers configuration using Helmet
 */
export const securityHeaders = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      manifestSrc: ["'self'"],
      workerSrc: ["'self'"],
      childSrc: ["'none'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: config.env === 'production' ? [] : null
    },
    reportOnly: config.env === 'development'
  },

  // HTTP Strict Transport Security
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },

  // X-Frame-Options
  frameguard: {
    action: 'deny'
  },

  // X-Content-Type-Options
  noSniff: true,

  // X-XSS-Protection
  xssFilter: true,

  // Referrer Policy
  referrerPolicy: {
    policy: ['no-referrer', 'strict-origin-when-cross-origin']
  },

  // Hide X-Powered-By header
  hidePoweredBy: true,

  // DNS Prefetch Control
  dnsPrefetchControl: {
    allow: false
  },

  // Permissions Policy (formerly Feature Policy)
  permissionsPolicy: {
    features: {
      camera: ["'none'"],
      microphone: ["'none'"],
      geolocation: ["'none'"],
      payment: ["'none'"],
      usb: ["'none'"],
      magnetometer: ["'none'"],
      gyroscope: ["'none'"],
      accelerometer: ["'none'"],
      ambient_light_sensor: ["'none'"],
      autoplay: ["'none'"],
      encrypted_media: ["'none'"],
      fullscreen: ["'self'"],
      picture_in_picture: ["'none'"],
      sync_xhr: ["'none'"]
    }
  }
});

/**
 * Request sanitization middleware
 * Removes potentially dangerous characters from request data
 */
export const sanitizeRequest = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    // Sanitize query parameters
    if (req.query) {
      for (const key in req.query) {
        if (typeof req.query[key] === 'string') {
          req.query[key] = sanitizeString(req.query[key] as string);
        }
      }
    }

    // Sanitize request body (for string values only)
    if (req.body && typeof req.body === 'object') {
      sanitizeObject(req.body);
    }

    next();
  } catch (error) {
    logger.error('Request sanitization failed', {
      correlationId: req.correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      url: req.url,
      method: req.method
    });
    next(error);
  }
};

/**
 * Sanitize string by removing potentially dangerous characters
 */
function sanitizeString(str: string): string {
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '') // Remove iframe tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '') // Remove event handlers with quotes
    .replace(/\s*on\w+\s*=\s*[^>\s"']+/gi, '') // Remove event handlers without quotes
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Recursively sanitize object properties
 */
function sanitizeObject(obj: any): void {
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      if (typeof obj[key] === 'string') {
        obj[key] = sanitizeString(obj[key]);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key]);
      }
    }
  }
}

/**
 * IP whitelist middleware (for admin endpoints)
 */
export const ipWhitelist = (allowedIPs: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = req.ip || req.connection.remoteAddress || '';
    
    if (!allowedIPs.includes(clientIP)) {
      logger.warn('IP not in whitelist', {
        correlationId: req.correlationId,
        clientIP,
        allowedIPs,
        url: req.url,
        method: req.method
      });
      
      return res.status(403).json({
        success: false,
        error: 'Access denied from this IP address',
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
};

/**
 * Request size limiter middleware
 */
export const requestSizeLimit = (maxSize: number = 10 * 1024 * 1024) => { // 10MB default
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.get('content-length') || '0', 10);
    
    if (contentLength > maxSize) {
      logger.warn('Request size exceeds limit', {
        correlationId: req.correlationId,
        contentLength,
        maxSize,
        url: req.url,
        method: req.method
      });
      
      return res.status(413).json({
        success: false,
        error: 'Request entity too large',
        maxSize: `${maxSize} bytes`,
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
};

/**
 * Security middleware that combines all security measures
 */
export const applySecurity = [
  securityHeaders,
  sanitizeRequest,
  requestSizeLimit()
];