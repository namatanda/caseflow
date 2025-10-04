import { judgeRepository, JudgeRepository } from '@/repositories/judgeRepository';
import { BaseService, type ServiceContext } from './baseService';
import { NotFoundError } from './errors';

export class JudgeService extends BaseService<JudgeRepository> {
  constructor(repository: JudgeRepository = judgeRepository, context: ServiceContext = {}) {
    super(repository, context);
  }

  getActiveJudges(options?: Parameters<JudgeRepository['findActive']>[0]) {
    return this.execute(() => this.repository.findActive(options));
  }

  async getJudgeByFullName(fullName: string) {
    const judge = await this.execute(() => this.repository.findByFullName(fullName));
    if (!judge) {
      throw new NotFoundError(`Judge ${fullName} not found`, { fullName });
    }
    return judge;
  }

  searchJudges(term: string) {
    return this.execute(() => this.repository.search(term));
  }
}

export const judgeService = new JudgeService();
