import { describe, it, expect, vi, beforeEach } from 'vitest';

import { CaseRepository } from '@/repositories/caseRepository';

describe('CaseRepository', () => {
  const delegate = {
    createMany: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns zero count when createMany receives no records', async () => {
    const repository = new CaseRepository(delegate);

    const result = await repository.createMany([]);

    expect(result).toEqual({ count: 0 });
    expect(delegate.createMany).not.toHaveBeenCalled();
  });

  it('uses skipDuplicates by default during bulk inserts', async () => {
    const repository = new CaseRepository(delegate);
    delegate.createMany.mockResolvedValue({ count: 2 });

    const records = [
      { id: 'case-1', caseNumber: 'CASE-1', courtName: 'Central', filedDate: new Date(), caseTypeId: 'type-1' },
      { id: 'case-2', caseNumber: 'CASE-2', courtName: 'Central', filedDate: new Date(), caseTypeId: 'type-1' },
    ];

    const result = await repository.createMany(records);

    expect(delegate.createMany).toHaveBeenCalledWith({
      data: records,
      skipDuplicates: true,
    });
    expect(result).toEqual({ count: 2 });
  });
});
