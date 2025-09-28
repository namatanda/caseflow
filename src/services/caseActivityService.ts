import { caseActivityRepository, CaseActivityRepository } from '@/repositories/caseActivityRepository';
import { BaseService, type ServiceContext } from './baseService';
import { NotFoundError } from './errors';

export class CaseActivityService extends BaseService<CaseActivityRepository> {
  constructor(repository: CaseActivityRepository = caseActivityRepository, context: ServiceContext = {}) {
    super(repository, context);
  }

  listActivities(caseId: string) {
    return this.execute(() => this.repository.findByCaseId(caseId));
  }

  async getLatestActivity(caseId: string) {
    const activity = await this.execute(() => this.repository.findLatest(caseId));
    if (!activity) {
      throw new NotFoundError('Case activity not found', { caseId });
    }
    return activity;
  }
}

export const caseActivityService = new CaseActivityService();
