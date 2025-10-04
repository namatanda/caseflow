import { importErrorDetailRepository, ImportErrorDetailRepository } from '@/repositories/importErrorDetailRepository';
import { BaseService, type ServiceContext } from './baseService';

export class ImportErrorDetailService extends BaseService<ImportErrorDetailRepository> {
  constructor(repository: ImportErrorDetailRepository = importErrorDetailRepository, context: ServiceContext = {}) {
    super(repository, context);
  }

  listByBatch(batchId: string) {
    return this.execute(() => this.repository.findByBatchId(batchId));
  }

  createMany(details: Parameters<ImportErrorDetailRepository['createMany']>[0]) {
    return this.execute(() => this.repository.createMany(details));
  }
}

export const importErrorDetailService = new ImportErrorDetailService();
