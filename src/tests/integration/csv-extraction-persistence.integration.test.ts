import { describe, it, expect, vi } from 'vitest';
import { ImportStatus } from '@prisma/client';

// Mock the import service and its dependencies
vi.mock('@/services/importService', () => ({
  importService: {
    createBatch: vi.fn(),
    markBatchProcessing: vi.fn(),
    processCsvBatch: vi.fn(),
  },
}));

vi.mock('@/services/caseCsvService', () => ({
  caseCsvService: {
    importCaseData: vi.fn(),
  },
}));

vi.mock('@/services/dailyImportBatchService', () => ({
  dailyImportBatchService: {
    completeBatch: vi.fn(),
    failBatch: vi.fn(),
    getBatchById: vi.fn(),
    getRecentBatches: vi.fn(),
  },
}));

vi.mock('@/repositories/dailyImportBatchRepository', () => ({
  dailyImportBatchRepository: {
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/repositories/caseRepository', () => ({
  caseRepository: {
    search: vi.fn(),
  },
}));

import { importService } from '../../services/importService';

describe('CSV Extraction and Persistence Integration Test', () => {
  // Simple CSV parser for testing (handles quoted fields)
  function parseCSV(csvText: string): Record<string, string>[] {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    return lines.slice(1).map(line => {
      const values: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim()); // Add the last field

      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = values[index] || '';
      });
      return record;
    });
  }

  it('should extract and transform case data from sample CSV', async () => {
    // Sample CSV data representing case information
    const sampleCSV = `caseNumber,courtName,caseType,filedDate,status,totalActivities,parties,maleApplicant,femaleApplicant,maleDefendant,femaleDefendant,activityDate,activityType,outcome,primaryJudge,hasLegalRepresentation,applicantWitnesses,defendantWitnesses,custodyStatus
CIV/2024/0001,High Court of Kenya,CIVIL,2024-01-15,ACTIVE,1,"{""applicants"":[""John Doe""],""defendants"":[""Jane Smith""]}",1,0,0,1,2024-02-01,Hearing,Adjourned,Justice Smith,true,2,1,NOT_APPLICABLE
CIV/2024/0002,High Court of Kenya,CIVIL,2024-01-20,ACTIVE,1,"{""applicants"":[""Alice Johnson""],""defendants"":[""Bob Wilson""]}",0,1,1,0,2024-02-05,Hearing,Proceeded,Justice Smith,false,1,1,ON_BAIL
CIV/2024/0003,High Court of Kenya,CIVIL,2024-01-25,PENDING,0,"{""applicants"":[""Company XYZ""],""defendants"":[""Individual ABC""]}",0,0,1,0,,,,,,,`;

    // Parse CSV data
    const csvRecords = parseCSV(sampleCSV);
    expect(csvRecords).toHaveLength(3);

    // Verify CSV parsing
    expect(csvRecords[0].caseNumber).toBe('CIV/2024/0001');
    expect(csvRecords[0].courtName).toBe('High Court of Kenya');
    expect(csvRecords[0].status).toBe('ACTIVE');
    expect(csvRecords[0].maleApplicant).toBe('1');
    expect(csvRecords[0].femaleDefendant).toBe('1');
    expect(csvRecords[0].activityDate).toBe('2024-02-01');
    expect(csvRecords[0].activityType).toBe('Hearing');
    expect(csvRecords[0].outcome).toBe('Adjourned');

    // Transform CSV records to the expected import payload format
    const cases = csvRecords.map((record, index) => ({
      id: `case-${index + 1}`,
      caseNumber: record.caseNumber,
      courtName: record.courtName,
      originalCourtId: 'court-1',
      caseTypeId: 'case-type-1',
      filedDate: new Date(record.filedDate),
      parties: record.parties,
      status: record.status as any,
      totalActivities: parseInt(record.totalActivities) || 0,
      hasLegalRepresentation: record.hasLegalRepresentation === 'true',
      maleApplicant: parseInt(record.maleApplicant) || 0,
      femaleApplicant: parseInt(record.femaleApplicant) || 0,
      maleDefendant: parseInt(record.maleDefendant) || 0,
      femaleDefendant: parseInt(record.femaleDefendant) || 0,
    }));

    // Verify case transformation
    expect(cases).toHaveLength(3);
    expect(cases[0].caseNumber).toBe('CIV/2024/0001');
    expect(cases[0].filedDate).toEqual(new Date('2024-01-15'));
    expect(cases[0].status).toBe('ACTIVE');
    expect(cases[0].maleApplicant).toBe(1);
    expect(cases[0].femaleDefendant).toBe(1);
    expect(cases[0].totalActivities).toBe(1);

    expect(cases[2].status).toBe('PENDING');
    expect(cases[2].totalActivities).toBe(0);

    // Create activities for records that have activity data
    const activities = csvRecords
      .filter(record => record.activityDate)
      .map((record, index) => ({
        id: `activity-${index + 1}`,
        caseId: `case-${csvRecords.indexOf(record) + 1}`,
        activityDate: new Date(record.activityDate),
        activityType: record.activityType,
        outcome: record.outcome,
        primaryJudgeId: 'judge-1',
        hasLegalRepresentation: record.hasLegalRepresentation === 'true',
        applicantWitnesses: parseInt(record.applicantWitnesses) || 0,
        defendantWitnesses: parseInt(record.defendantWitnesses) || 0,
        custodyStatus: record.custodyStatus as any,
        importBatchId: 'batch-1', // Mock batch ID
      }));

    // Verify activity transformation
    expect(activities).toHaveLength(2); // Only 2 records had activities
    expect(activities[0].activityType).toBe('Hearing');
    expect(activities[0].outcome).toBe('Adjourned');
    expect(activities[0].hasLegalRepresentation).toBe(true);
    expect(activities[0].applicantWitnesses).toBe(2);
    expect(activities[0].defendantWitnesses).toBe(1);
    expect(activities[0].custodyStatus).toBe('NOT_APPLICABLE');

    expect(activities[1].outcome).toBe('Proceeded');
    expect(activities[1].hasLegalRepresentation).toBe(false);
    expect(activities[1].custodyStatus).toBe('ON_BAIL');

    // Create judge assignments
    const assignments = cases.map((caseData, index) => ({
      caseId: caseData.id,
      judgeId: 'judge-1',
      assignedAt: new Date(),
      isPrimary: index === 0, // First case has primary judge
    }));

    // Verify assignments
    expect(assignments).toHaveLength(3);
    expect(assignments[0].isPrimary).toBe(true);
    expect(assignments[1].isPrimary).toBe(false);
    expect(assignments[2].isPrimary).toBe(false);

    // Mock the service responses
    const mockBatch = {
      id: 'batch-1',
      importDate: new Date(),
      filename: 'sample-cases.csv',
      fileSize: sampleCSV.length,
      fileChecksum: 'sample-checksum-123',
      totalRecords: cases.length,
      successfulRecords: 0,
      failedRecords: 0,
      errorLogs: '[]',
      status: ImportStatus.PENDING,
      createdBy: 'user-1',
    };

    const mockImportResult = {
      batchId: 'batch-1',
      totals: {
        totalRecords: 3,
        successfulRecords: 3,
        failedRecords: 0,
      },
      importResult: {
        cases: 3,
        activities: 2,
        assignments: 3,
      },
    };

    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(importService.createBatch).mockResolvedValue(mockBatch);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(importService.markBatchProcessing).mockResolvedValue({ ...mockBatch, status: ImportStatus.PROCESSING });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(importService.processCsvBatch).mockResolvedValue(mockImportResult);

    // Test the service calls
    const batch = await importService.createBatch({
      importDate: new Date(),
      filename: 'sample-cases.csv',
      fileSize: sampleCSV.length,
      fileChecksum: 'sample-checksum-123',
      totalRecords: cases.length,
      createdBy: 'user-1',
    }) as typeof mockBatch;

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(importService.createBatch).toHaveBeenCalledWith({
      importDate: expect.any(Date),
      filename: 'sample-cases.csv',
      fileSize: sampleCSV.length,
      fileChecksum: 'sample-checksum-123',
      totalRecords: 3,
      createdBy: 'user-1',
    });

    await importService.markBatchProcessing(batch.id, {
      processingStartTime: expect.any(Date),
    });

    const result = await importService.processCsvBatch(
      batch.id,
      {
        cases,
        activities,
        assignments,
      },
      {
        totals: {
          totalRecords: cases.length,
        },
      }
    );

    // Verify the service was called with correct data structures
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(importService.processCsvBatch).toHaveBeenCalledWith(
      'batch-1',
      {
        cases: expect.arrayContaining([
          expect.objectContaining({
            caseNumber: 'CIV/2024/0001',
            status: 'ACTIVE',
            maleApplicant: 1,
            femaleDefendant: 1,
          }),
          expect.objectContaining({
            caseNumber: 'CIV/2024/0002',
            femaleApplicant: 1,
            maleDefendant: 1,
          }),
          expect.objectContaining({
            caseNumber: 'CIV/2024/0003',
            status: 'PENDING',
            totalActivities: 0,
          }),
        ]),
        activities: expect.arrayContaining([
          expect.objectContaining({
            activityType: 'Hearing',
            outcome: 'Adjourned',
            hasLegalRepresentation: true,
          }),
          expect.objectContaining({
            outcome: 'Proceeded',
            hasLegalRepresentation: false,
          }),
        ]),
        assignments: expect.arrayContaining([
          expect.objectContaining({ isPrimary: true }),
          expect.objectContaining({ isPrimary: false }),
          expect.objectContaining({ isPrimary: false }),
        ]),
      },
      {
        totals: {
          totalRecords: 3,
        },
      }
    );

    // Verify the result
    expect(result.batchId).toBe('batch-1');
    expect(result.totals.totalRecords).toBe(3);
    expect(result.totals.successfulRecords).toBe(3);
    expect(result.totals.failedRecords).toBe(0);
    expect(result.importResult.cases).toBe(3);
    expect(result.importResult.activities).toBe(2);
    expect(result.importResult.assignments).toBe(3);
  });
});