import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { ValidationError } from './errorHandler';
import { logger } from '@/utils/logger';

/**
 * Validation middleware factory
 * Creates middleware that validates request data against a Zod schema
 */
export function validateRequest<T extends z.ZodType<unknown>>(schema: T) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      // Validate the entire request object (params, query, body)
      const validated = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      // Replace request data with validated data
      req.body = validated.body || req.body;
      req.query = validated.query || req.query;
      req.params = validated.params || req.params;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map((err) => {
          const path = err.path.join('.');
          return `${path}: ${err.message}`;
        });

        logger.warn('Request validation failed', {
          path: req.path,
          method: req.method,
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
export function validateBody<T extends z.ZodType<unknown>>(schema: T) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const validated = await schema.parseAsync(req.body);
      req.body = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map((err) => {
          const path = err.path.join('.');
          return `${path}: ${err.message}`;
        });

        logger.warn('Body validation failed', {
          path: req.path,
          method: req.method,
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
export function validateQuery<T extends z.ZodType<unknown>>(schema: T) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const validated = await schema.parseAsync(req.query);
      req.query = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map((err) => {
          const path = err.path.join('.');
          return `${path}: ${err.message}`;
        });

        logger.warn('Query validation failed', {
          path: req.path,
          method: req.method,
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
export function validateParams<T extends z.ZodType<unknown>>(schema: T) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const validated = await schema.parseAsync(req.params);
      req.params = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map((err) => {
          const path = err.path.join('.');
          return `${path}: ${err.message}`;
        });

        logger.warn('Params validation failed', {
          path: req.path,
          method: req.method,
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
export function validateResponse<T extends z.ZodType<unknown>>(schema: T) {
  return (_req: Request, res: Response, next: NextFunction) => {
    // Only validate responses in development mode
    if (process.env['NODE_ENV'] !== 'development') {
      return next();
    }

    const originalJson = res.json.bind(res);

    res.json = function (body: unknown) {
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