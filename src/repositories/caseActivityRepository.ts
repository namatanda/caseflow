import type { Prisma } from '@prisma/client';

import { prisma } from '@/config/database';
import { BaseRepository } from './baseRepository';

type CaseActivityDelegate = typeof prisma.caseActivity;

type CaseActivityQueryOptions = Partial<Pick<Prisma.CaseActivityFindManyArgs, 'select' | 'include' | 'where' | 'take'>>;

export class CaseActivityRepository extends BaseRepository<CaseActivityDelegate> {
  constructor(delegate: CaseActivityDelegate = prisma.caseActivity) {
    super(delegate);
  }

  findByCaseId(caseId: string, options: CaseActivityQueryOptions = {}) {
    return this.findMany({
      ...options,
      where: {
        ...(options.where ?? {}),
        caseId,
      },
      orderBy: { activityDate: 'desc' },
    } satisfies Prisma.CaseActivityFindManyArgs);
  }

  findLatest(caseId: string) {
    return this.delegate.findFirst({
      where: { caseId },
      orderBy: { activityDate: 'desc' },
    });
  }

  async createMany(records: Prisma.CaseActivityCreateManyInput[], options: { skipDuplicates?: boolean } = {}) {
    if (records.length === 0) {
      return { count: 0 };
    }

    return this.delegate.createMany({
      data: records,
      skipDuplicates: options.skipDuplicates ?? true,
    });
  }
}

export const caseActivityRepository = new CaseActivityRepository();
