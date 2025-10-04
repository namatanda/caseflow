import type { Prisma } from '@prisma/client';

import {
  CaseRepository,
  caseRepository,
  type CaseSearchParams,
  type CaseSearchOptions,
} from '@/repositories/caseRepository';
import { CaseActivityRepository } from '@/repositories/caseActivityRepository';
import { CaseJudgeAssignmentRepository } from '@/repositories/caseJudgeAssignmentRepository';
import { chunkArray } from '@/utils/chunk';
import { BaseService, type ServiceContext } from './baseService';

export interface CaseCsvImportPayload {
  cases: Prisma.CaseCreateManyInput[];
  activities?: Prisma.CaseActivityCreateManyInput[];
  assignments?: Prisma.CaseJudgeAssignmentCreateManyInput[];
}

export interface CaseCsvImportOptions {
  chunkSize?: number;
}

export interface CaseCsvExportOptions {
  pageSize?: number;
  include?: Prisma.CaseInclude;
}

export class CaseCsvService extends BaseService<CaseRepository> {
  constructor(repository: CaseRepository = caseRepository, context: ServiceContext = {}) {
    super(repository, context);
  }

  async importCaseData(payload: CaseCsvImportPayload, options: CaseCsvImportOptions = {}) {
    const { chunkSize = 500 } = options;

    return this.runInTransaction(async (tx) => {
      const transactionalCaseRepo = new CaseRepository(tx.case);
      const transactionalActivityRepo = new CaseActivityRepository(tx.caseActivity);
      const transactionalAssignmentRepo = new CaseJudgeAssignmentRepository(tx.caseJudgeAssignment);

      let createdCases = 0;
      let createdActivities = 0;
      let createdAssignments = 0;

      for (const chunk of chunkArray(payload.cases, chunkSize)) {
        const result = await transactionalCaseRepo.createMany(chunk);
        createdCases += result.count;
      }

      if (payload.activities?.length) {
        for (const chunk of chunkArray(payload.activities, chunkSize)) {
          const result = await transactionalActivityRepo.createMany(chunk);
          createdActivities += result.count;
        }
      }

      if (payload.assignments?.length) {
        for (const chunk of chunkArray(payload.assignments, chunkSize)) {
          const result = await transactionalAssignmentRepo.createMany(chunk);
          createdAssignments += result.count;
        }
      }

      return {
        cases: createdCases,
        activities: createdActivities,
        assignments: createdAssignments,
      };
    });
  }

  async *exportCasesForCsv(
    params: CaseSearchParams = {},
    options: CaseCsvExportOptions = {}
  ): AsyncGenerator<Prisma.CaseGetPayload<{ include: Prisma.CaseInclude }>[]>
  {
    const pageSize = options.pageSize ?? 500;
    let page = 1;

    while (true) {
      const searchOptions: CaseSearchOptions = options.include ? { include: options.include } : {};

      const result = await this.repository.search(
        params,
        { page, pageSize },
        searchOptions
      );

      if (result.data.length === 0) {
        break;
      }

      yield result.data as Prisma.CaseGetPayload<{ include: Prisma.CaseInclude }>[];

      if (result.data.length < pageSize) {
        break;
      }

      page += 1;
    }
  }
}

export const caseCsvService = new CaseCsvService();
