import type { Prisma } from '@prisma/client';

import { prisma } from '@/config/database';
import { BaseRepository } from './baseRepository';

type CaseTypeDelegate = typeof prisma.caseType;

export class CaseTypeRepository extends BaseRepository<CaseTypeDelegate> {
  constructor(delegate: CaseTypeDelegate = prisma.caseType) {
    super(delegate);
  }

  findActive(options: Partial<Pick<Prisma.CaseTypeFindManyArgs, 'include' | 'select'>> = {}) {
    return this.findMany({
      ...options,
      where: {
        isActive: true,
      },
      orderBy: { caseTypeName: 'asc' },
    } satisfies Prisma.CaseTypeFindManyArgs);
  }

  findByCode(caseTypeCode: string) {
    return this.delegate.findUnique({
      where: {
        caseTypeCode,
      },
    });
  }
}

export const caseTypeRepository = new CaseTypeRepository();
