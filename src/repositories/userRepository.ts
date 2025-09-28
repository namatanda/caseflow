import type { Prisma } from '@prisma/client';

import { prisma } from '@/config/database';
import { BaseRepository } from './baseRepository';

type UserDelegate = typeof prisma.user;

export class UserRepository extends BaseRepository<UserDelegate> {
  constructor(delegate: UserDelegate = prisma.user) {
    super(delegate);
  }

  findByEmail(email: string) {
    return this.delegate.findUnique({
      where: { email },
    });
  }

  findActive(options: Partial<Pick<Prisma.UserFindManyArgs, 'select' | 'include' | 'where'>> = {}) {
    return this.findMany({
      ...options,
      where: {
        ...(options.where ?? {}),
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    } satisfies Prisma.UserFindManyArgs);
  }
}

export const userRepository = new UserRepository();
