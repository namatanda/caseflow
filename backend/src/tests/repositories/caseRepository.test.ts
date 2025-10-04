import { describe, it, expect, beforeEach } from 'vitest';

import { CaseRepository } from '../../repositories/caseRepository';

import { createInMemoryCrudDelegate } from '../mocks/inMemoryCrudDelegate';

type CaseEntity = {
  id: string;
  caseNumber: string;
  courtName: string;
  filedDate: Date;
  caseTypeId: string;
};

describe('CaseRepository', () => {
  const delegate = createInMemoryCrudDelegate<CaseEntity>();

  beforeEach(() => {
    delegate.reset();
  });

  it('returns zero count when createMany receives no records', async () => {
    const repository = new CaseRepository(delegate);

    const result = await repository.createMany([]);

    expect(result).toEqual({ count: 0 });
    expect(delegate.createMany).not.toHaveBeenCalled();
    expect(delegate.store).toEqual([]);
  });

  it('creates multiple records during bulk inserts', async () => {
    const repository = new CaseRepository(delegate);

    const records = [
      { id: 'case-1', caseNumber: 'CASE-1', courtName: 'Central', filedDate: new Date(), caseTypeId: 'type-1', parties: JSON.stringify({ applicants: [], defendants: [] }) },
      { id: 'case-2', caseNumber: 'CASE-2', courtName: 'Central', filedDate: new Date(), caseTypeId: 'type-1', parties: JSON.stringify({ applicants: [], defendants: [] }) },
    ];

    const result = await repository.createMany(records);

    expect(delegate.createMany).toHaveBeenCalledWith({
      data: records,
    });
    expect(result).toEqual({ count: 2 });
    expect(delegate.store).toEqual(records);
  });
});
