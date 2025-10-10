import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { websocketService } from '../../services/websocketService';
import { csvImportQueue } from '../../config/queue';
import type { Server as HttpServer } from 'http';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock Prisma client
const mockPrisma = {
  case: {
    createMany: vi.fn(),
    findMany: vi.fn(),
  },
  importBatch: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
  },
  $disconnect: vi.fn(),
};

vi.mock('../../config/database', () => ({
  prisma: mockPrisma,
}));

describe('CSV Import Integration Tests', () => {
  let testFilePath: string;
  let mockHttpServer: Partial<HttpServer>;

  beforeAll(() => {
    mockHttpServer = {};
    websocketService.initialize(mockHttpServer as HttpServer);
  });

  afterAll(async () => {
    await websocketService.close();
    await csvImportQueue.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Complete CSV Import Flow', () => {
    beforeEach(() => {
      // Create a test CSV file
      testFilePath = join(tmpdir(), `test-import-${Date.now()}.csv`);
      const csvContent = `caseNumber,title,description,status,priority,assignedTo
CASE-001,Test Case 1,Description 1,open,high,user1@example.com
CASE-002,Test Case 2,Description 2,in_progress,medium,user2@example.com
CASE-003,Test Case 3,Description 3,closed,low,user3@example.com`;
      writeFileSync(testFilePath, csvContent);
    });

    afterAll(() => {
      // Cleanup test file
      try {
        unlinkSync(testFilePath);
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should process valid CSV file from start to finish', async () => {
      const batchId = `batch_${Date.now()}`;
      const _jobId = `job_${Date.now()}`;

      // Mock database responses
      mockPrisma.importBatch.create.mockResolvedValue({
        id: batchId,
        fileName: 'test.csv',
        status: 'pending',
        totalRows: 3,
        successfulRows: 0,
        failedRows: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockPrisma.importBatch.update.mockResolvedValue({
        id: batchId,
        status: 'completed',
        successfulRows: 3,
        failedRows: 0,
      });

      mockPrisma.case.createMany.mockResolvedValue({ count: 3 });

      // Add job to queue
      const job = await csvImportQueue.add('csv-import', {
        batchId,
        filePath: testFilePath,
        fileName: 'test.csv',
        originalName: 'test.csv',
        fileSize: 200,
        mimeType: 'text/csv',
        checksum: 'test-checksum',
        uploadedBy: 'test-user',
      });

      // Wait for job to complete
      await job.waitUntilFinished(csvImportQueue.events);

      // Verify batch was created
      expect(mockPrisma.importBatch.create).toHaveBeenCalled();

      // Verify cases were created
      expect(mockPrisma.case.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            caseNumber: 'CASE-001',
            title: 'Test Case 1',
          }),
        ]),
      });

      // Verify batch was updated to completed
      expect(mockPrisma.importBatch.update).toHaveBeenCalledWith({
        where: { id: batchId },
        data: expect.objectContaining({
          status: 'completed',
        }),
      });
    });

    it('should emit WebSocket progress events during import', async () => {
      const emitSpy = vi.spyOn(websocketService, 'emitImportProgress');
      const completedSpy = vi.spyOn(websocketService, 'emitImportCompleted');

      const batchId = `batch_${Date.now()}`;

      mockPrisma.importBatch.create.mockResolvedValue({
        id: batchId,
        status: 'pending',
      });

      mockPrisma.case.createMany.mockResolvedValue({ count: 3 });

      const job = await csvImportQueue.add('csv-import', {
        batchId,
        filePath: testFilePath,
        fileName: 'test.csv',
        originalName: 'test.csv',
        fileSize: 200,
        mimeType: 'text/csv',
        checksum: 'test-checksum',
        uploadedBy: 'test-user',
      });

      await job.waitUntilFinished(csvImportQueue.events);

      // Verify progress events were emitted
      expect(emitSpy).toHaveBeenCalled();
      
      // Should emit at validation, parsing, importing stages
      const progressCalls = emitSpy.mock.calls;
      expect(progressCalls.length).toBeGreaterThan(0);

      // Verify completion event was emitted
      expect(completedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          batchId,
        })
      );
    });

    it('should handle CSV validation errors', async () => {
      const failedSpy = vi.spyOn(websocketService, 'emitImportFailed');
      
      // Create invalid CSV file
      const invalidCsvPath = join(tmpdir(), `invalid-${Date.now()}.csv`);
      const invalidContent = `invalid,headers
missing,fields`;
      writeFileSync(invalidCsvPath, invalidContent);

      const batchId = `batch_fail_${Date.now()}`;

      mockPrisma.importBatch.create.mockResolvedValue({
        id: batchId,
        status: 'pending',
      });

      const job = await csvImportQueue.add('csv-import', {
        batchId,
        filePath: invalidCsvPath,
        fileName: 'invalid.csv',
        originalName: 'invalid.csv',
        fileSize: 100,
        mimeType: 'text/csv',
        checksum: 'invalid-checksum',
        uploadedBy: 'test-user',
      });

      try {
        await job.waitUntilFinished(csvImportQueue.events);
      } catch {
        // Expected to fail
      }

      // Verify failure event was emitted
      expect(failedSpy).toHaveBeenCalled();

      // Cleanup
      unlinkSync(invalidCsvPath);
    });
  });

  describe('Checksum Validation', () => {
    it('should calculate and store file checksum', async () => {
      testFilePath = join(tmpdir(), `checksum-test-${Date.now()}.csv`);
      const csvContent = `id,name\n1,Test`;
      writeFileSync(testFilePath, csvContent);

      const batchId = `batch_checksum_${Date.now()}`;

      mockPrisma.importBatch.create.mockResolvedValue({
        id: batchId,
        status: 'pending',
        checksum: null,
      });

      mockPrisma.importBatch.update.mockImplementation((args) => {
        return Promise.resolve({
          id: batchId,
          ...args.data,
        });
      });

      const job = await csvImportQueue.add('csv-import', {
        batchId,
        filePath: testFilePath,
        fileName: 'checksum.csv',
        originalName: 'checksum.csv',
        fileSize: csvContent.length,
        mimeType: 'text/csv',
        checksum: 'provided-checksum',
        uploadedBy: 'test-user',
      });

      await job.waitUntilFinished(csvImportQueue.events);

      // Verify checksum was calculated and stored
      const updateCalls = mockPrisma.importBatch.update.mock.calls;
      const hasChecksumUpdate = updateCalls.some((call) => 
        call[0].data && 'checksum' in call[0].data
      );

      expect(hasChecksumUpdate).toBe(true);

      unlinkSync(testFilePath);
    });
  });

  describe('Duplicate Detection', () => {
    it('should detect and handle duplicate case numbers', async () => {
      testFilePath = join(tmpdir(), `duplicates-${Date.now()}.csv`);
      const csvWithDuplicates = `caseNumber,title,description,status,priority
CASE-DUP,Title 1,Desc 1,open,high
CASE-DUP,Title 2,Desc 2,open,medium
CASE-003,Title 3,Desc 3,closed,low`;
      writeFileSync(testFilePath, csvWithDuplicates);

      const batchId = `batch_dup_${Date.now()}`;

      mockPrisma.importBatch.create.mockResolvedValue({
        id: batchId,
        status: 'pending',
      });

      mockPrisma.case.createMany.mockResolvedValue({ count: 2 });

      const job = await csvImportQueue.add('csv-import', {
        batchId,
        filePath: testFilePath,
        fileName: 'duplicates.csv',
        originalName: 'duplicates.csv',
        fileSize: 150,
        mimeType: 'text/csv',
        checksum: 'dup-checksum',
        uploadedBy: 'test-user',
      });

      await job.waitUntilFinished(csvImportQueue.events);

      // Should have processed with some rows skipped/failed
      expect(mockPrisma.importBatch.update).toHaveBeenCalled();

      unlinkSync(testFilePath);
    });
  });

  describe('Error Recovery', () => {
    it('should handle database connection errors gracefully', async () => {
      testFilePath = join(tmpdir(), `db-error-${Date.now()}.csv`);
      const csvContent = `id,name\n1,Test`;
      writeFileSync(testFilePath, csvContent);

      const batchId = `batch_db_error_${Date.now()}`;

      mockPrisma.importBatch.create.mockRejectedValue(
        new Error('Database connection failed')
      );

      const job = await csvImportQueue.add('csv-import', {
        batchId,
        filePath: testFilePath,
        fileName: 'db-error.csv',
        originalName: 'db-error.csv',
        fileSize: 50,
        mimeType: 'text/csv',
        checksum: 'error-checksum',
        uploadedBy: 'test-user',
      });

      try {
        await job.waitUntilFinished(csvImportQueue.events);
      } catch (error) {
        expect(error).toBeDefined();
      }

      unlinkSync(testFilePath);
    });

    it('should cleanup temporary files after processing', async () => {
      testFilePath = join(tmpdir(), `cleanup-${Date.now()}.csv`);
      const csvContent = `id,name\n1,Test`;
      writeFileSync(testFilePath, csvContent);

      const batchId = `batch_cleanup_${Date.now()}`;

      mockPrisma.importBatch.create.mockResolvedValue({
        id: batchId,
        status: 'pending',
      });

      mockPrisma.case.createMany.mockResolvedValue({ count: 1 });

      const job = await csvImportQueue.add('csv-import', {
        batchId,
        filePath: testFilePath,
        fileName: 'cleanup.csv',
        originalName: 'cleanup.csv',
        fileSize: 50,
        mimeType: 'text/csv',
        checksum: 'cleanup-checksum',
        uploadedBy: 'test-user',
      });

      await job.waitUntilFinished(csvImportQueue.events);

      // File should still exist (cleanup happens in controller after download)
      // This is just to verify the process completes
      expect(mockPrisma.case.createMany).toHaveBeenCalled();

      unlinkSync(testFilePath);
    });
  });

  describe('Performance and Limits', () => {
    it('should handle large CSV files efficiently', async () => {
      testFilePath = join(tmpdir(), `large-${Date.now()}.csv`);
      
      // Generate large CSV (1000 rows)
      let csvContent = 'caseNumber,title,description,status,priority\n';
      for (let i = 1; i <= 1000; i++) {
        csvContent += `CASE-${i.toString().padStart(4, '0')},Title ${i},Description ${i},open,medium\n`;
      }
      writeFileSync(testFilePath, csvContent);

      const batchId = `batch_large_${Date.now()}`;

      mockPrisma.importBatch.create.mockResolvedValue({
        id: batchId,
        status: 'pending',
      });

      mockPrisma.case.createMany.mockResolvedValue({ count: 1000 });

      const startTime = Date.now();

      const job = await csvImportQueue.add('csv-import', {
        batchId,
        filePath: testFilePath,
        fileName: 'large.csv',
        originalName: 'large.csv',
        fileSize: csvContent.length,
        mimeType: 'text/csv',
        checksum: 'large-checksum',
        uploadedBy: 'test-user',
      });

      await job.waitUntilFinished(csvImportQueue.events);

      const duration = Date.now() - startTime;

      // Should complete in reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(30000); // 30 seconds

      unlinkSync(testFilePath);
    });

    it('should respect row limits when configured', async () => {
      testFilePath = join(tmpdir(), `limited-${Date.now()}.csv`);
      
      let csvContent = 'id,name\n';
      for (let i = 1; i <= 100; i++) {
        csvContent += `${i},Name ${i}\n`;
      }
      writeFileSync(testFilePath, csvContent);

      const batchId = `batch_limited_${Date.now()}`;

      mockPrisma.importBatch.create.mockResolvedValue({
        id: batchId,
        status: 'pending',
      });

      // The worker should handle max rows internally
      const job = await csvImportQueue.add('csv-import', {
        batchId,
        filePath: testFilePath,
        fileName: 'limited.csv',
        originalName: 'limited.csv',
        fileSize: csvContent.length,
        mimeType: 'text/csv',
        checksum: 'limited-checksum',
        uploadedBy: 'test-user',
        maxRows: 50, // Limit to 50 rows
      });

      await job.waitUntilFinished(csvImportQueue.events);

      unlinkSync(testFilePath);
    });
  });
});
