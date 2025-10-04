import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { ValidationError } from './errorHandler';
import { logger } from '@/utils/logger';

/**
 * Validation middleware factory
 * Creates middleware that validates request data against a Zod schema
 */
export function validateRequest(schema: z.ZodType<any>) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      // Validate the entire request object (params, query, body)
      const validated = await schema.parseAsync({
        body: (req as any).body,
        query: (req as any).query,
        params: (req as any).params,
      });

      // Replace request data with validated data
      (req as any).body = validated.body || (req as any).body;
      (req as any).query = validated.query || (req as any).query;
      (req as any).params = validated.params || (req as any).params;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map((err) => {
          const path = err.path.join('.');
          return `${path}: ${err.message}`;
        });

        logger.warn('Request validation failed', {
          path: (req as any).path,
          method: (req as any).method,
          errors: errorMessages,
        });

        next(
          new ValidationError(
            `Validation error: ${errorMessages.join(', ')}`,
            error.errors
          )
        );
      } else {
        next(error);
      }
    }
  };
}

/**
 * Validate request body only
 */
export function validateBody(schema: z.ZodType<any>) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const validated = await schema.parseAsync((req as any).body);
      (req as any).body = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map((err) => {
          const path = err.path.join('.');
          return `${path}: ${err.message}`;
        });

        logger.warn('Body validation failed', {
          path: (req as any).path,
          method: (req as any).method,
          errors: errorMessages,
        });

        next(
          new ValidationError(
            `Body validation error: ${errorMessages.join(', ')}`,
            error.errors
          )
        );
      } else {
        next(error);
      }
    }
  };
}

/**
 * Validate request query parameters only
 */
export function validateQuery(schema: z.ZodType<any>) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const validated = await schema.parseAsync((req as any).query);
      (req as any).query = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map((err) => {
          const path = err.path.join('.');
          return `${path}: ${err.message}`;
        });

        logger.warn('Query validation failed', {
          path: (req as any).path,
          method: (req as any).method,
          errors: errorMessages,
        });

        next(
          new ValidationError(
            `Query validation error: ${errorMessages.join(', ')}`,
            error.errors
          )
        );
      } else {
        next(error);
      }
    }
  };
}

/**
 * Validate request params only
 */
export function validateParams(schema: z.ZodType<any>) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const validated = await schema.parseAsync((req as any).params);
      (req as any).params = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map((err) => {
          const path = err.path.join('.');
          return `${path}: ${err.message}`;
        });

        logger.warn('Params validation failed', {
          path: (req as any).path,
          method: (req as any).method,
          errors: errorMessages,
        });

        next(
          new ValidationError(
            `Params validation error: ${errorMessages.join(', ')}`,
            error.errors
          )
        );
      } else {
        next(error);
      }
    }
  };
}

/**
 * Validate response (useful in development mode for contract testing)
 */
export function validateResponse(schema: z.ZodType<any>) {
  return (_req: Request, res: Response, next: NextFunction) => {
    // Only validate responses in development mode
    if (process.env['NODE_ENV'] !== 'development') {
      return next();
    }

    const originalJson = (res as any).json.bind(res);

    (res as any).json = function (body: any) {
      try {
        const validated = schema.parse(body);
        return originalJson(validated);
      } catch (error) {
        if (error instanceof ZodError) {
          logger.error('Response validation failed', {
            errors: error.errors,
            body,
          });
          
          // In development, we want to know about schema mismatches
          // but we still send the response
          return originalJson(body);
        }
        throw error;
      }
    };

    next();
  };
}
