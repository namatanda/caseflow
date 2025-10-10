import type { Prisma } from '@prisma/client';

import { prisma } from '@/config/database';
import { BaseRepository } from './baseRepository';

type PartyDelegate = typeof prisma.party;

export class PartyRepository extends BaseRepository<PartyDelegate> {
  constructor(delegate: PartyDelegate = prisma.party) {
    super(delegate);
  }

  async createMany(records: Prisma.PartyCreateManyInput[]) {
    if (records.length === 0) {
      return { count: 0 };
    }

    return this.delegate.createMany({
      data: records,
      skipDuplicates: true,
    });
  }
}

export const partyRepository = new PartyRepository();