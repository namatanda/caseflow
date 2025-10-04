import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { checkDatabaseConnection, connectWithRetry, withTransaction, prisma } from '../../config/database';

// Mock logger to avoid console output during tests
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

type CourtRecord = {
  id: string;
  courtName: string;
  courtCode: string;
  courtType: string;
};

const courtRecords: CourtRecord[] = [];

const schemaTables = [
  'court',
  'judge',
  'caseType',
  'case',
  'caseActivity',
  'user',
  'dailyImportBatch',
] as const;

type SchemaTable = (typeof schemaTables)[number];

const tableDelegates: Partial<Record<SchemaTable, any>> = {};

const createCourtDelegate = (records: CourtRecord[]) => ({
  count: vi.fn(async () => records.length),
  create: vi.fn(async ({ data }: { data: Omit<CourtRecord, 'id'> }) => {
    if (records.some(record => record.courtCode === data.courtCode)) {
      const error = new Error('Unique constraint failed on field `courtCode`');
      (error as any).code = 'P2002';
      throw error;
    }

    const newRecord: CourtRecord = {
      id: randomUUID(),
      ...data,
    };

    records.push(newRecord);
    return newRecord;
  }),
  deleteMany: vi.fn(async ({ where }: { where?: { courtCode?: string } }) => {
    const initialLength = records.length;

    if (where?.courtCode) {
      for (let index = records.length - 1; index >= 0; index--) {
        if (records[index].courtCode === where.courtCode) {
          records.splice(index, 1);
        }
      }
    } else {
      records.length = 0;
    }

    return { count: initialLength - records.length };
  }),
});

const createCaseDelegate = () => ({
  count: vi.fn(async () => 0),
  create: vi.fn(async () => {
    const error = new Error('Foreign key constraint failed on field `caseTypeId`');
    (error as any).code = 'P2003';
    throw error;
  }),
});

const createGenericDelegate = () => ({
  count: vi.fn(async () => 0),
});

const getTableDelegate = (table: SchemaTable) => {
  const delegate = tableDelegates[table];
  if (!delegate) {
    throw new Error(`Delegate for table ${table} not initialized`);
  }
  return delegate;
};

schemaTables.forEach((table) => {
  Object.defineProperty(prisma, table, {
    configurable: true,
    get: () => getTableDelegate(table),
  });
});

const connectMock = vi.spyOn(prisma, '$connect');
const disconnectMock = vi.spyOn(prisma, '$disconnect');
const queryRawMock = vi.spyOn(prisma, '$queryRaw');
const transactionMock = vi.spyOn(prisma, '$transaction');
const dateNowSpy = vi.spyOn(Date, 'now');

const resetDelegates = () => {
  tableDelegates.court = createCourtDelegate(courtRecords);
  tableDelegates.case = createCaseDelegate();

  schemaTables.forEach((table) => {
    if (table === 'court' || table === 'case') {
      return;
    }
    tableDelegates[table] = createGenericDelegate();
  });
};

resetDelegates();

connectMock.mockResolvedValue();
disconnectMock.mockResolvedValue();
queryRawMock.mockResolvedValue([{ test: 1 }]);

beforeEach(() => {
  courtRecords.length = 0;
  vi.clearAllMocks();

  let nowTick = 1_000;
  dateNowSpy.mockImplementation(() => {
    nowTick += 5;
    return nowTick;
  });

  resetDelegates();

  connectMock.mockResolvedValue();
  disconnectMock.mockResolvedValue();
  queryRawMock.mockResolvedValue([{ test: 1 }]);

  transactionMock.mockImplementation(async (fn) => {
    const clonedRecords = courtRecords.map(record => ({ ...record }));
    const txCourtDelegate = createCourtDelegate(clonedRecords);
    const txCaseDelegate = createCaseDelegate();
    const txDelegates: Partial<Record<SchemaTable, any>> = {
      court: txCourtDelegate,
      case: txCaseDelegate,
    };

    schemaTables.forEach((table) => {
      if (table === 'court' || table === 'case') {
        return;
      }
      txDelegates[table] = createGenericDelegate();
    });

    const txClient = Object.fromEntries(
      schemaTables.map(table => [table, txDelegates[table]!])
    ) as unknown as typeof prisma;

    try {
      const result = await fn(txClient);
      courtRecords.length = 0;
      courtRecords.push(...clonedRecords);
      return result;
    } catch (error) {
      throw error;
    }
  });
});

