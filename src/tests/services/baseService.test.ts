import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { BaseService } from '../../services/baseService';
import type { ServiceContext } from '../../services/baseService';
import { ServiceError } from '../../services/errors';

class TestRepository {
  transaction = vi.fn();
}

class TestService extends BaseService<TestRepository> {
  constructor(repository: TestRepository, context?: ServiceContext) {
    super(repository, context);
  }

  async performOperation(fn: () => Promise<string>) {
    return this.execute(fn, { message: 'Operation failed', code: 'TEST_ERROR' });
  }

  async performTransactionalOperation(fn: () => Promise<string>) {
    return this.runInTransaction(async () => fn(), {
      message: 'Transaction failed',
      code: 'TRANSACTION_ERROR',
    });
  }

  exposeMergeContext(context?: ServiceContext) {
    return this.mergeContext(context);
  }
}

describe('BaseService', () => {
  let repository: TestRepository;
  let service: TestService;

  beforeEach(() => {
    repository = new TestRepository();
    service = new TestService(repository, { correlationId: 'test-correlation' });
    vi.clearAllMocks();
  });

  it('executes operations successfully and returns result', async () => {
    const operation = vi.fn().mockResolvedValue('success');
    const result = await service.performOperation(operation);

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('wraps non-service errors into ServiceError', async () => {
    const error = new Error('Unexpected failure');
    const operation = vi.fn().mockRejectedValue(error);

    await expect(service.performOperation(operation)).rejects.toThrow(ServiceError);
  });

  it('passes through ServiceError without wrapping again', async () => {
    const serviceError = new ServiceError('Known failure', { code: 'KNOWN' });
    const operation = vi.fn().mockRejectedValue(serviceError);

    await expect(service.performOperation(operation)).rejects.toThrow(serviceError);
  });

  it('executes operations within a transaction', async () => {
    const operation = vi.fn().mockResolvedValue('tx-success');
    repository.transaction.mockImplementation(async (fn: () => Promise<string>) => fn());

    const result = await service.performTransactionalOperation(operation);

    expect(repository.transaction).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(result).toBe('tx-success');
  });

  it('provides context merging capabilities', () => {
    const context: ServiceContext = { userId: '123' };
    const merged = service.exposeMergeContext(context);

    expect(merged).toEqual({ correlationId: 'test-correlation', userId: '123' });
  });
});
