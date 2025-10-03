import type { Prisma } from '@prisma/client';

import { prisma } from '@/config/database';
import { BaseRepository } from './baseRepository';

type CaseJudgeAssignmentDelegate = typeof prisma.caseJudgeAssignment;

export class CaseJudgeAssignmentRepository extends BaseRepository<CaseJudgeAssignmentDelegate> {
  constructor(delegate: CaseJudgeAssignmentDelegate = prisma.caseJudgeAssignment) {
    super(delegate);
  }

  findByCaseId(caseId: string) {
    return this.findMany({
      where: { caseId },
      orderBy: { assignedAt: 'desc' },
      include: {
        judge: true,
      },
    } satisfies Prisma.CaseJudgeAssignmentFindManyArgs);
  }

  async upsertAssignment(caseId: string, judgeId: string, isPrimary = false) {
    return this.delegate.upsert({
      where: {
        caseId_judgeId: {
          caseId,
          judgeId,
        },
      },
      create: {
        caseId,
        judgeId,
        isPrimary,
      },
      update: {
        isPrimary,
      },
    });
  }

  async clearPrimaryAssignments(caseId: string) {
    await this.delegate.updateMany({
      where: {
        caseId,
        isPrimary: true,
      },
      data: {
        isPrimary: false,
      },
    });
  }

  async createMany(records: Prisma.CaseJudgeAssignmentCreateManyInput[]) {
    if (records.length === 0) {
      return { count: 0 };
    }

    return this.delegate.createMany({
      data: records,
    });
  }
}

export const caseJudgeAssignmentRepository = new CaseJudgeAssignmentRepository();
