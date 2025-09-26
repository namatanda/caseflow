import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { checkDatabaseConnection, connectWithRetry, withTransaction, prisma } from '../../config/database';
import { logger } from '../../utils/logger';

// Mock logger to avoid console output during tests
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Database Configuration', () => {
  beforeAll(async () => {
    // Ensure database connection is established
    await connectWithRetry(3, 500);
  });

  afterAll(async () => {
    await prisma.$disconnect();
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
    });

    it('should retry connection on failure', async () => {
      // Mock a temporary connection failure
      const originalConnect = prisma.$connect;
      let attempts = 0;
      
      prisma.$connect = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Connection failed');
        }
        return originalConnect.call(prisma);
      });

      const result = await connectWithRetry(3, 50);
      
      expect(result).toBe(true);
      expect(attempts).toBe(2);
      
      // Restore original method
      prisma.$connect = originalConnect;
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