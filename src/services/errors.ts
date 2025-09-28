import type { ZodIssue } from 'zod';

export interface ServiceErrorOptions {
  code?: string;
  statusCode?: number;
  cause?: unknown;
  details?: Record<string, unknown>;
}

export class ServiceError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details: Record<string, unknown> | undefined;
  public override readonly cause?: unknown;

  constructor(message: string, options: ServiceErrorOptions = {}) {
    const { code = 'SERVICE_ERROR', statusCode = 500, cause, details } = options;
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.cause = cause;
  }
}

export class NotFoundError extends ServiceError {
  constructor(message = 'Resource not found', details?: Record<string, unknown>) {
    super(message, {
      code: 'NOT_FOUND',
      statusCode: 404,
      ...(details ? { details } : {}),
    });
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ServiceError {
  constructor(message = 'Resource conflict', details?: Record<string, unknown>) {
    super(message, {
      code: 'CONFLICT',
      statusCode: 409,
      ...(details ? { details } : {}),
    });
    this.name = 'ConflictError';
  }
}

export class ValidationError extends ServiceError {
  public readonly issues: ZodIssue[];

  constructor(message: string, issues: ZodIssue[], details?: Record<string, unknown>) {
    super(message, {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      details: {
        issues,
        ...(details ?? {}),
      },
    });
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

export class UnauthorizedError extends ServiceError {
  constructor(message = 'Unauthorized', details?: Record<string, unknown>) {
    super(message, {
      code: 'UNAUTHORIZED',
      statusCode: 401,
      ...(details ? { details } : {}),
    });
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends ServiceError {
  constructor(message = 'Forbidden', details?: Record<string, unknown>) {
    super(message, {
      code: 'FORBIDDEN',
      statusCode: 403,
      ...(details ? { details } : {}),
    });
    this.name = 'ForbiddenError';
  }
}
