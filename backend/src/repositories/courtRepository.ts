import type { Prisma } from '@prisma/client';

import { prisma } from '@/config/database';
import { BaseRepository } from './baseRepository';

const defaultInclude = {
  originalCases: false,
} satisfies Prisma.CourtInclude;

type CourtDelegate = typeof prisma.court;

export class CourtRepository extends BaseRepository<CourtDelegate> {
  constructor(delegate: CourtDelegate = prisma.court) {
    super(delegate);
  }

  async findByCode(
    courtCode: string,
    options: { includeInactive?: boolean; include?: Prisma.CourtInclude } = {}
  ) {
    const { includeInactive = false, include = defaultInclude } = options;

    return this.delegate.findFirst({
      where: {
        courtCode,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include,
    });
  }

  async findByName(
    courtName: string,
    options: { includeInactive?: boolean; include?: Prisma.CourtInclude } = {}
  ) {
    const { includeInactive = false, include = defaultInclude } = options;

    return this.delegate.findFirst({
      where: {
        courtName,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include,
    });
  }

  async findActive(options: { include?: Prisma.CourtInclude } = {}) {
    const { include = defaultInclude } = options;

    return this.findMany({
      where: { isActive: true },
      orderBy: { courtName: 'asc' },
      include,
    } satisfies Prisma.CourtFindManyArgs);
  }

  async searchByName(query: string) {
    const term = query.trim();
    if (!term) {
      return [] as Prisma.CourtGetPayload<{ select: { id: true } }>[];
    }

    return this.findMany({
      where: {
        OR: [
          { courtName: { contains: term } },
          { courtCode: { contains: term } },
        ],
        isActive: true,
      },
      take: 20,
      orderBy: { courtName: 'asc' },
    } satisfies Prisma.CourtFindManyArgs);
  }
}

export const courtRepository = new CourtRepository();
