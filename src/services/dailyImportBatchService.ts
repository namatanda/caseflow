import type { Prisma } from '@prisma/client';
import { ImportStatus } from '@prisma/client';

import {
  dailyImportBatchRepository,
  DailyImportBatchRepository,
} from '@/repositories/dailyImportBatchRepository';
import { ImportErrorDetailRepository } from '@/repositories/importErrorDetailRepository';
import { BaseService, type ServiceContext } from './baseService';

export interface CompleteBatchOptions {
  successfulRecords: number;
  failedRecords: number;
  errorLogs?: Prisma.InputJsonValue;
  completedAt?: Date;
  validationWarnings?: Prisma.InputJsonValue;
}

export class DailyImportBatchService extends BaseService<DailyImportBatchRepository> {
  constructor(
    repository: DailyImportBatchRepository = dailyImportBatchRepository,
    context: ServiceContext = {}
  ) {
    super(repository, context);
  }

  getRecentBatches(limit = 10) {
    return this.execute(() => this.repository.findRecent(limit));
  }

  getBatchesByStatus(status: (typeof ImportStatus)[keyof typeof ImportStatus]) {
    return this.execute(() => this.repository.findByStatus(status));
  }

  getBatchById(id: string, options: { includeErrorDetails?: boolean } = {}) {
    return this.execute(() => this.repository.findById(id, options));
  }

  completeBatch(
    batchId: string,
    options: CompleteBatchOptions,
    errorDetails: Prisma.ImportErrorDetailCreateManyInput[] = []
  ) {
    return this.runInTransaction(async (tx) => {
      const batch = await tx.dailyImportBatch.update({
        where: { id: batchId },
        data: {
          status: ImportStatus.COMPLETED,
          successfulRecords: options.successfulRecords,
          failedRecords: options.failedRecords,
          errorLogs: options.errorLogs ?? [],
          completedAt: options.completedAt ?? new Date(),
          validationWarnings: options.validationWarnings ?? [],
        },
      });

      if (errorDetails.length > 0) {
        const transactionalErrorRepo = new ImportErrorDetailRepository(tx.importErrorDetail);
        await transactionalErrorRepo.createMany(errorDetails);
      }

      return batch;
    });
  }

  failBatch(batchId: string, errorLogs: Prisma.InputJsonValue) {
    return this.execute(() =>
      this.repository.transaction((tx) =>
        tx.dailyImportBatch.update({
          where: { id: batchId },
          data: {
            status: ImportStatus.FAILED,
            errorLogs,
            completedAt: new Date(),
          },
        })
      )
    );
  }
}

export const dailyImportBatchService = new DailyImportBatchService();
