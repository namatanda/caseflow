import { Request, Response, NextFunction } from 'express';
import { httpRequestDuration, httpRequestTotal, httpRequestErrors } from '@/config/metrics';

/**
 * Prometheus metrics middleware
 * Tracks HTTP request duration, count, and errors
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  
  // Store original end function
  const originalEnd = res.end.bind(res);
  
  // Override end function to capture metrics
  const monitoredEnd = ((...args: Parameters<Response['end']>) => {
    // Calculate duration in seconds
    const duration = (Date.now() - start) / 1000;
    
    // Extract route path (use matched route if available, otherwise raw path)
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
    
    // Call original end function
    return originalEnd(...args);
  }) as Response['end'];
  
  res.end = monitoredEnd;
  
  next();
}
