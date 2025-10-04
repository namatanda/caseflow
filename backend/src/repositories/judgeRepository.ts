import type { Prisma } from '@prisma/client';

import { prisma } from '@/config/database';
import { BaseRepository } from './baseRepository';

type JudgeDelegate = typeof prisma.judge;

type JudgeQueryOptions = Partial<Pick<Prisma.JudgeFindManyArgs, 'select' | 'include' | 'where'>>;

export class JudgeRepository extends BaseRepository<JudgeDelegate> {
  constructor(delegate: JudgeDelegate = prisma.judge) {
    super(delegate);
  }

  async findActive(options: JudgeQueryOptions = {}) {
    return this.findMany({
      ...options,
      where: {
        ...(options.where ?? {}),
        isActive: true,
      },
      orderBy: { lastName: 'asc' },
    } satisfies Prisma.JudgeFindManyArgs);
  }

  async findByFullName(fullName: string) {
    return this.delegate.findFirst({
      where: {
        fullName,
      },
    });
  }

  async search(term: string) {
    const query = term.trim();
    if (!query) {
      return [] as Prisma.JudgeGetPayload<{ select: { id: true } }>[];
    }

    return this.findMany({
      where: {
        isActive: true,
        OR: [
          { fullName: { contains: query } },
          { firstName: { contains: query } },
          { lastName: { contains: query } },
        ],
      },
      take: 25,
      orderBy: { lastName: 'asc' },
    } satisfies Prisma.JudgeFindManyArgs);
  }
}

export const judgeRepository = new JudgeRepository();
