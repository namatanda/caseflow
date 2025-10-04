import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  baseCaseRepository,
  transactionalCaseRepository,
  transactionalActivityRepository,
  transactionalAssignmentRepository,
  caseRepositoryConstructor,
  activityRepositoryConstructor,
  assignmentRepositoryConstructor,
} = vi.hoisted(() => {
  const transactionalCaseRepository = {
    createMany: vi.fn(),
  };

  const transactionalActivityRepository = {
    createMany: vi.fn(),
  };

  const transactionalAssignmentRepository = {
    createMany: vi.fn(),
  };

  const baseCaseRepository = {
    transaction: vi.fn(),
    search: vi.fn(),
  };

  return {
    baseCaseRepository,
    transactionalCaseRepository,
    transactionalActivityRepository,
    transactionalAssignmentRepository,
    caseRepositoryConstructor: vi.fn(() => transactionalCaseRepository),
    activityRepositoryConstructor: vi.fn(() => transactionalActivityRepository),
    assignmentRepositoryConstructor: vi.fn(() => transactionalAssignmentRepository),
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

vi.mock('@/repositories/caseRepository', () => ({
  CaseRepository: caseRepositoryConstructor,
  caseRepository: baseCaseRepository,
}));

vi.mock('@/repositories/caseActivityRepository', () => ({
  CaseActivityRepository: activityRepositoryConstructor,
}));

vi.mock('@/repositories/caseJudgeAssignmentRepository', () => ({
  CaseJudgeAssignmentRepository: assignmentRepositoryConstructor,
}));

import { CaseCsvService } from '../../services/caseCsvService';

describe('CaseCsvService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('imports case data in chunks inside a transaction', async () => {
    const service = new CaseCsvService();
    const txMock = {
      case: Symbol('caseDelegate'),
      caseActivity: Symbol('activityDelegate'),
      caseJudgeAssignment: Symbol('assignmentDelegate'),
    } as any;

    baseCaseRepository.transaction.mockImplementation(async (operation: (tx: typeof txMock) => Promise<any>) =>
      operation(txMock)
    );

    transactionalCaseRepository.createMany.mockImplementation(async (records: unknown[]) => ({ count: records.length }));
    transactionalActivityRepository.createMany.mockImplementation(async (records: unknown[]) => ({ count: records.length }));
    transactionalAssignmentRepository.createMany.mockImplementation(async (records: unknown[]) => ({ count: records.length }));

    const payload = {
      cases: [
        { id: 'case-1', caseNumber: 'CASE-1', courtName: 'Central', filedDate: new Date(), caseTypeId: 'type-1' },
        { id: 'case-2', caseNumber: 'CASE-2', courtName: 'Central', filedDate: new Date(), caseTypeId: 'type-1' },
        { id: 'case-3', caseNumber: 'CASE-3', courtName: 'Central', filedDate: new Date(), caseTypeId: 'type-1' },
      ],
      activities: [
        { id: 'activity-1', caseId: 'case-1', activityDate: new Date(), description: 'Filed' },
        { id: 'activity-2', caseId: 'case-2', activityDate: new Date(), description: 'Reviewed' },
      ],
      assignments: [
        { id: 'assignment-1', caseId: 'case-1', judgeId: 'judge-1', isPrimary: true },
      ],
    };

    const result = await service.importCaseData(payload, { chunkSize: 2, skipDuplicates: false });

    expect(baseCaseRepository.transaction).toHaveBeenCalledTimes(1);
    expect(caseRepositoryConstructor).toHaveBeenCalledWith(txMock.case);
    expect(activityRepositoryConstructor).toHaveBeenCalledWith(txMock.caseActivity);
    expect(assignmentRepositoryConstructor).toHaveBeenCalledWith(txMock.caseJudgeAssignment);

    expect(transactionalCaseRepository.createMany).toHaveBeenCalledTimes(2);
    expect(transactionalActivityRepository.createMany).toHaveBeenCalledTimes(1);
    expect(transactionalAssignmentRepository.createMany).toHaveBeenCalledTimes(1);

    expect(result).toEqual({ cases: 3, activities: 2, assignments: 1 });
  });

  it('yields paginated case data for CSV export', async () => {
    const service = new CaseCsvService();

    baseCaseRepository.search
      .mockResolvedValueOnce({
        data: [{ id: 'case-1' }, { id: 'case-2' }],
        total: 3,
        page: 1,
        pageSize: 2,
        pageCount: 2,
      })
      .mockResolvedValueOnce({
        data: [{ id: 'case-3' }],
        total: 3,
        page: 2,
        pageSize: 2,
        pageCount: 2,
      });

    const iterator = service.exportCasesForCsv({}, { pageSize: 2, include: { court: true } });

    const firstBatch = await iterator.next();
    const secondBatch = await iterator.next();
    const done = await iterator.next();

    expect(firstBatch.value).toEqual([{ id: 'case-1' }, { id: 'case-2' }]);
    expect(secondBatch.value).toEqual([{ id: 'case-3' }]);
    expect(done.done).toBe(true);

    expect(baseCaseRepository.search).toHaveBeenNthCalledWith(1, {}, { page: 1, pageSize: 2 }, { include: { court: true } });
    expect(baseCaseRepository.search).toHaveBeenNthCalledWith(2, {}, { page: 2, pageSize: 2 }, { include: { court: true } });
  });
});