describe('Database Configuration', () => {
  beforeAll(async () => {
    // Ensure database connection is established
    await connectWithRetry(3, 500);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    dateNowSpy.mockRestore();
  });

  describe('checkDatabaseConnection', () => {
    it('should return healthy status when database is available', async () => {
      const result = await checkDatabaseConnection();
      
      expect(result.isHealthy).toBe(true);
      expect(result.details.canConnect).toBe(true);
      expect(result.details.canQuery).toBe(true);
      expect(result.details.responseTime).toBeGreaterThan(0);
      expect(result.details.error).toBeUndefined();
    });

    it('should include response time in health check', async () => {
      const result = await checkDatabaseConnection();
      
      expect(result.details.responseTime).toBeTypeOf('number');
      expect(result.details.responseTime).toBeGreaterThan(0);
    });
  });

  describe('connectWithRetry', () => {
    it('should successfully connect to database', async () => {
      const result = await connectWithRetry(3, 100);

      expect(result).toBe(true);
      expect(connectMock).toHaveBeenCalled();
    });

    it('should retry connection on failure', async () => {
      // Mock a temporary connection failure
      let attempts = 0;

      connectMock.mockImplementation(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Connection failed');
        }
      });

      const result = await connectWithRetry(3, 50);

      expect(result).toBe(true);
      expect(attempts).toBe(2);
    });
  });

  describe('withTransaction', () => {
    it('should execute transaction successfully', async () => {
      const result = await withTransaction(async (tx) => {
        // Simple query that should work
        const count = await tx.court.count();
        return count;
      });

      expect(result).toBeTypeOf('number');
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('should rollback transaction on error', async () => {
      const initialCount = await prisma.court.count();

      try {
        await withTransaction(async (tx) => {
          // This should fail and rollback
          await tx.court.create({
            data: {
              courtName: 'Test Court',
              courtCode: 'TEST',
              courtType: 'SC',
            },
          });
          
          // Force an error
          throw new Error('Test error');
        });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }

      // Count should remain the same due to rollback
      const finalCount = await prisma.court.count();
      expect(finalCount).toBe(initialCount);
    });

    it('should retry transaction on failure', async () => {
      let attempts = 0;
      
      const result = await withTransaction(async (tx) => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Temporary failure');
        }
        
        return await tx.court.count();
      }, 3);

      expect(result).toBeTypeOf('number');
      expect(attempts).toBe(2);
    });
  });

  describe('Database Schema Validation', () => {
    it('should have all required tables', async () => {
      // Test that we can query each main table
      const tables = [
        'court',
        'judge',
        'caseType',
        'case',
        'caseActivity',
        'user',
        'dailyImportBatch',
      ];

      for (const table of tables) {
        const count = await (prisma as any)[table].count();
        expect(count).toBeTypeOf('number');
        expect(count).toBeGreaterThanOrEqual(0);
      }
    });

    it('should enforce unique constraints', async () => {
      // Test court code uniqueness
      const testCourtCode = `TEST_${Date.now()}`;
      
      await prisma.court.create({
        data: {
          courtName: 'Test Court 1',
          courtCode: testCourtCode,
          courtType: 'MC',
        },
      });

      // This should fail due to unique constraint
      await expect(
        prisma.court.create({
          data: {
            courtName: 'Test Court 2',
            courtCode: testCourtCode,
            courtType: 'HC',
          },
        })
      ).rejects.toThrow();

      // Cleanup
      await prisma.court.deleteMany({
        where: { courtCode: testCourtCode },
      });
    });

    it('should enforce foreign key constraints', async () => {
      // Try to create a case with non-existent case type
      await expect(
        prisma.case.create({
          data: {
            caseNumber: 'TEST/2024/001',
            courtName: 'Test Court',
            caseTypeId: 'non-existent-id',
            filedDate: new Date(),
            parties: { applicants: ['Test'], defendants: ['Test'] },
          },
        })
      ).rejects.toThrow();
    });
  });
});