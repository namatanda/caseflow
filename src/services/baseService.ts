/* eslint-disable @typescript-eslint/no-explicit-any */
import type { BaseRepository, TransactionClient } from '@/repositories/baseRepository';
import { createLogger } from '@/utils/logger';
import { ServiceError } from './errors';

export interface ServiceContext {
  correlationId?: string;
  userId?: string;
  [key: string]: unknown;
}

interface ExecuteOptions {
  message?: string;
  code?: string;
  statusCode?: number;
}

export abstract class BaseService<TRepository extends BaseRepository<any>> {
  protected readonly repository: TRepository;
  protected readonly logger = createLogger(this.constructor.name);
  protected readonly context: ServiceContext;

  protected constructor(repository: TRepository, context: ServiceContext = {}) {
    this.repository = repository;
    this.context = context;
  }

  protected mergeContext(additionalContext?: ServiceContext): ServiceContext {
    return {
      ...this.context,
      ...additionalContext,
    };
  }

  protected createError(
    message: string,
    options: ExecuteOptions = {},
    cause?: unknown
  ): ServiceError {
    const { message: overrideMessage, code, statusCode } = options;
    const errorMessage = overrideMessage ?? message;
    return new ServiceError(errorMessage, {
      ...(code ? { code } : {}),
      ...(typeof statusCode === 'number' ? { statusCode } : {}),
      cause,
    });
  }

  protected async execute<TResult>(
    operation: () => Promise<TResult>,
    options: ExecuteOptions = {}
  ): Promise<TResult> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ServiceError) {
        this.logger.error('Service operation failed', {
          ...this.context,
          code: error.code,
          ...(error.statusCode ? { statusCode: error.statusCode } : {}),
          message: error.message,
        });
        throw error;
      }

      const serviceError = this.createError(options.message ?? 'Service operation failed', options, error);

      this.logger.error(serviceError.message, {
        ...this.context,
        code: serviceError.code,
        ...(serviceError.statusCode ? { statusCode: serviceError.statusCode } : {}),
        cause: error instanceof Error ? error.message : error,
      });
      throw serviceError;
    }
  }

  protected async runInTransaction<TResult>(
    operation: (tx: TransactionClient) => Promise<TResult>,
    options: ExecuteOptions = {}
  ): Promise<TResult> {
    const executeOptions: ExecuteOptions = {
      message: options.message ?? 'Transaction failed',
      ...(options.code ? { code: options.code } : {}),
      ...(typeof options.statusCode === 'number' ? { statusCode: options.statusCode } : {}),
    };

    return this.execute(() => this.repository.transaction(operation), executeOptions);
  }
}
