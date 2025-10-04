import type { Prisma } from '@prisma/client';
import { ImportStatus } from '@prisma/client';

type ImportStatusEnum = (typeof ImportStatus)[keyof typeof ImportStatus];

import { prisma } from '@/config/database';
import { BaseRepository } from './baseRepository';

type DailyImportBatchDelegate = typeof prisma.dailyImportBatch;

export class DailyImportBatchRepository extends BaseRepository<DailyImportBatchDelegate> {
  constructor(delegate: DailyImportBatchDelegate = prisma.dailyImportBatch) {
    super(delegate);
  }

  findRecent(limit = 10) {
    return this.delegate.findMany({
      orderBy: { importDate: 'desc' },
      take: limit,
      include: {
        activities: false,
        user: true,
      },
    });
  }

  findByStatus(status: ImportStatusEnum) {
    return this.findMany({
      where: { status },
      orderBy: { importDate: 'desc' },
    } satisfies Prisma.DailyImportBatchFindManyArgs);
  }

  findByIdWithDetails(id: string, options: { includeErrorDetails?: boolean } = {}) {
    const include = options.includeErrorDetails
      ? { user: true, errorDetails: true }
      : { user: true, errorDetails: false };

    return this.delegate.findUnique({
      where: { id },
      include,
    });
  }

  async markCompleted(id: string, data: Partial<Prisma.DailyImportBatchUpdateInput>) {
    return this.delegate.update({
      where: { id },
      data: {
        status: ImportStatus.COMPLETED,
        ...data,
        completedAt: data.completedAt ?? new Date(),
      },
    });
  }
}

export const dailyImportBatchRepository = new DailyImportBatchRepository();
