import { ErrorSeverity } from '@prisma/client';
import { describe, it, expect, beforeEach } from 'vitest';

import { ImportErrorDetailRepository } from '../../repositories/importErrorDetailRepository';
import { createInMemoryCrudDelegate } from '../mocks/inMemoryCrudDelegate';

type ImportErrorDetailEntity = {
  id: string;
  batchId: string;
  rowNumber: number;
  errorType: string;
  errorMessage: string;
  severity: ErrorSeverity;
};

const createDelegate = () => createInMemoryCrudDelegate<ImportErrorDetailEntity>();

describe('ImportErrorDetailRepository', () => {
  let delegate: ReturnType<typeof createDelegate>;

  beforeEach(() => {
    delegate = createDelegate();
  });

  it('returns zero count without calling the delegate when details are empty', async () => {
    const repository = new ImportErrorDetailRepository(delegate as any);

    const result = await repository.createMany([]);

    expect(result).toEqual({ count: 0 });
    expect(delegate.createMany).not.toHaveBeenCalled();
    expect(delegate.store).toEqual([]);
  });

  it('creates error detail records with skipDuplicates enabled', async () => {
    const repository = new ImportErrorDetailRepository(delegate as any);

    const details = [
      {
        id: 'detail-1',
        batchId: 'batch-1',
        rowNumber: 1,
        errorType: 'VALIDATION',
        errorMessage: 'Invalid case number',
        severity: ErrorSeverity.ERROR,
      },
      {
        id: 'detail-2',
        batchId: 'batch-1',
        rowNumber: 2,
        errorType: 'VALIDATION',
        errorMessage: 'Missing judge assignment',
        severity: ErrorSeverity.WARNING,
      },
    ];

    const result = await repository.createMany(details);

    expect(delegate.createMany).toHaveBeenCalledWith({
      data: details,
      skipDuplicates: true,
    });
    expect(result).toEqual({ count: 2 });
    expect(delegate.store).toEqual(details);
  });
});
