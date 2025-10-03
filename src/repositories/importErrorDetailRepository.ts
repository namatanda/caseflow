import type { Prisma } from '@prisma/client';

import { prisma } from '@/config/database';
import { BaseRepository } from './baseRepository';

type ImportErrorDetailDelegate = typeof prisma.importErrorDetail;

export class ImportErrorDetailRepository extends BaseRepository<ImportErrorDetailDelegate> {
  constructor(delegate: ImportErrorDetailDelegate = prisma.importErrorDetail) {
    super(delegate);
  }

  findByBatchId(batchId: string) {
    return this.findMany({
      where: { batchId },
      orderBy: { rowNumber: 'asc' },
    } satisfies Prisma.ImportErrorDetailFindManyArgs);
  }

  async createMany(details: Prisma.ImportErrorDetailCreateManyInput[]) {
    if (details.length === 0) {
      return { count: 0 };
    }

    return this.delegate.createMany({
      data: details,
    });
  }
}

export const importErrorDetailRepository = new ImportErrorDetailRepository();
