import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/utils/logger';

const getCorrelationId = (req: Request): string => req.correlationId ?? uuidv4();

const getPayloadSize = (body: unknown): number => {
  try {
    return JSON.stringify(body).length;
  } catch {
    return 0;
  }
};

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Generate correlation ID for request tracking
  req.correlationId = getCorrelationId(req);
  req.startTime = Date.now();

  // Add correlation ID to response headers
  res.setHeader('X-Correlation-ID', req.correlationId);

  // Log request
  logger.info('Incoming Request', {
    correlationId: req.correlationId,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
  });

  // Override res.json to log response
  const originalJson = res.json.bind(res);
  res.json = function jsonWithLogging(body: unknown) {
    const duration = req.startTime ? Date.now() - req.startTime : 0;

    logger.info('Outgoing Response', {
      correlationId: req.correlationId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: getPayloadSize(body),
    });

    return originalJson(body);
  };

  next();
};