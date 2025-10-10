import type { Prisma } from '@prisma/client';

import { partyRepository, PartyRepository } from '@/repositories/partyRepository';
import { BaseService, type ServiceContext } from './baseService';

export class PartyService extends BaseService<PartyRepository> {
  constructor(repository: PartyRepository = partyRepository, context: ServiceContext = {}) {
    super(repository, context);
  }

  async createMany(records: Prisma.PartyCreateManyInput[]) {
    return this.execute(() => this.repository.createMany(records));
  }
}

export const partyService = new PartyService();