import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  repositoryMock,
  csvServiceMock,
  batchServiceMock,
} = vi.hoisted(() => {
  const repositoryMock = {
    create: vi.fn(),
    update: vi.fn(),
  };

  const csvServiceMock = {
    importCaseData: vi.fn(),
    exportCasesForCsv: vi.fn(),
  };

  const batchServiceMock = {
    completeBatch: vi.fn(),
    failBatch: vi.fn(),
    getBatchById: vi.fn(),
    getRecentBatches: vi.fn(),
  };

  return {
    repositoryMock,
    csvServiceMock,
    batchServiceMock,
  };
});

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { ImportService, type ProcessCsvBatchOptions } from '../../services/importService';

const createService = () =>
  new ImportService(
    repositoryMock as any,
    csvServiceMock as any,
    batchServiceMock as any
  );

describe('ImportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new import batch with default values', async () => {
    const service = createService();
    const input = {
      importDate: new Date('2024-05-01'),
      filename: 'cases.csv',
      fileSize: 1024,
      fileChecksum: 'abc123',
      totalRecords: 10,
      createdBy: 'user-1',
      estimatedCompletionTime: new Date('2024-05-01T01:00:00Z'),
      userConfig: { notify: true },
      validationWarnings: ['duplicate rows'],
      emptyRowsSkipped: 2,
    };

    const createdBatch = { id: 'batch-1', status: 'PENDING' };
    repositoryMock.create.mockResolvedValue(createdBatch);

    const result = await service.createBatch(input);

    expect(repositoryMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          importDate: input.importDate,
          filename: input.filename,
          fileSize: input.fileSize,
          fileChecksum: input.fileChecksum,
          totalRecords: input.totalRecords,
          successfulRecords: 0,
          failedRecords: 0,
          errorLogs: '[]',
          status: 'PENDING',
          createdBy: input.createdBy,
          estimatedCompletionTime: input.estimatedCompletionTime,
          processingStartTime: null,
          userConfig: JSON.stringify(input.userConfig),
          validationWarnings: JSON.stringify(input.validationWarnings),
          emptyRowsSkipped: input.emptyRowsSkipped,
        }),
      })
    );
    expect(result).toBe(createdBatch);
  });

  it('marks a batch as processing with a default start time', async () => {
    const service = createService();
    const batchId = 'batch-1';
    const updatedBatch = { id: batchId, status: 'PROCESSING' };
    repositoryMock.update.mockResolvedValue(updatedBatch);

    const result = await service.markBatchProcessing(batchId);

    expect(repositoryMock.update).toHaveBeenCalledTimes(1);
    const updateArg = repositoryMock.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: batchId });
    expect(updateArg.data.status).toBe('PROCESSING');
    expect(updateArg.data.processingStartTime).toBeInstanceOf(Date);
    expect(result).toBe(updatedBatch);
  });

  it('processes a CSV batch and updates completion metrics', async () => {
    const service = createService();
    const batchId = 'batch-1';
    const payload: any = {
      cases: Array.from({ length: 5 }, (_, index) => ({
        id: `case-${index}`,
        caseNumber: `CASE-${index}`,
        courtName: 'Central',
        filedDate: new Date('2024-01-01'),
        caseTypeId: 'type-1',
      })),
      activities: [{ id: 'activity-1', caseId: 'case-1', activityDate: new Date(), description: 'Filed' }],
      assignments: [{ id: 'assignment-1', caseId: 'case-1', judgeId: 'judge-1', isPrimary: true }],
    };

    csvServiceMock.importCaseData.mockResolvedValue({
      cases: 4,
      activities: 1,
      assignments: 1,
    });

    batchServiceMock.completeBatch.mockResolvedValue({ id: batchId, status: 'COMPLETED' });

    const options: ProcessCsvBatchOptions = {
      chunkSize: 100,
      totals: {
        totalRecords: 6,
        failedRecords: 2,
      },
      errorLogs: ['row 10 invalid'],
      validationWarnings: ['duplicate case-2'],
      completedAt: new Date('2024-05-01T02:00:00Z'),
      errorDetails: [
        {
          batchId,
          rowNumber: 10,
          errorType: 'VALIDATION',
          errorMessage: 'Invalid case number',
          severity: 'ERROR',
        },
      ],
    };

    const result = await service.processCsvBatch(batchId, payload, options);

    expect(csvServiceMock.importCaseData).toHaveBeenCalledWith(payload, {
      chunkSize: options.chunkSize,
    });

    expect(batchServiceMock.completeBatch).toHaveBeenCalledWith(
      batchId,
      expect.objectContaining({
        successfulRecords: 4,
        failedRecords: 2,
        errorLogs: options.errorLogs,
        completedAt: options.completedAt,
        validationWarnings: options.validationWarnings,
      }),
      options.errorDetails
    );

    expect(result).toEqual({
      batchId,
      totals: {
        totalRecords: 6,
        successfulRecords: 4,
        failedRecords: 2,
      },
      importResult: {
        cases: 4,
        activities: 1,
        assignments: 1,
      },
    });
  });

  it('processes a CSV batch with default totals when not provided', async () => {
    const service = createService();
    const batchId = 'batch-1';
    const payload: any = {
      cases: [{
        id: 'case-1',
        caseNumber: 'CASE-1',
        courtName: 'Central',
        filedDate: new Date('2024-01-01'),
        caseTypeId: 'type-1',
      }],
    };

    csvServiceMock.importCaseData.mockResolvedValue({
      cases: 1,
      activities: 0,
      assignments: 0,
    });

    batchServiceMock.completeBatch.mockResolvedValue({ id: batchId, status: 'COMPLETED' });

    const result = await service.processCsvBatch(batchId, payload, {});

    expect(batchServiceMock.completeBatch).toHaveBeenCalledWith(
      batchId,
      expect.objectContaining({
        successfulRecords: 1,
        failedRecords: 0,
      }),
      []
    );

    expect(result.totals).toEqual({
      totalRecords: 1,
      successfulRecords: 1,
      failedRecords: 0,
    });
  });

  it('fails a batch using the batch service', async () => {
    const service = createService();
    const batchId = 'batch-1';
    const errorLogs = ['fatal error'];
    batchServiceMock.failBatch.mockResolvedValue({ id: batchId, status: 'FAILED' });

    const result = await service.failBatch(batchId, errorLogs);

    expect(batchServiceMock.failBatch).toHaveBeenCalledWith(batchId, errorLogs);
    expect(result).toEqual({ id: batchId, status: 'FAILED' });
  });

  it('delegates CSV export streaming to the CSV service', async () => {
    const service = createService();
    async function* generator() {
      yield [{ id: 'case-1' }];
    }
    csvServiceMock.exportCasesForCsv.mockReturnValue(generator());

    const iterator = service.exportCasesForCsv({ courtName: 'Central' }, { pageSize: 100 });

    expect(csvServiceMock.exportCasesForCsv).toHaveBeenCalledWith({ courtName: 'Central' }, { pageSize: 100 });
    expect(iterator[Symbol.asyncIterator]).toBeDefined();
  });

  it('retrieves a batch by id using the batch service', async () => {
    const service = createService();
    const batchId = 'batch-123';
    const expected = { id: batchId, status: 'PENDING' };
    batchServiceMock.getBatchById.mockResolvedValue(expected);

    const result = await service.getBatchById(batchId, { includeErrorDetails: true });

    expect(batchServiceMock.getBatchById).toHaveBeenCalledWith(batchId, { includeErrorDetails: true });
    expect(result).toBe(expected);
  });

  it('retrieves recent batches using the batch service', async () => {
    const service = createService();
    const expected = [{ id: '1' }, { id: '2' }];
    batchServiceMock.getRecentBatches.mockResolvedValue(expected);

    const result = await service.getRecentBatches(5);

    expect(batchServiceMock.getRecentBatches).toHaveBeenCalledWith(5);
    expect(result).toBe(expected);
  });
});
