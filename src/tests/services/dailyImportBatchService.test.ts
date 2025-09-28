import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createManyMock, importErrorDetailConstructor } = vi.hoisted(() => {
  const createManyMock = vi.fn();
  const importErrorDetailConstructor = vi.fn().mockImplementation(() => ({
    createMany: createManyMock,
  }));
  return { createManyMock, importErrorDetailConstructor };
});

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../repositories/importErrorDetailRepository', () => ({
  ImportErrorDetailRepository: importErrorDetailConstructor,
  importErrorDetailRepository: { createMany: createManyMock },
}));

import { DailyImportBatchService } from '../../services/dailyImportBatchService';

describe('DailyImportBatchService', () => {
  let repository: {
    findRecent: ReturnType<typeof vi.fn>;
    findByStatus: ReturnType<typeof vi.fn>;
    transaction: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
  };
  let service: DailyImportBatchService;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = {
      findRecent: vi.fn(),
      findByStatus: vi.fn(),
      transaction: vi.fn(),
      findById: vi.fn(),
    };
    service = new DailyImportBatchService(repository as any);
    createManyMock.mockReset();
    importErrorDetailConstructor.mockClear();
  });

  it('retrieves a batch by id', async () => {
    const batch = { id: 'batch-123' };
    repository.findById.mockResolvedValue(batch);

    const result = await service.getBatchById('batch-123', { includeErrorDetails: true });

    expect(repository.findById).toHaveBeenCalledWith('batch-123', { includeErrorDetails: true });
    expect(result).toBe(batch);
  });

  it('completes a batch and persists error details inside a transaction', async () => {
    const mockBatch = { id: 'batch-1', status: 'COMPLETED' };
    const mockTx = {
      dailyImportBatch: {
        update: vi.fn().mockResolvedValue(mockBatch),
      },
      importErrorDetail: Symbol('import-error-delegate'),
    } as any;

    const runInTransactionSpy = vi
      .spyOn(service as any, 'runInTransaction')
      .mockImplementation(async (operation: any) => operation(mockTx));

    const options = {
      successfulRecords: 10,
      failedRecords: 2,
      errorLogs: ['validation-error'],
      completedAt: new Date('2024-01-01T00:00:00.000Z'),
      validationWarnings: ['duplicate-record'],
    };
    const errorDetails = [
      {
        batchId: 'batch-1',
        rowNumber: 1,
        errorType: 'VALIDATION',
        errorMessage: 'Invalid identifier',
        severity: 'ERROR',
      },
    ] as any;

    const result = await service.completeBatch('batch-1', options, errorDetails);

    expect(runInTransactionSpy).toHaveBeenCalledTimes(1);
    expect(mockTx.dailyImportBatch.update).toHaveBeenCalledWith({
      where: { id: 'batch-1' },
      data: {
        status: 'COMPLETED',
        successfulRecords: 10,
        failedRecords: 2,
        errorLogs: ['validation-error'],
        completedAt: options.completedAt,
        validationWarnings: ['duplicate-record'],
      },
    });
    expect(importErrorDetailConstructor).toHaveBeenCalledWith(mockTx.importErrorDetail);
    expect(createManyMock).toHaveBeenCalledWith(errorDetails);
    expect(result).toBe(mockBatch);
  });

  it('fails a batch and records failure metadata', async () => {
    const mockBatch = { id: 'batch-2', status: 'FAILED' };
    const mockTx = {
      dailyImportBatch: {
        update: vi.fn().mockResolvedValue(mockBatch),
      },
    } as any;

    repository.transaction.mockImplementation(async (operation: (tx: typeof mockTx) => Promise<typeof mockBatch>) =>
      operation(mockTx)
    );

    const result = await service.failBatch('batch-2', ['system-error']);

    expect(repository.transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.dailyImportBatch.update).toHaveBeenCalledWith({
      where: { id: 'batch-2' },
      data: {
        status: 'FAILED',
        errorLogs: ['system-error'],
        completedAt: expect.any(Date),
      },
    });
    expect(result).toBe(mockBatch);
  });
});
