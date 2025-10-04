import { caseTypeRepository, CaseTypeRepository } from '@/repositories/caseTypeRepository';
import { BaseService, type ServiceContext } from './baseService';
import { NotFoundError } from './errors';

export class CaseTypeService extends BaseService<CaseTypeRepository> {
  constructor(repository: CaseTypeRepository = caseTypeRepository, context: ServiceContext = {}) {
    super(repository, context);
  }

  listActiveCaseTypes() {
    return this.execute(() => this.repository.findActive());
  }

  async getCaseTypeByCode(caseTypeCode: string) {
    const caseType = await this.execute(() => this.repository.findByCode(caseTypeCode));
    if (!caseType) {
      throw new NotFoundError(`Case type ${caseTypeCode} not found`, { caseTypeCode });
    }
    return caseType;
  }
}

export const caseTypeService = new CaseTypeService();
