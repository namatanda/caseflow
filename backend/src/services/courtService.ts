import type { Prisma } from '@prisma/client';

import { courtRepository, CourtRepository } from '@/repositories/courtRepository';
import { BaseService, type ServiceContext } from './baseService';
import { NotFoundError } from './errors';

export class CourtService extends BaseService<CourtRepository> {
  constructor(repository: CourtRepository = courtRepository, context: ServiceContext = {}) {
    super(repository, context);
  }

  getActiveCourts(include?: Prisma.CourtInclude) {
    const options =
      typeof include === 'undefined'
        ? undefined
        : ({ include } as { include: Prisma.CourtInclude });

    return this.execute(() => this.repository.findActive(options));
  }

  async getCourtByCode(courtCode: string, options?: { includeInactive?: boolean; include?: Prisma.CourtInclude }) {
    const court = await this.execute(() => this.repository.findByCode(courtCode, options));
    if (!court) {
      throw new NotFoundError(`Court with code ${courtCode} not found`, {
        courtCode,
      });
    }
    return court;
  }

  searchCourts(term: string) {
    return this.execute(() => this.repository.searchByName(term));
  }
}

export const courtService = new CourtService();
