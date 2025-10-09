process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/courtflow_test';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PrismaClient, ImportStatus } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { importController } from '../../controllers/import';
import { csvImportWorker } from '../../workers/csvImportWorker';

// Extract the processor function from the worker for testing
const processorFunction = (csvImportWorker as any).opts.processor;

// Mock Express request/response
const mockRequest = (body: any = {}, file?: any) => ({
  body,
  file,
  params: {},
  query: {},
});

const mockResponse = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnThis();
  res.json = vi.fn().mockReturnThis();
  res.setHeader = vi.fn().mockReturnThis();
  res.write = vi.fn().mockReturnThis();
  res.end = vi.fn();
  return res;
};

const mockNext = vi.fn();

// Use in-memory SQLite database for testing with unique name
const DATABASE_URL = `file::memory:${Date.now()}?cache=shared`;

describe('CSV Upload and Processing Integration Test', () => {
  let prisma: PrismaClient;
  let tempDir: string;

  beforeAll(async () => {
    // Create temp directory for test files
    tempDir = path.join(process.cwd(), 'temp-test');
    try {
      await fs.mkdir(tempDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    prisma = new PrismaClient(/*{
      datasourceUrl: DATABASE_URL,
    }*/);

    // Create tables manually since we're using in-memory SQLite
    await prisma.$executeRaw`
      CREATE TABLE courts (
        id TEXT PRIMARY KEY,
        court_name TEXT NOT NULL,
        court_code TEXT NOT NULL UNIQUE,
        court_type TEXT NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await prisma.$executeRaw`
      CREATE TABLE judges (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME
      );
    `;

    await prisma.$executeRaw`
      CREATE TABLE case_types (
        id TEXT PRIMARY KEY,
        case_type_name TEXT NOT NULL,
        case_type_code TEXT NOT NULL UNIQUE,
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await prisma.$executeRaw`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'DATA_ENTRY',
        is_active BOOLEAN DEFAULT true,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME
      );
    `;

    await prisma.$executeRaw`
      CREATE TABLE cases (
        id TEXT PRIMARY KEY,
        case_number TEXT NOT NULL,
        court_name TEXT NOT NULL,
        original_court_id TEXT,
        case_type_id TEXT NOT NULL,
        filed_date DATETIME NOT NULL,
        original_case_number TEXT,
        original_year INTEGER,
        parties TEXT,
        status TEXT DEFAULT 'ACTIVE',
        next_activity_date DATETIME,
        total_activities INTEGER DEFAULT 0,
        has_legal_representation BOOLEAN DEFAULT false,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME,
        caseid_type TEXT,
        caseid_no TEXT,
        male_applicant INTEGER DEFAULT 0,
        female_applicant INTEGER DEFAULT 0,
        organization_applicant INTEGER DEFAULT 0,
        male_defendant INTEGER DEFAULT 0,
        female_defendant INTEGER DEFAULT 0,
        organization_defendant INTEGER DEFAULT 0,
        FOREIGN KEY (case_type_id) REFERENCES case_types(id),
        FOREIGN KEY (original_court_id) REFERENCES courts(id),
        UNIQUE(case_number, court_name)
      );
    `;

    await prisma.$executeRaw`
      CREATE TABLE daily_import_batches (
        id TEXT PRIMARY KEY,
        import_date DATETIME NOT NULL,
        filename TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        file_checksum TEXT NOT NULL,
        total_records INTEGER NOT NULL,
        successful_records INTEGER NOT NULL DEFAULT 0,
        failed_records INTEGER NOT NULL DEFAULT 0,
        error_logs TEXT DEFAULT '[]',
        status TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        created_by TEXT NOT NULL,
        estimated_completion_time DATETIME,
        processing_start_time DATETIME,
        user_config TEXT DEFAULT '{}',
        validation_warnings TEXT DEFAULT '[]',
        empty_rows_skipped INTEGER DEFAULT 0,
        FOREIGN KEY (created_by) REFERENCES users(id)
      );
    `;

    await prisma.$executeRaw`
      CREATE TABLE import_error_details (
        id TEXT PRIMARY KEY,
        batchId TEXT NOT NULL,
        rowNumber INTEGER NOT NULL,
        errorType TEXT NOT NULL,
        errorMessage TEXT NOT NULL,
        severity TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (batchId) REFERENCES daily_import_batches(id) ON DELETE CASCADE
      );
    `;

    await prisma.$executeRaw`
      CREATE TABLE case_activities (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        activity_date DATETIME NOT NULL,
        activity_type TEXT NOT NULL,
        outcome TEXT NOT NULL,
        reason_for_adjournment TEXT,
        next_hearing_date DATETIME,
        primary_judge_id TEXT NOT NULL,
        has_legal_representation BOOLEAN,
        applicant_witnesses INTEGER DEFAULT 0,
        defendant_witnesses INTEGER DEFAULT 0,
        custody_status TEXT,
        details TEXT,
        import_batch_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        judge_1 TEXT,
        judge_2 TEXT,
        judge_3 TEXT,
        judge_4 TEXT,
        judge_5 TEXT,
        judge_6 TEXT,
        judge_7 TEXT,
        coming_for TEXT,
        legal_rep_string TEXT,
        custody_numeric INTEGER,
        other_details TEXT,
        FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
        FOREIGN KEY (primary_judge_id) REFERENCES judges(id),
        FOREIGN KEY (import_batch_id) REFERENCES daily_import_batches(id)
      );
    `;

    await prisma.$executeRaw`
      CREATE TABLE case_judge_assignments (
        case_id TEXT NOT NULL,
        judge_id TEXT NOT NULL,
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_primary BOOLEAN DEFAULT false,
        PRIMARY KEY (case_id, judge_id),
        FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
        FOREIGN KEY (judge_id) REFERENCES judges(id)
      );
    `;

    // Seed required data
    await prisma.court.create({
      data: {
        id: 'test-court-1',
        courtName: 'High Court of Kenya',
        courtCode: 'HC',
        courtType: 'HC',
      },
    });

    await prisma.caseType.create({
      data: {
        id: 'test-case-type-1',
        caseTypeName: 'Civil Case',
        caseTypeCode: 'CIVIL',
        description: 'Civil litigation cases',
      },
    });

    await prisma.judge.create({
      data: {
        id: 'test-judge-1',
        fullName: 'Justice Smith',
        firstName: 'Justice',
        lastName: 'Smith',
      },
    });

    await prisma.user.create({
      data: {
        id: 'test-user-1',
        email: 'admin@example.com',
        name: 'Test Admin',
        role: 'ADMIN',
        password: 'hashed-password',
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should complete full CSV upload and processing flow successfully', async () => {
    // Create a sample CSV file
    const csvContent = `caseNumber,courtName,caseType,filedDate,status,totalActivities,parties,maleApplicant,femaleApplicant,maleDefendant,femaleDefendant,activityDate,activityType,outcome,primaryJudge,hasLegalRepresentation,applicantWitnesses,defendantWitnesses,custodyStatus
CIV/2024/0001,High Court of Kenya,CIVIL,2024-01-15,ACTIVE,1,"{""applicants"":[""John Doe""],""defendants"":[""Jane Smith""]}",1,0,0,1,2024-02-01,Hearing,Adjourned,Justice Smith,true,2,1,NOT_APPLICABLE
CIV/2024/0002,High Court of Kenya,CIVIL,2024-01-20,ACTIVE,1,"{""applicants"":[""Alice Johnson""],""defendants"":[""Bob Wilson""]}",0,1,1,0,2024-02-05,Hearing,Proceeded,Justice Smith,false,1,1,ON_BAIL`;

    const csvFilePath = path.join(tempDir, 'test-cases.csv');
    await fs.writeFile(csvFilePath, csvContent);

    // Step 1: Simulate file upload through controller
    const req = mockRequest({
      metadata: JSON.stringify({
        importDate: '2024-01-15',
        createdBy: 'test-user-1',
        userConfig: { notify: true },
      }),
      options: JSON.stringify({
        chunkSize: 100,
      }),
    }, {
      originalname: 'test-cases.csv',
      path: csvFilePath,
      size: csvContent.length,
    });

    const res = mockResponse();

    // Call the controller's uploadCsv method
    await importController.uploadCsv(req, res, mockNext);

    // Verify upload response
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: expect.any(String),
        jobId: expect.any(String),
        status: 'queued',
        message: 'CSV import job has been queued for processing',
      })
    );

    // Extract batch and job IDs from response
    const uploadResponse = res.json.mock.calls[0][0];
    const batchId = uploadResponse.batchId;
    const jobId = uploadResponse.jobId;

    // Verify batch was created in database
    const batch = await prisma.dailyImportBatch.findUnique({
      where: { id: batchId },
    });

    expect(batch).toBeTruthy();
    expect(batch?.status).toBe(ImportStatus.PENDING);
    expect(batch?.filename).toBe('test-cases.csv');
    expect(batch?.fileSize).toBe(csvContent.length);
    expect(batch?.createdBy).toBe('test-user-1');

    // Step 2: Simulate worker processing the job
    const jobData = {
      batchId,
      filePath: csvFilePath,
      options: {
        chunkSize: 100,
      },
    };

    // Process the job through the worker
    const result = await processorFunction({
      id: jobId,
      data: jobData,
      updateProgress: vi.fn(),
    });

    // Verify processing result
    expect(result).toBeTruthy();
    expect(result.batchId).toBe(batchId);
    expect(result.totals.totalRecords).toBe(2);
    expect(result.totals.successfulRecords).toBe(2);
    expect(result.totals.failedRecords).toBe(0);

    // Verify final batch status
    const finalBatch = await prisma.dailyImportBatch.findUnique({
      where: { id: batchId },
      include: {
        errorDetails: true,
      },
    });

    expect(finalBatch?.status).toBe(ImportStatus.COMPLETED);
    expect(finalBatch?.successfulRecords).toBe(2);
    expect(finalBatch?.failedRecords).toBe(0);
    expect(finalBatch?.completedAt).toBeTruthy();

    // Verify cases were created
    const cases = await prisma.case.findMany({
      where: { importBatchId: batchId },
    });

    expect(cases).toHaveLength(2);
    expect(cases[0].caseNumber).toBe('CIV/2024/0001');
    expect(cases[1].caseNumber).toBe('CIV/2024/0002');

    // Verify activities were created
    const activities = await prisma.caseActivity.findMany({
      where: { importBatchId: batchId },
    });

    expect(activities).toHaveLength(2);
    expect(activities[0].activityType).toBe('Hearing');
    expect(activities[1].activityType).toBe('Hearing');

    // Verify judge assignments were created
    const assignments = await prisma.caseJudgeAssignment.findMany();
    expect(assignments).toHaveLength(2); // One primary assignment per case

    // Verify temp file was cleaned up
    await expect(fs.access(csvFilePath)).rejects.toThrow();
  });

  it('should handle processing errors and mark batch as failed', async () => {
    // Create a CSV file with invalid data
    const invalidCsvContent = `caseNumber,courtName,caseType,filedDate,status,totalActivities,parties,maleApplicant,femaleApplicant,maleDefendant,femaleDefendant,activityDate,activityType,outcome,primaryJudge,hasLegalRepresentation,applicantWitnesses,defendantWitnesses,custodyStatus
INVALID/2024/0001,High Court of Kenya,CIVIL,invalid-date,ACTIVE,1,"{""applicants"":[""John Doe""],""defendants"":[""Jane Smith""]}",1,0,0,1,2024-02-01,Hearing,Adjourned,Justice Smith,true,2,1,NOT_APPLICABLE`;

    const invalidCsvFilePath = path.join(tempDir, 'invalid-cases.csv');
    await fs.writeFile(invalidCsvFilePath, invalidCsvContent);

    // Step 1: Upload the invalid file
    const req = mockRequest({
      metadata: JSON.stringify({
        createdBy: 'test-user-1',
      }),
    }, {
      originalname: 'invalid-cases.csv',
      path: invalidCsvFilePath,
      size: invalidCsvContent.length,
    });

    const res = mockResponse();

    await importController.uploadCsv(req, res, mockNext);

    const uploadResponse = res.json.mock.calls[0][0];
    const batchId = uploadResponse.batchId;
    const jobId = uploadResponse.jobId;

    // Step 2: Process the job (this should fail)
    const jobData = {
      batchId,
      filePath: invalidCsvFilePath,
      options: {},
    };

    // The worker should handle the error gracefully
    try {
      await processorFunction({
        id: jobId,
        data: jobData,
        updateProgress: vi.fn(),
      });
    } catch (error) {
      // Expected to fail
      expect(error).toBeTruthy();
    }

    // Verify batch was marked as failed
    const finalBatch = await prisma.dailyImportBatch.findUnique({
      where: { id: batchId },
    });

    expect(finalBatch?.status).toBe(ImportStatus.FAILED);
    expect(finalBatch?.errorLogs).toContain('Unknown error');

    // Verify temp file was cleaned up even on error
    await expect(fs.access(invalidCsvFilePath)).rejects.toThrow();
  });

  it('should handle missing file in upload request', async () => {
    const req = mockRequest({
      metadata: JSON.stringify({
        createdBy: 'test-user-1',
      }),
    }); // No file

    const res = mockResponse();

    await importController.uploadCsv(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'CSV file is required.' });
  });

  it('should handle invalid JSON in metadata', async () => {
    const csvContent = `caseNumber,courtName,caseType,filedDate,status,totalActivities,parties,maleApplicant,femaleApplicant,maleDefendant,femaleDefendant
CIV/2024/0001,High Court of Kenya,CIVIL,2024-01-15,ACTIVE,0,"{}",0,0,0,0`;

    const csvFilePath = path.join(tempDir, 'test-cases.csv');
    await fs.writeFile(csvFilePath, csvContent);

    const req = mockRequest({
      metadata: 'invalid json',
    }, {
      originalname: 'test-cases.csv',
      path: csvFilePath,
      size: csvContent.length,
    });

    const res = mockResponse();

    await importController.uploadCsv(req, res, mockNext);

    // Should still succeed with default values
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'queued',
      })
    );
  });
});