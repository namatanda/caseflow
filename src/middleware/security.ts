import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

import { logger } from '@/utils/logger';

const DEFAULT_MAX_REQUEST_SIZE = 10 * 1024 * 1024; // 10MB

const sanitizeString = (value: string): string =>
  value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s*on\w+\s*=\s*[^>\s"']+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

const sanitizeDeep = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return sanitizeString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDeep(item));
  }

  if (value && typeof value === 'object') {
    if (value instanceof Date || value instanceof Buffer || ArrayBuffer.isView(value)) {
      return value;
    }

    const source = value as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};

    for (const key of Object.keys(source)) {
      sanitized[key] = sanitizeDeep(source[key]);
    }

    return sanitized;
  }

  return value;
};

const sanitizeInPlace = (value: unknown): void => {
  if (Array.isArray(value)) {
    const arrayValue = value as unknown[];
    for (let index = 0; index < arrayValue.length; index += 1) {
      arrayValue[index] = sanitizeDeep(arrayValue[index]);
    }
    return;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      record[key] = sanitizeDeep(record[key]);
    }
  }
};

const extractClientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];

  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() ?? '';
  }

  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0]?.trim() ?? '';
  }

  return req.ip || req.socket.remoteAddress || '';
};

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      scriptSrc: ["'self'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  frameguard: { action: 'deny' },
  dnsPrefetchControl: { allow: false },
  hidePoweredBy: true,
  noSniff: true,
  referrerPolicy: { policy: ['no-referrer', 'strict-origin-when-cross-origin'] },
  crossOriginEmbedderPolicy: false
});

export const sanitizeRequest = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  try {
    req.query = sanitizeDeep(req.query) as typeof req.query;
    req.params = sanitizeDeep(req.params) as typeof req.params;

    sanitizeInPlace(req.body);

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

export const ipWhitelist = (allowedIPs: readonly string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = extractClientIp(req);

    if (!allowedIPs.includes(clientIP)) {
      logger.warn('IP not in whitelist', {
        correlationId: req.correlationId,
        clientIP,
        allowedIPs,
        url: req.url,
        method: req.method
      });

      res.status(403).json({
        success: false,
        error: 'Access denied from this IP address',
        timestamp: new Date().toISOString()
      });
      return;
    }

    next();
  };
};

export const requestSizeLimit = (maxSize: number = DEFAULT_MAX_REQUEST_SIZE) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const headerValue = req.get('content-length');
    const parsedLength = headerValue ? Number.parseInt(headerValue, 10) : 0;
    const contentLength = Number.isNaN(parsedLength) ? 0 : parsedLength;

    if (contentLength > maxSize) {
      logger.warn('Request size exceeds limit', {
        correlationId: req.correlationId,
        contentLength,
        maxSize,
        url: req.url,
        method: req.method
      });

      res.status(413).json({
        success: false,
        error: 'Request entity too large',
        maxSize: `${maxSize} bytes`,
        timestamp: new Date().toISOString()
      });
      return;
    }

    next();
  };
};

export const applySecurity = [securityHeaders, sanitizeRequest, requestSizeLimit()];