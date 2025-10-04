import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { PrismaClientKnownRequestError, PrismaClientValidationError } from '@prisma/client/runtime/library';
import { logger } from '@/utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class ApiError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public errorId: string;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errorId = uuidv4();
    
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, _details?: unknown) {
    super(message, 400);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string = 'Authentication required') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends ApiError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string = 'Resource not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ApiError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends ApiError {
  constructor(message: string = 'Too many requests') {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let error = err;

  // Convert known errors to ApiError
  if (err instanceof ZodError) {
    const message = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    error = new ValidationError(`Validation failed: ${message}`);
  } else {
    // Try to handle Prisma errors if available
    try {
      if (err instanceof PrismaClientKnownRequestError) {
        error = handlePrismaError(err);
      } else if (err instanceof PrismaClientValidationError) {
        error = new ValidationError('Database validation error');
      }
    } catch (prismaError) {
      // Prisma not available or instanceof check failed, continue with generic error handling
    }
  }
  
  // If no specific error type was matched, create generic ApiError
  if (error === err && !(err instanceof ApiError)) {
    // Convert unknown errors to ApiError
    error = new ApiError('Internal server error', 500, false);
  }

  const apiError = error as ApiError;
  
  // Log error
  const logData = {
    errorId: apiError.errorId,
    message: apiError.message,
    statusCode: apiError.statusCode,
    stack: apiError.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
  };

  if (apiError.statusCode >= 500) {
    logger.error('Server Error', logData);
  } else {
    logger.warn('Client Error', logData);
  }

  // Send error response
  const response: Record<string, unknown> = {
    success: false,
    error: apiError.message,
    errorId: apiError.errorId,
    timestamp: new Date().toISOString(),
  };

  // Add stack trace in development
  if (process.env['NODE_ENV'] === 'development') {
    response['stack'] = apiError.stack;
  }

  res.status(apiError.statusCode).json(response);
};

function handlePrismaError(error: PrismaClientKnownRequestError): ApiError {
  switch (error.code) {
    case 'P2002':
      return new ConflictError('A record with this information already exists');
    case 'P2025':
      return new NotFoundError('Record not found');
    case 'P2003':
      return new ValidationError('Foreign key constraint failed');
    case 'P2004':
      return new ValidationError('A constraint failed on the database');
    default:
      return new ApiError('Database error occurred', 500);
  }
}