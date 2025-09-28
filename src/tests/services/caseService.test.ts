import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { CaseService } from '../../services/caseService';
import { NotFoundError } from '../../services/errors';

describe('CaseService', () => {
  const createRepositories = () => ({
    caseRepository: {
      search: vi.fn(),
      findByCaseNumber: vi.fn(),
    },
    activityRepository: {
      findByCaseId: vi.fn(),
    },
    assignmentRepository: {
      findByCaseId: vi.fn(),
    },
  });

  let repositories: ReturnType<typeof createRepositories>;
  let service: CaseService;

  beforeEach(() => {
    repositories = createRepositories();
    service = new CaseService(
      repositories.caseRepository as any,
      repositories.activityRepository as any,
      repositories.assignmentRepository as any
    );
    vi.clearAllMocks();
  });

  it('throws NotFoundError when a case cannot be found by number', async () => {
    repositories.caseRepository.findByCaseNumber.mockResolvedValue(null);

    await expect(service.getCaseByNumber('CASE-2024', 'Central Court')).rejects.toThrow(NotFoundError);
    expect(repositories.caseRepository.findByCaseNumber).toHaveBeenCalledWith('CASE-2024', 'Central Court', undefined);
  });

  it('returns case details without fetching optional relations when disabled', async () => {
    const caseRecord = { id: 'case-1', caseNumber: 'CASE-1' };
    repositories.caseRepository.findByCaseNumber.mockResolvedValue(caseRecord);

    const result = await service.getCaseDetails('CASE-1', 'Central Court', {
      includeActivities: false,
      includeAssignments: false,
    });

    expect(result).toEqual({
      case: caseRecord,
      activities: [],
      assignments: [],
    });
    expect(repositories.activityRepository.findByCaseId).not.toHaveBeenCalled();
    expect(repositories.assignmentRepository.findByCaseId).not.toHaveBeenCalled();
  });

  it('fetches case details with activities and assignments by default', async () => {
    const caseRecord = { id: 'case-2', caseNumber: 'CASE-2' };
    const activities = [{ id: 'activity-1' }];
    const assignments = [{ id: 'assignment-1' }];

    repositories.caseRepository.findByCaseNumber.mockResolvedValue(caseRecord);
    repositories.activityRepository.findByCaseId.mockResolvedValue(activities);
    repositories.assignmentRepository.findByCaseId.mockResolvedValue(assignments);

    const result = await service.getCaseDetails('CASE-2', 'Central Court');

    expect(repositories.activityRepository.findByCaseId).toHaveBeenCalledWith(caseRecord.id, { take: 100 });
    expect(repositories.assignmentRepository.findByCaseId).toHaveBeenCalledWith(caseRecord.id);
    expect(result).toEqual({
      case: caseRecord,
      activities,
      assignments,
    });
  });
});
