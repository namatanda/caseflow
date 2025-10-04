import type { CaseStatus, Prisma } from '@prisma/client';

import { caseRepository, CaseRepository } from '@/repositories/caseRepository';
import {
  caseActivityRepository,
  CaseActivityRepository,
} from '@/repositories/caseActivityRepository';
import {
  caseJudgeAssignmentRepository,
  CaseJudgeAssignmentRepository,
} from '@/repositories/caseJudgeAssignmentRepository';
import { BaseService, type ServiceContext } from './baseService';
import { NotFoundError } from './errors';

export interface CaseDetailOptions {
  includeActivities?: boolean;
  includeAssignments?: boolean;
  include?: Prisma.CaseInclude;
}

export interface CaseSearchParams {
  courtName?: string;
  caseTypeId?: string;
  status?: CaseStatus;
  filedFrom?: Date;
  filedTo?: Date;
}

export class CaseService extends BaseService<CaseRepository> {
  private readonly activityRepository: CaseActivityRepository;
  private readonly assignmentRepository: CaseJudgeAssignmentRepository;

  constructor(
    repository: CaseRepository = caseRepository,
    activityRepository: CaseActivityRepository = caseActivityRepository,
    assignmentRepository: CaseJudgeAssignmentRepository = caseJudgeAssignmentRepository,
    context: ServiceContext = {}
  ) {
    super(repository, context);
    this.activityRepository = activityRepository;
    this.assignmentRepository = assignmentRepository;
  }

  searchCases(params: CaseSearchParams, pagination?: { page?: number; pageSize?: number }) {
    return this.execute(() => this.repository.search(params, pagination));
  }

  async getCaseByNumber(caseNumber: string, courtName: string, include?: Prisma.CaseInclude) {
    const result = await this.execute(() => this.repository.findByCaseNumber(caseNumber, courtName, include));

    if (!result) {
      throw new NotFoundError('Case not found', { caseNumber, courtName });
    }

    return result;
  }

  async getCaseDetails(caseNumber: string, courtName: string, options: CaseDetailOptions = {}) {
    const { includeActivities = true, includeAssignments = true, include } = options;

    return this.execute(async () => {
      const caseRecord = await this.repository.findByCaseNumber(caseNumber, courtName, include);

      if (!caseRecord) {
        throw new NotFoundError('Case not found', { caseNumber, courtName });
      }

      const emptyActivities = [] as Awaited<ReturnType<CaseActivityRepository['findByCaseId']>>;
      const emptyAssignments = [] as Awaited<ReturnType<CaseJudgeAssignmentRepository['findByCaseId']>>;

      const [activities, assignments] = await Promise.all([
        includeActivities
          ? this.activityRepository.findByCaseId(caseRecord.id, { take: 100 })
          : Promise.resolve(emptyActivities),
        includeAssignments
          ? this.assignmentRepository.findByCaseId(caseRecord.id)
          : Promise.resolve(emptyAssignments),
      ]);

      return {
        case: caseRecord,
        activities,
        assignments,
      };
    });
  }
}

export const caseService = new CaseService();
