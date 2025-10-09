import type { CaseStatus, Prisma } from '@prisma/client';

import { prisma } from '@/config/database';
import { BaseRepository } from './baseRepository';

type CaseDelegate = typeof prisma.case;

export interface CaseSearchParams {
  courtName?: string;
  caseTypeId?: string;
  status?: CaseStatus;
  filedFrom?: Date;
  filedTo?: Date;
}

export interface CaseSearchPagination {
  page?: number;
  pageSize?: number;
}

export interface CaseSearchOptions {
  include?: Prisma.CaseInclude;
}

export class CaseRepository extends BaseRepository<CaseDelegate> {
  constructor(delegate: CaseDelegate = prisma.case) {
    super(delegate);
  }

  findByCaseNumber(caseNumber: string, courtName: string, include?: Prisma.CaseInclude) {
    return this.delegate.findUnique({
      where: {
        case_number_court_unique: {
          caseNumber,
          courtName,
        },
      },
      include: include ?? null,
    });
  }

  findRecent(limit = 20, include?: Prisma.CaseInclude) {
    return this.delegate.findMany({
      include: include ?? null,
      orderBy: { filedDate: 'desc' },
      take: limit,
    });
  }

  async createMany(records: Prisma.CaseCreateManyInput[]) {
    if (records.length === 0) {
      return { count: 0 };
    }

    return this.delegate.createMany({
      data: records,
      skipDuplicates: true, // avoid aborting the batch when the CSV repeats a case
    });
  }

  async search(
    params: CaseSearchParams,
    pagination: CaseSearchPagination = {},
    options: CaseSearchOptions = {}
  ) {
    const { courtName, caseTypeId, status, filedFrom, filedTo } = params;

    const where: Prisma.CaseWhereInput = {
      ...(courtName ? { courtName } : {}),
      ...(caseTypeId ? { caseTypeId } : {}),
      ...(status ? { status } : {}),
      ...(filedFrom || filedTo
        ? {
            filedDate: {
              ...(filedFrom ? { gte: filedFrom } : {}),
              ...(filedTo ? { lte: filedTo } : {}),
            },
          }
        : {}),
    };

    return this.findPaginated({
      args: {
        where,
        orderBy: { filedDate: 'desc' },
        include: options.include ?? { caseType: true },
      },
      ...(typeof pagination.page === 'number' ? { page: pagination.page } : {}),
      ...(typeof pagination.pageSize === 'number' ? { pageSize: pagination.pageSize } : {}),
    });
  }
}

export const caseRepository = new CaseRepository();
