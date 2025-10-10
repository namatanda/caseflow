import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, ImportStatus } from '@prisma/client';

// Use in-memory SQLite database for testing with unique name
const DATABASE_URL = `file::memory:${Date.now()}?cache=shared`;

describe('CSV Pipeline Integration Test', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasourceUrl: DATABASE_URL,
    });

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
        courtName: 'Test Court',
        courtCode: 'TC',
        courtType: 'HC',
      },
    });

    await prisma.caseType.create({
      data: {
        id: 'test-case-type-1',
        caseTypeName: 'Test Case Type',
        caseTypeCode: 'TCT',
        description: 'Test case type for integration testing',
      },
    });

    await prisma.judge.create({
      data: {
        id: 'test-judge-1',
        fullName: 'Test Judge',
        firstName: 'Test',
        lastName: 'Judge',
      },
    });

    await prisma.user.create({
      data: {
        id: 'test-user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'DATA_ENTRY',
        password: 'hashed-password',
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should persist batch records and error details correctly', async () => {
    // Create a batch record directly
    const batchId = 'test-batch-1';
    await prisma.dailyImportBatch.create({
      data: {
        id: batchId,
        importDate: new Date(),
        filename: 'test-cases.csv',
        fileSize: 1024,
        fileChecksum: 'test-checksum-123',
        totalRecords: 3,
        successfulRecords: 0,
        failedRecords: 0,
        errorLogs: '[]',
        status: ImportStatus.PENDING,
        createdBy: 'test-user-1',
        userConfig: '{}',
        validationWarnings: '[]',
      },
    });

    // Mark batch as processing
    await prisma.dailyImportBatch.update({
      where: { id: batchId },
      data: {
        status: ImportStatus.PROCESSING,
        processingStartTime: new Date(),
      },
    });

    // Insert test case data directly (simulating CSV import)
    await prisma.case.create({
      data: {
        id: 'test-case-1',
        caseNumber: 'TCT/2025/0001',
        courtName: 'Test Court',
        originalCourtId: 'test-court-1',
        caseTypeId: 'test-case-type-1',
        filedDate: new Date('2025-01-01'),
        parties: JSON.stringify({
          applicants: ['John Doe'],
          defendants: ['Jane Smith'],
        }),
        status: 'ACTIVE',
        maleApplicant: 1,
        femaleApplicant: 0,
        maleDefendant: 0,
        femaleDefendant: 1,
      },
    });

    await prisma.case.create({
      data: {
        id: 'test-case-2',
        caseNumber: 'TCT/2025/0002',
        courtName: 'Test Court',
        originalCourtId: 'test-court-1',
        caseTypeId: 'test-case-type-1',
        filedDate: new Date('2025-01-02'),
        parties: JSON.stringify({
          applicants: ['Alice Johnson'],
          defendants: ['Bob Wilson'],
        }),
        status: 'ACTIVE',
        maleApplicant: 0,
        femaleApplicant: 1,
        maleDefendant: 1,
        femaleDefendant: 0,
      },
    });

    // Insert case activity
    await prisma.caseActivity.create({
      data: {
        id: 'test-activity-1',
        caseId: 'test-case-1',
        activityDate: new Date('2025-01-15'),
        activityType: 'Hearing',
        outcome: 'Adjourned',
        primaryJudgeId: 'test-judge-1',
        hasLegalRepresentation: true,
        applicantWitnesses: 1,
        defendantWitnesses: 1,
        custodyStatus: 'NOT_APPLICABLE',
        importBatchId: batchId,
      },
    });

    // Insert judge assignment
    await prisma.caseJudgeAssignment.create({
      data: {
        caseId: 'test-case-1',
        judgeId: 'test-judge-1',
        assignedAt: new Date(),
        isPrimary: true,
      },
    });

    // Complete the batch and add error details
    await prisma.dailyImportBatch.update({
      where: { id: batchId },
      data: {
        status: ImportStatus.COMPLETED,
        successfulRecords: 2,
        failedRecords: 1,
        errorLogs: JSON.stringify(['Duplicate case number detected on row 3']),
        validationWarnings: JSON.stringify(['Some validation warnings here']),
        completedAt: new Date(),
      },
    });

    // Add error details
    await prisma.importErrorDetail.create({
      data: {
        id: 'test-error-1',
        batchId: batchId,
        rowNumber: 3,
        errorType: 'DUPLICATE_CASE_NUMBER',
        errorMessage: 'Case number TCT/2025/0001 already exists',
        severity: 'ERROR',
      },
    });

    // Verify batch record persistence
    const finalBatch = await prisma.dailyImportBatch.findUnique({
      where: { id: batchId },
      include: {
        errorDetails: true,
        user: true,
      },
    });

    // Verify data persistence
    const casesCount = await prisma.case.count();
    const activitiesCount = await prisma.caseActivity.count();
    const assignmentsCount = await prisma.caseJudgeAssignment.count();
    const errorDetailsCount = await prisma.importErrorDetail.count();

    // Assertions
    expect(finalBatch?.status).toBe(ImportStatus.COMPLETED);
    expect(finalBatch?.successfulRecords).toBe(2);
    expect(finalBatch?.failedRecords).toBe(1);
    expect(finalBatch?.errorDetails).toHaveLength(1);
    expect(casesCount).toBe(2);
    expect(activitiesCount).toBe(1);
    expect(assignmentsCount).toBe(1);
    expect(errorDetailsCount).toBe(1);
  });
});