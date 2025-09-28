import { ErrorSeverity } from '@prisma/client';
import { describe, it, expect, vi } from 'vitest';

import { ImportErrorDetailRepository } from '../../repositories/importErrorDetailRepository';

const createDelegate = () => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  count: vi.fn(),
  createMany: vi.fn(),
});

describe('ImportErrorDetailRepository', () => {
  it('returns zero count without calling the delegate when details are empty', async () => {
    const delegate = createDelegate();
    const repository = new ImportErrorDetailRepository(delegate as any);

    const result = await repository.createMany([]);

    expect(result).toEqual({ count: 0 });
    expect(delegate.createMany).not.toHaveBeenCalled();
  });

  it('creates error detail records with skipDuplicates enabled', async () => {
    const delegate = createDelegate();
    delegate.createMany.mockResolvedValue({ count: 2 });
    const repository = new ImportErrorDetailRepository(delegate as any);

    const details = [
      {
        batchId: 'batch-1',
        rowNumber: 1,
        errorType: 'VALIDATION',
        errorMessage: 'Invalid case number',
        severity: ErrorSeverity.ERROR,
      },
      {
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
  });
});
