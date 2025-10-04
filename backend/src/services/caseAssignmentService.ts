import { caseJudgeAssignmentRepository, CaseJudgeAssignmentRepository } from '@/repositories/caseJudgeAssignmentRepository';
import { BaseService, type ServiceContext } from './baseService';

export class CaseAssignmentService extends BaseService<CaseJudgeAssignmentRepository> {
  constructor(repository: CaseJudgeAssignmentRepository = caseJudgeAssignmentRepository, context: ServiceContext = {}) {
    super(repository, context);
  }

  listAssignments(caseId: string) {
    return this.execute(() => this.repository.findByCaseId(caseId));
  }

  assignJudge(caseId: string, judgeId: string, isPrimary = false) {
    return this.execute(() => this.repository.upsertAssignment(caseId, judgeId, isPrimary));
  }

  clearPrimaryAssignments(caseId: string) {
    return this.execute(() => this.repository.clearPrimaryAssignments(caseId));
  }
}

export const caseAssignmentService = new CaseAssignmentService();
