import { Request, Response, NextFunction } from 'express';
import { httpRequestDuration, httpRequestTotal, httpRequestErrors } from '@/config/metrics';

/**
 * Prometheus metrics middleware
 * Tracks HTTP request duration, count, and errors
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;

    const route = (req.route?.path || req.path || 'unknown')
      .replace(/\/\d+/g, '/:id') // Replace numeric IDs with :id
      .replace(/\/[a-f0-9-]{36}/g, '/:uuid'); // Replace UUIDs with :uuid

    const method = req.method;
    const statusCode = res.statusCode.toString();

    // Record request duration
    httpRequestDuration.observe(
      {
        method,
        route,
        status_code: statusCode,
      },
      duration
    );

    // Increment request counter
    httpRequestTotal.inc({
      method,
      route,
      status_code: statusCode,
    });

    // Track errors (4xx and 5xx responses)
    if (res.statusCode >= 400) {
      const errorType = res.statusCode >= 500 ? 'server_error' : 'client_error';

      httpRequestErrors.inc({
        method,
        route,
        status_code: statusCode,
        error_type: errorType,
      });
    }
  });

  next();
}
